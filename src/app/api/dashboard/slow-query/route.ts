import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
import { getPgConfig } from '@/lib/pg/utils';
import { executeQuery } from '@/lib/pg';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/slow-query?connection_id=...&threshold_ms=1000
 * 슬로우 쿼리 스캐터 데이터 (WhaTap slow-query 스타일)
 * 현재 활성 세션 중 실행시간이 threshold 이상인 쿼리 목록
 */
export async function GET(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const connectionId = request.nextUrl.searchParams.get('connection_id');
    if (!connectionId) {
      return NextResponse.json({ error: 'connection_id required' }, { status: 400 });
    }

    const thresholdMs = Number(request.nextUrl.searchParams.get('threshold_ms') || '100');
    const config = await getPgConfig(connectionId, session.user.id);

    // 현재 활성 세션에서 느린 쿼리 추출 + pg_stat_statements에서 과거 슬로우 쿼리 보완
    const [activeSlow, statsSlow] = await Promise.all([
      executeQuery<{
        pid: number;
        usename: string;
        datname: string;
        query: string;
        state: string;
        duration_ms: number;
        wait_event_type: string | null;
        wait_event: string | null;
        query_start: string;
        client_addr: string | null;
        application_name: string;
      }>(
        config,
        `SELECT
          pid,
          usename,
          datname,
          query,
          state,
          EXTRACT(EPOCH FROM (clock_timestamp() - query_start))::float * 1000 AS duration_ms,
          wait_event_type,
          wait_event,
          query_start::text,
          client_addr::text,
          application_name
        FROM pg_stat_activity
        WHERE state = 'active'
          AND pid != pg_backend_pid()
          AND query NOT LIKE '%pg_stat_activity%'
          AND EXTRACT(EPOCH FROM (clock_timestamp() - query_start))::float * 1000 >= $1
        ORDER BY duration_ms DESC
        LIMIT 200`,
        [thresholdMs]
      ).catch(() => ({ rows: [] })),

      // pg_stat_statements에서 평균 실행시간이 느린 쿼리 (히스토리 보완)
      executeQuery<{
        queryid: string;
        query: string;
        calls: number;
        mean_exec_time_ms: number;
        max_exec_time_ms: number;
        total_exec_time_ms: number;
      }>(
        config,
        `SELECT
          queryid::text,
          query,
          calls::int,
          mean_exec_time::float AS mean_exec_time_ms,
          max_exec_time::float AS max_exec_time_ms,
          total_exec_time::float AS total_exec_time_ms
        FROM pg_stat_statements
        WHERE mean_exec_time >= $1
          AND query NOT LIKE '%pg_stat_statements%'
        ORDER BY mean_exec_time DESC
        LIMIT 50`,
        [thresholdMs]
      ).catch(() => ({ rows: [] })),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        active: activeSlow.rows.map((r) => ({
          type: 'active' as const,
          pid: r.pid,
          user: r.usename,
          database: r.datname,
          query: r.query?.substring(0, 500),
          durationMs: r.duration_ms,
          waitEventType: r.wait_event_type,
          waitEvent: r.wait_event,
          queryStart: r.query_start,
          clientAddr: r.client_addr,
          applicationName: r.application_name,
        })),
        historical: statsSlow.rows.map((r) => ({
          type: 'historical' as const,
          queryId: r.queryid,
          query: r.query?.substring(0, 500),
          calls: r.calls,
          meanExecTimeMs: r.mean_exec_time_ms,
          maxExecTimeMs: r.max_exec_time_ms,
          totalExecTimeMs: r.total_exec_time_ms,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return handlePgError(error, 'SlowQuery');
  }
}
