import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
import { getPgConfig } from '@/lib/pg/utils';
import { collectSqlStats } from '@/lib/pg/collectors/sql-stats';
import { getLLMClient } from '@/lib/ai/client';
import { PG_SYSTEM_PROMPT } from '@/lib/ai/prompts/system';
import { buildAutoTuningPrompt } from '@/lib/ai/prompts/analysis';
import { db } from '@/db';
import { aiAnalysisHistory } from '@/db/schema';
import type { ChatMessage } from '@/lib/ai/types';

/**
 * POST /api/ai/auto-tuning
 * Top-N 쿼리 자동 분석 + 튜닝 권고 생성
 */
export async function POST(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const { connection_id, top_n = 5, order_by = 'total_exec_time' } = await request.json();

    if (!connection_id) {
      return NextResponse.json({ error: 'connection_id required' }, { status: 400 });
    }

    const config = await getPgConfig(connection_id, session.user.id);
    const topSql = await collectSqlStats(config, top_n, order_by);

    if (topSql.length === 0) {
      return NextResponse.json({
        success: true,
        data: { content: '분석할 SQL이 없습니다. pg_stat_statements가 활성화되어 있는지 확인하세요.', parsed: null },
      });
    }

    const prompt = buildAutoTuningPrompt(topSql as any);
    const messages: ChatMessage[] = [
      { role: 'system', content: PG_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const client = getLLMClient();
    const response = await client.chat(messages);

    let parsed = null;
    try {
      const jsonMatch = response.content.match(/```json\s*([\s\S]*?)```/) ||
                         response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
    } catch {}

    await db.insert(aiAnalysisHistory).values({
      connectionId: connection_id,
      analysisType: 'auto_tuning',
      request: { top_n, order_by, sql_count: topSql.length },
      response: { content: response.content, parsed },
      createdBy: session.user.id,
    });

    return NextResponse.json({
      success: true,
      data: { content: response.content, parsed, analyzedCount: topSql.length },
    });
  } catch (error) {
    return handlePgError(error, 'AutoTuning');
  }
}
