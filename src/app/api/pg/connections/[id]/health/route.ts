import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPgConfig } from '@/lib/pg/utils';
import { healthCheck } from '@/lib/pg/client';
import { db } from '@/db';
import { pgConnections } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * GET /api/pg/connections/[id]/health
 * 대상 PG DB 헬스 체크
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // 소유자 검증
    const [connection] = await db
      .select({ id: pgConnections.id })
      .from(pgConnections)
      .where(and(eq(pgConnections.id, id), eq(pgConnections.userId, session.user.id)))
      .limit(1);

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const config = await getPgConfig(id);
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

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      { success: false, data: { isHealthy: false, error: error.message, pgStatStatementsEnabled: false, responseTimeMs: 0 } },
      { status: 200 }
    );
  }
}
