import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
import { getPgConfig } from '@/lib/pg/utils';
import { collectGlobalStats } from '@/lib/pg/collectors/global-stats';
import { collectSqlStats } from '@/lib/pg/collectors/sql-stats';
import { getLLMClient } from '@/lib/ai/client';
import { PG_SYSTEM_PROMPT } from '@/lib/ai/prompts/system';
import { db } from '@/db';
import { aiAnalysisHistory } from '@/db/schema';
import type { ChatMessage } from '@/lib/ai/types';

/**
 * POST /api/ai/report-gen
 * AI 자동 보고서 생성
 */
export async function POST(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const { connection_id } = await request.json();
    if (!connection_id) return NextResponse.json({ error: 'connection_id required' }, { status: 400 });

    const config = await getPgConfig(connection_id, session.user.id);
    const [globalStats, topSql] = await Promise.all([
      collectGlobalStats(config),
      collectSqlStats(config, 10, 'total_exec_time'),
    ]);

    const topSqlSummary = topSql.map((s, i) =>
      `${i + 1}. queryid=${s.queryid} | calls=${s.calls} | mean=${s.mean_exec_time?.toFixed(2)}ms | blks_read=${s.shared_blks_read} | ${s.query?.substring(0, 100)}`
    ).join('\n');

    const prompt = `다음 PostgreSQL 데이터베이스의 성능 보고서를 한국어로 작성해주세요.

## 글로벌 통계
- Cache Hit Ratio: ${globalStats.cache_hit_ratio}%
- Active Backends: ${globalStats.active_backends}
- Total Connections: ${globalStats.total_connections}
- Transactions Committed: ${globalStats.tx_committed?.toLocaleString()}
- Transactions Rolled Back: ${globalStats.tx_rolled_back?.toLocaleString()}
- Deadlocks: ${globalStats.deadlocks}
- Temp Bytes: ${globalStats.temp_bytes?.toLocaleString()}
- DB Size: ${globalStats.db_size?.toLocaleString()} bytes

## Top 10 SQL (Total Exec Time 순)
${topSqlSummary}

## 보고서 형식
1. 전체 요약 (2-3줄)
2. 주요 성능 지표 평가
3. Top SQL 분석 및 개선 포인트
4. 권고사항 (우선순위별)
5. 결론`;

    const messages: ChatMessage[] = [
      { role: 'system', content: PG_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const client = getLLMClient();
    const response = await client.chat(messages);

    await db.insert(aiAnalysisHistory).values({
      connectionId: connection_id,
      analysisType: 'report_generation',
      request: { globalStats, topSqlCount: topSql.length },
      response: { content: response.content },
      createdBy: session.user.id,
    });

    return NextResponse.json({ success: true, data: { content: response.content } });
  } catch (error) {
    return handlePgError(error, 'ReportGen');
  }
}
