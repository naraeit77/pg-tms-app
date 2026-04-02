import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
import { getPgConfig } from '@/lib/pg/utils';
import { executeQuery } from '@/lib/pg/client';
import { collectSqlStats } from '@/lib/pg/collectors/sql-stats';
import { collectTableStats, collectIndexStats } from '@/lib/pg/collectors/table-stats';
import { getLLMClient } from '@/lib/ai/client';
import { PG_SYSTEM_PROMPT } from '@/lib/ai/prompts/system';
import { buildIndexAdvisorPrompt } from '@/lib/ai/prompts/analysis';
import { db } from '@/db';
import { aiAnalysisHistory } from '@/db/schema';
import type { ChatMessage } from '@/lib/ai/types';

/**
 * POST /api/ai/index-advisor
 * AI 인덱스 추천
 */
export async function POST(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const { connection_id } = await request.json();
    if (!connection_id) {
      return NextResponse.json({ error: 'connection_id required' }, { status: 400 });
    }

    const config = await getPgConfig(connection_id, session.user.id);

    // 데이터 수집
    const [tableStats, indexStats, topSql] = await Promise.all([
      collectTableStats(config),
      collectIndexStats(config),
      collectSqlStats(config, 20, 'total_exec_time'),
    ]);

    // 높은 seq_scan 테이블
    const highSeqScanTables = tableStats
      .filter((t) => t.seq_scan > 100 && t.live_tuples > 1000)
      .slice(0, 10)
      .map((t) => `${t.schema_name}.${t.table_name}: seq_scan=${t.seq_scan}, idx_scan=${t.idx_scan}, rows=${t.live_tuples}`)
      .join('\n');

    // Top 쿼리 요약
    const topQueriesSummary = topSql.slice(0, 10)
      .map((s) => `queryid=${s.queryid}: ${s.query?.substring(0, 150)} (calls=${s.calls}, time=${s.total_exec_time?.toFixed(0)}ms)`)
      .join('\n');

    // 기존 인덱스
    const existingIndexes = indexStats.slice(0, 30)
      .map((i) => `${i.schema_name}.${i.table_name}.${i.index_name}: scans=${i.idx_scan}, size=${i.index_size}`)
      .join('\n');

    const prompt = buildIndexAdvisorPrompt(
      highSeqScanTables || '(높은 seq_scan 테이블 없음)',
      topQueriesSummary || '(Top SQL 없음)',
      existingIndexes || '(인덱스 없음)'
    );

    const messages: ChatMessage[] = [
      { role: 'system', content: PG_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const client = getLLMClient();
    const response = await client.chat(messages);

    let parsed = null;
    try {
      const jsonMatch = response.content.match(/```json\s*([\s\S]*?)```/) ||
                         response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
    } catch {}

    await db.insert(aiAnalysisHistory).values({
      connectionId: connection_id,
      analysisType: 'index_advisor',
      request: { tableCount: tableStats.length, indexCount: indexStats.length, topSqlCount: topSql.length },
      response: { content: response.content, parsed },
      createdBy: session.user.id,
    });

    return NextResponse.json({
      success: true,
      data: { content: response.content, parsed },
    });
  } catch (error) {
    return handlePgError(error, 'IndexAdvisor');
  }
}
