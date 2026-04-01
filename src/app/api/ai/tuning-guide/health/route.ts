import { NextResponse } from 'next/server';
import { getLLMClient } from '@/lib/ai/client';
import { getLLMConfig } from '@/lib/ai/config';

/**
 * GET /api/ai/tuning-guide/health
 * LLM 서버 상태 확인
 */
export async function GET() {
  try {
    const config = getLLMConfig();
    const client = getLLMClient();
    const startTime = Date.now();
    const health = await client.healthCheck();
    const latency = Date.now() - startTime;

    if (health.healthy) {
      return NextResponse.json({
        success: true,
        data: {
          model: config.modelName,
          latency,
        },
      });
    }

    return NextResponse.json({
      success: false,
      error: { message: health.error || 'LLM 서버 연결 실패' },
      config: { modelName: config.modelName },
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: { message: error.message },
    });
  }
}
