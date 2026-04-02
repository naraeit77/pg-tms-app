import { NextRequest } from 'next/server';
import { getPgConfig } from '@/lib/pg/utils';
import { healthCheck } from '@/lib/pg/client';
import { db } from '@/db';
import { pgConnections } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  requireSession,
  verifyConnectionOwnership,
  apiSuccess,
  handlePgError,
} from '@/lib/api-utils';

/**
 * GET /api/pg/connections/[id]/health
 * 대상 PG DB 헬스 체크
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, errorResponse: authError } = await requireSession();
    if (authError) return authError;

    const { id } = await params;

    const { errorResponse: ownerError } = await verifyConnectionOwnership(id, session.user.id);
    if (ownerError) return ownerError;

    const config = await getPgConfig(id, session.user.id);
    const result = await healthCheck(config);

    // DB에 헬스 체크 결과 업데이트
    await db
      .update(pgConnections)
      .set({
        healthStatus: result.isHealthy ? 'HEALTHY' : 'ERROR',
        pgVersion: result.version || null,
        pgStatStatementsEnabled: result.pgStatStatementsEnabled,
        lastHealthCheckAt: new Date(),
        ...(result.isHealthy ? { lastConnectedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(pgConnections.id, id), eq(pgConnections.userId, session.user.id)));

    return apiSuccess(result);
  } catch (error) {
    // 헬스체크는 실패해도 200으로 결과를 반환 (기존 동작 유지)
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Health check failed:', message);
    return apiSuccess({
      isHealthy: false,
      error: message,
      pgStatStatementsEnabled: false,
      responseTimeMs: 0,
    });
  }
}
