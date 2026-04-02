import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
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
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const connectionId = request.nextUrl.searchParams.get('connection_id');
    if (!connectionId) {
      return NextResponse.json({ error: 'connection_id required' }, { status: 400 });
    }

    const config = await getPgConfig(connectionId, session.user.id);

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
  } catch (error) {
    return handlePgError(error, 'Realtime monitoring');
  }
}
