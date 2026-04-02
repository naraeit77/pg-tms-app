import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-utils';
import { db } from '@/db';
import { pgTmsSnapshots } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getLLMClient } from '@/lib/ai/client';
import { PG_SYSTEM_PROMPT } from '@/lib/ai/prompts/system';
import type { ChatMessage } from '@/lib/ai/types';

/**
 * POST /api/ai/prediction
 * 성능 예측: 스냅샷 트렌드 분석 → LLM 예측
 */
export async function POST(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const { connection_id } = await request.json();
    if (!connection_id) return NextResponse.json({ error: 'connection_id required' }, { status: 400 });

    const snapshots = await db.select().from(pgTmsSnapshots)
      .where(eq(pgTmsSnapshots.connectionId, connection_id))
      .orderBy(desc(pgTmsSnapshots.createdAt))
      .limit(20);

    if (snapshots.length < 3) {
      return NextResponse.json({
        success: true,
        data: { content: '성능 예측을 위해 최소 3개 이상의 스냅샷이 필요합니다.', trends: null },
      });
    }

    // 트렌드 계산
    const reversed = [...snapshots].reverse();
    const trends = {
      cacheHitRatio: reversed.map((s) => ({ time: s.createdAt, value: s.cacheHitRatio })),
      activeBackends: reversed.map((s) => ({ time: s.createdAt, value: s.activeBackends })),
      deadlocks: reversed.map((s) => ({ time: s.createdAt, value: s.deadlocks })),
      txCommitted: reversed.map((s) => ({ time: s.createdAt, value: s.txCommitted })),
    };

    const trendSummary = `
- Cache Hit Ratio 추이: ${reversed.map((s) => s.cacheHitRatio?.toFixed(1)).join(' → ')}%
- Active Backends 추이: ${reversed.map((s) => s.activeBackends).join(' → ')}
- Deadlocks 추이: ${reversed.map((s) => s.deadlocks).join(' → ')}
- Tx Committed 추이: ${reversed.map((s) => s.txCommitted?.toLocaleString()).join(' → ')}`;

    const prompt = `다음 PostgreSQL 데이터베이스의 성능 트렌드를 분석하고, 향후 성능을 예측해주세요.

## 최근 ${snapshots.length}개 스냅샷 트렌드
${trendSummary}

## 요청
1. 각 메트릭의 트렌드 분석 (상승/하락/안정)
2. 문제 예측 (어떤 메트릭이 위험 수준에 도달할 가능성이 있는지)
3. 예방 조치 권고
4. 용량 계획 제안`;

    const messages: ChatMessage[] = [
      { role: 'system', content: PG_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const client = getLLMClient();
    const response = await client.chat(messages);

    return NextResponse.json({
      success: true,
      data: { content: response.content, trends, snapshotCount: snapshots.length },
    });
  } catch (error) {
    console.error('[Prediction]', error);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
