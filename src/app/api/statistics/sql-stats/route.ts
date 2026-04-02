import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
import { getPgConfig } from '@/lib/pg/utils';
import { executeQuery } from '@/lib/pg';

export const dynamic = 'force-dynamic';

/**
 * GET /api/statistics/sql-stats?connection_id=...
 * pg_stat_statements 집계 통계 (WhaTap PG SQL 통계 스타일)
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

    // pg_stat_statements 확장 확인
    try {
      await executeQuery(config, 'SELECT 1 FROM pg_stat_statements LIMIT 1');
    } catch {
      return NextResponse.json({
        success: false,
        error: 'pg_stat_statements 확장이 설치되어 있지 않습니다. CREATE EXTENSION pg_stat_statements; 실행 후 PostgreSQL 재시작이 필요합니다.',
      }, { status: 400 });
    }

    const [summary, topByTime, topByCalls, topByRows] = await Promise.all([
      // 전체 요약
      executeQuery<{
        total_queries: number;
        total_calls: number;
        total_exec_time_sec: number;
        avg_exec_time_ms: number;
        total_rows: number;
        total_shared_blks_hit: number;
        total_shared_blks_read: number;
        cache_hit_ratio: number;
      }>(config, `
        SELECT
          COUNT(*)::int AS total_queries,
          SUM(calls)::bigint AS total_calls,
          (SUM(total_exec_time) / 1000)::float AS total_exec_time_sec,
          AVG(mean_exec_time)::float AS avg_exec_time_ms,
          SUM(rows)::bigint AS total_rows,
          SUM(shared_blks_hit)::bigint AS total_shared_blks_hit,
          SUM(shared_blks_read)::bigint AS total_shared_blks_read,
          CASE WHEN SUM(shared_blks_hit) + SUM(shared_blks_read) > 0
            THEN ROUND(SUM(shared_blks_hit)::numeric / (SUM(shared_blks_hit) + SUM(shared_blks_read)) * 100, 2)::float
            ELSE 100 END AS cache_hit_ratio
        FROM pg_stat_statements
        WHERE query NOT LIKE '%pg_stat_statements%'
      `),

      // Top 10 by total_exec_time
      executeQuery(config, `
        SELECT queryid::text, LEFT(query, 200) AS query, calls::bigint,
          total_exec_time::float, mean_exec_time::float, rows::bigint
        FROM pg_stat_statements
        WHERE query NOT LIKE '%pg_stat_statements%'
        ORDER BY total_exec_time DESC LIMIT 10
      `),

      // Top 10 by calls
      executeQuery(config, `
        SELECT queryid::text, LEFT(query, 200) AS query, calls::bigint,
          total_exec_time::float, mean_exec_time::float, rows::bigint
        FROM pg_stat_statements
        WHERE query NOT LIKE '%pg_stat_statements%'
        ORDER BY calls DESC LIMIT 10
      `),

      // Top 10 by rows
      executeQuery(config, `
        SELECT queryid::text, LEFT(query, 200) AS query, calls::bigint,
          total_exec_time::float, mean_exec_time::float, rows::bigint
        FROM pg_stat_statements
        WHERE query NOT LIKE '%pg_stat_statements%'
        ORDER BY rows DESC LIMIT 10
      `),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        summary: summary.rows[0] || {},
        topByTime: topByTime.rows,
        topByCalls: topByCalls.rows,
        topByRows: topByRows.rows,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return handlePgError(error, 'SqlStats');
  }
}
