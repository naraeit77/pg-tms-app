import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-utils';
import { db } from '@/db';
import { pgTmsSnapshots, aiAnalysisHistory } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getLLMClient } from '@/lib/ai/client';
import { PG_SYSTEM_PROMPT } from '@/lib/ai/prompts/system';
import type { ChatMessage } from '@/lib/ai/types';

/**
 * POST /api/ai/anomaly
 * 이상 탐지: 스냅샷 히스토리 기반 이동평균/표준편차 → LLM 원인 분석
 */
export async function POST(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const { connection_id } = await request.json();
    if (!connection_id) return NextResponse.json({ error: 'connection_id required' }, { status: 400 });

    // 최근 30개 스냅샷 조회
    const snapshots = await db.select().from(pgTmsSnapshots)
      .where(eq(pgTmsSnapshots.connectionId, connection_id))
      .orderBy(desc(pgTmsSnapshots.createdAt))
      .limit(30);

    if (snapshots.length < 5) {
      return NextResponse.json({
        success: true,
        data: { anomalies: [], message: '이상 탐지를 위해 최소 5개 이상의 스냅샷이 필요합니다.' },
      });
    }

    // 메트릭별 이동평균 + 표준편차 계산
    const metrics = ['activeBackends', 'cacheHitRatio', 'deadlocks', 'txRolledBack'] as const;
    const anomalies: Array<{ metric: string; current: number; mean: number; stddev: number; zScore: number; severity: string }> = [];

    const latest = snapshots[0];
    const historicals = snapshots.slice(1);

    for (const metric of metrics) {
      const values = historicals.map((s) => Number(s[metric]) || 0).filter((v) => !isNaN(v));
      if (values.length < 3) continue;

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const stddev = Math.sqrt(variance);

      if (stddev === 0) continue;

      const current = Number(latest[metric]) || 0;
      const zScore = Math.abs((current - mean) / stddev);

      if (zScore > 2) {
        anomalies.push({
          metric,
          current,
          mean: parseFloat(mean.toFixed(2)),
          stddev: parseFloat(stddev.toFixed(2)),
          zScore: parseFloat(zScore.toFixed(2)),
          severity: zScore > 3 ? 'CRITICAL' : 'WARNING',
        });
      }
    }

    // LLM 원인 분석
    let aiAnalysis = '';
    if (anomalies.length > 0) {
      const anomalySummary = anomalies.map((a) =>
        `- ${a.metric}: 현재값=${a.current}, 평균=${a.mean}, 표준편차=${a.stddev}, Z-Score=${a.zScore} (${a.severity})`
      ).join('\n');

      const prompt = `다음 PostgreSQL 이상 탐지 결과를 분석하고 원인과 조치 방안을 제시해주세요.

## 감지된 이상
${anomalySummary}

## 최근 스냅샷 정보
- Cache Hit Ratio: ${latest.cacheHitRatio}%
- Active Backends: ${latest.activeBackends}
- Deadlocks: ${latest.deadlocks}
- Tx Rolled Back: ${latest.txRolledBack}
- Temp Bytes: ${latest.tempBytes}

## 요청
1. 각 이상의 가능한 원인
2. 즉시 조치 방안
3. 장기적 개선 권고`;

      const messages: ChatMessage[] = [
        { role: 'system', content: PG_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ];

      const client = getLLMClient();
      const response = await client.chat(messages);
      aiAnalysis = response.content;

      await db.insert(aiAnalysisHistory).values({
        connectionId: connection_id,
        analysisType: 'anomaly_detection',
        request: { anomalies, snapshotCount: snapshots.length },
        response: { content: aiAnalysis, anomalies },
        createdBy: session.user.id,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        anomalies,
        aiAnalysis,
        snapshotCount: snapshots.length,
        latestSnapshot: {
          id: latest.id,
          createdAt: latest.createdAt,
          cacheHitRatio: latest.cacheHitRatio,
          activeBackends: latest.activeBackends,
          deadlocks: latest.deadlocks,
        },
      },
    });
  } catch (error) {
    console.error('[AnomalyDetection]', error);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
