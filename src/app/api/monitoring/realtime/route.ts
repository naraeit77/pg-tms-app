import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPgConfig } from '@/lib/pg/utils';
import { collectGlobalStats } from '@/lib/pg/collectors/global-stats';
import { collectSessions } from '@/lib/pg/collectors/sessions';
import { collectWaitEvents } from '@/lib/pg/collectors/wait-events';

export const dynamic = 'force-dynamic';

/**
 * GET /api/monitoring/realtime?connection_id=...
 * 실시간 모니터링 데이터 (TPS, Active Backends, Cache Hit, Wait Events)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const connectionId = request.nextUrl.searchParams.get('connection_id');
    if (!connectionId) {
      return NextResponse.json({ error: 'connection_id required' }, { status: 400 });
    }

    const config = await getPgConfig(connectionId);

    const [globalStats, sessions, waitEvents] = await Promise.all([
      collectGlobalStats(config),
      collectSessions(config),
      collectWaitEvents(config),
    ]);

    const activeSessions = sessions.filter((s) => s.state === 'active');
    const idleInTx = sessions.filter((s) => s.state === 'idle in transaction');

    return NextResponse.json({
      success: true,
      data: {
        global: globalStats,
        activeSessionCount: activeSessions.length,
        idleInTxCount: idleInTx.length,
        totalSessionCount: sessions.length,
        topWaitEvents: waitEvents.slice(0, 10),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Realtime monitoring error:', error?.message || error);

    const isConnectionError =
      error?.message?.includes('Connection not found') ||
      error?.message?.includes('inactive') ||
      error?.message?.includes('ECONNREFUSED') ||
      error?.message?.includes('timeout') ||
      error?.message?.includes('ENOTFOUND') ||
      error?.message?.includes('복호화');

    return NextResponse.json(
      {
        error: error.message || 'Internal server error',
        code: isConnectionError ? 'CONNECTION_ERROR' : 'QUERY_ERROR',
      },
      { status: isConnectionError ? 503 : 500 }
    );
  }
}
