import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
import { getPgConfig } from '@/lib/pg/utils';
import { collectSessions } from '@/lib/pg/collectors/sessions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analysis/session-history?connection_id=...
 * 현재 세션 스냅샷 (활성/대기 분류) - WhaTap 세션 히스토리 스타일
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
    const sessions = await collectSessions(config);

    const active = sessions.filter((s) => s.state === 'active');
    const lockWait = sessions.filter((s) => s.wait_event_type === 'Lock');
    const idle = sessions.filter((s) => s.state === 'idle');
    const idleInTx = sessions.filter((s) => s.state === 'idle in transaction');

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          active: active.length,
          lockWait: lockWait.length,
          idle: idle.length,
          idleInTransaction: idleInTx.length,
          total: sessions.length,
        },
        sessions: sessions.map((s: any) => ({
          pid: s.pid,
          usename: s.usename,
          datname: s.datname,
          application_name: s.application_name,
          client_addr: s.client_addr,
          state: s.state,
          wait_event_type: s.wait_event_type,
          wait_event: s.wait_event,
          query: s.query?.substring(0, 500),
          query_start: s.query_start,
          query_duration_ms: s.query_duration_ms,
          backend_start: s.backend_start,
          xact_start: s.xact_start,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return handlePgError(error, 'Session history');
  }
}
