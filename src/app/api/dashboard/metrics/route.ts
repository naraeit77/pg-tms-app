import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
import { getPgConfig } from '@/lib/pg/utils';
import { executeQuery } from '@/lib/pg';
import { collectGlobalStats } from '@/lib/pg/collectors/global-stats';
import { collectSessions } from '@/lib/pg/collectors/sessions';
import { collectWaitEvents } from '@/lib/pg/collectors/wait-events';
import { collectSqlStats } from '@/lib/pg/collectors/sql-stats';
import { collectLocks } from '@/lib/pg/collectors/locks';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/metrics?connection_id=...
 * 대시보드 종합 메트릭 (Global Stats, Sessions, Wait Events, Top SQL, Locks)
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

    // 모든 수집기를 병렬 실행, pg_stat_statements 미설치 시 Top SQL은 빈 배열
    const [globalStats, sessions, waitEvents, topSql, locks] = await Promise.all([
      collectGlobalStats(config),
      collectSessions(config),
      collectWaitEvents(config),
      collectSqlStats(config, 10, 'total_exec_time').catch((err) => {
        console.warn('[Dashboard] collectSqlStats failed:', err.message);
        return [];
      }),
      collectLocks(config),
    ]);

    // pg_stat_statements 상태 판단
    let pgssStatus: 'enabled' | 'no_data' | 'not_installed' = 'not_installed';
    if (topSql.length > 0) {
      pgssStatus = 'enabled';
    } else {
      // topSql이 비어있는 이유: 확장 미설치 or 데이터 없음
      try {
        await executeQuery(config, 'SELECT 1 FROM pg_stat_statements LIMIT 1');
        pgssStatus = 'no_data';
      } catch {
        pgssStatus = 'not_installed';
      }
    }

    // Additional metrics: replication delay, vacuum sessions
    const [replicationResult, vacuumResult] = await Promise.all([
      executeQuery<{ delay_sec: number }>(
        config,
        `SELECT COALESCE(MAX(EXTRACT(EPOCH FROM replay_lag)), 0)::float AS delay_sec FROM pg_stat_replication`
      ).catch(() => ({ rows: [{ delay_sec: 0 }] })),
      executeQuery<{ count: number }>(
        config,
        `SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE backend_type = 'autovacuum worker'`
      ).catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    const activeSessions = sessions.filter((s) => s.state === 'active');
    const idleSessions = sessions.filter((s) => s.state === 'idle');
    const idleInTxSessions = sessions.filter((s) => s.state === 'idle in transaction');
    const blockedSessions = locks.filter((l) => !l.granted && l.blocking_pid);

    // Uptime
    const uptimeResult = await executeQuery<{ uptime_sec: number }>(
      config,
      `SELECT EXTRACT(EPOCH FROM (current_timestamp - pg_postmaster_start_time()))::float AS uptime_sec`
    ).catch(() => ({ rows: [{ uptime_sec: 0 }] }));

    // Long waiting session breakdown (WhaTap style: 5s/10s/60s bands)
    const longWaitingSessions = {
      under5s: blockedSessions.filter(
        (l: any) => l.query_duration_ms != null && l.query_duration_ms < 5000
      ).length,
      s5to10: blockedSessions.filter(
        (l: any) => l.query_duration_ms != null && l.query_duration_ms >= 5000 && l.query_duration_ms < 10000
      ).length,
      s10to60: blockedSessions.filter(
        (l: any) => l.query_duration_ms != null && l.query_duration_ms >= 10000 && l.query_duration_ms < 60000
      ).length,
      over60s: blockedSessions.filter(
        (l: any) => l.query_duration_ms != null && l.query_duration_ms >= 60000
      ).length,
    };

    // Long active session breakdown (WhaTap style duration bands)
    const longActiveSessions = {
      under3s: activeSessions.filter(
        (s: any) => s.query_duration_ms != null && s.query_duration_ms < 3000
      ).length,
      s3to10: activeSessions.filter(
        (s: any) => s.query_duration_ms != null && s.query_duration_ms >= 3000 && s.query_duration_ms < 10000
      ).length,
      s10to15: activeSessions.filter(
        (s: any) => s.query_duration_ms != null && s.query_duration_ms >= 10000 && s.query_duration_ms < 15000
      ).length,
      over15s: activeSessions.filter(
        (s: any) => s.query_duration_ms != null && s.query_duration_ms >= 15000
      ).length,
    };

    return NextResponse.json({
      success: true,
      data: {
        global: globalStats,
        sessions: {
          active: activeSessions.length,
          idle: idleSessions.length,
          idleInTx: idleInTxSessions.length,
          total: sessions.length,
          activeSessions: activeSessions.slice(0, 20),
        },
        waitEvents: waitEvents.slice(0, 15),
        topSql: topSql.slice(0, 15),
        pgssStatus,
        blockedSessions: blockedSessions.map((l) => ({
          pid: l.pid,
          usename: l.usename,
          waitEvent: l.wait_event || l.mode,
          waitDurationMs: l.query_duration_ms,
          blockingPid: l.blocking_pid,
          query: l.query?.substring(0, 200),
        })),
        timestamp: new Date().toISOString(),
        slow_query_count: activeSessions.filter(
          (s: any) => s.query_duration_ms != null && Number(s.query_duration_ms) > 1000
        ).length,
        replication_delay_sec: Number(replicationResult.rows[0]?.delay_sec) || 0,
        vacuum_sessions: Number(vacuumResult.rows[0]?.count) || 0,
        long_active_sessions: longActiveSessions,
        long_waiting_sessions: longWaitingSessions,
        uptime_sec: Number(uptimeResult.rows[0]?.uptime_sec) || 0,
      },
    });
  } catch (error) {
    return handlePgError(error, 'DashboardMetrics');
  }
}
