import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPgConfig } from '@/lib/pg/utils';
import { executeQuery } from '@/lib/pg';

export const dynamic = 'force-dynamic';

/**
 * GET /api/statistics/top-sql-trend?connection_id=...&order_by=total_exec_time&limit=20&group_by=all
 * Top SQL 트렌드 - pg_stat_statements 기반 (WhaTap Top SQL 스타일)
 * group_by: all | db | user | host | application
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

    const orderBy = request.nextUrl.searchParams.get('order_by') || 'total_exec_time';
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || '20'), 100);
    const groupBy = request.nextUrl.searchParams.get('group_by') || 'all';
    const config = await getPgConfig(connectionId);

    // pg_stat_statements 확장 확인
    try {
      await executeQuery(config, 'SELECT 1 FROM pg_stat_statements LIMIT 1');
    } catch {
      return NextResponse.json({
        success: false,
        error: 'pg_stat_statements 확장이 설치되어 있지 않습니다. CREATE EXTENSION pg_stat_statements; 실행 후 PostgreSQL 재시작이 필요합니다.',
      }, { status: 400 });
    }

    // 허용된 정렬 컬럼
    const allowedOrders: Record<string, string> = {
      total_exec_time: 'total_exec_time DESC',
      calls: 'calls DESC',
      mean_exec_time: 'mean_exec_time DESC',
      max_exec_time: 'max_exec_time DESC',
      shared_blks_read: 'shared_blks_read DESC',
      rows: 'rows DESC',
      total_plan_time: 'total_plan_time DESC',
    };
    const orderClause = allowedOrders[orderBy] || 'total_exec_time DESC';

    if (groupBy === 'all') {
      const result = await executeQuery<{
        queryid: string;
        query: string;
        dbid: number;
        userid: number;
        calls: number;
        total_exec_time: number;
        mean_exec_time: number;
        max_exec_time: number;
        min_exec_time: number;
        stddev_exec_time: number;
        rows: number;
        shared_blks_hit: number;
        shared_blks_read: number;
        local_blks_hit: number;
        local_blks_read: number;
        temp_blks_read: number;
        temp_blks_written: number;
        blk_read_time: number;
        blk_write_time: number;
        total_plan_time: number;
        mean_plan_time: number;
      }>(config, `
        SELECT
          queryid::text,
          query,
          dbid::int,
          userid::int,
          calls::bigint,
          total_exec_time::float,
          mean_exec_time::float,
          max_exec_time::float,
          min_exec_time::float,
          stddev_exec_time::float,
          rows::bigint,
          shared_blks_hit::bigint,
          shared_blks_read::bigint,
          local_blks_hit::bigint,
          local_blks_read::bigint,
          temp_blks_read::bigint,
          temp_blks_written::bigint,
          blk_read_time::float,
          blk_write_time::float,
          COALESCE(total_plan_time, 0)::float AS total_plan_time,
          COALESCE(mean_plan_time, 0)::float AS mean_plan_time
        FROM pg_stat_statements
        WHERE query NOT LIKE '%pg_stat_statements%'
        ORDER BY ${orderClause}
        LIMIT $1
      `, [limit]);

      return NextResponse.json({
        success: true,
        data: result.rows,
        meta: { orderBy, limit, groupBy, total: result.rows.length },
        timestamp: new Date().toISOString(),
      });
    }

    // 그룹별 집계
    let groupColumn = '';
    let groupJoin = '';
    switch (groupBy) {
      case 'db':
        groupColumn = 'd.datname AS group_name';
        groupJoin = 'JOIN pg_database d ON s.dbid = d.oid';
        break;
      case 'user':
        groupColumn = 'r.rolname AS group_name';
        groupJoin = 'JOIN pg_roles r ON s.userid = r.oid';
        break;
      default:
        groupColumn = `'all' AS group_name`;
        groupJoin = '';
    }

    const groupResult = await executeQuery<{
      group_name: string;
      total_calls: number;
      total_exec_time: number;
      avg_exec_time: number;
      query_count: number;
    }>(config, `
      SELECT ${groupColumn},
        SUM(s.calls)::bigint AS total_calls,
        SUM(s.total_exec_time)::float AS total_exec_time,
        AVG(s.mean_exec_time)::float AS avg_exec_time,
        COUNT(*)::int AS query_count
      FROM pg_stat_statements s
      ${groupJoin}
      WHERE s.query NOT LIKE '%pg_stat_statements%'
      GROUP BY group_name
      ORDER BY total_exec_time DESC
      LIMIT $1
    `, [limit]);

    return NextResponse.json({
      success: true,
      data: groupResult.rows,
      meta: { orderBy, limit, groupBy, total: groupResult.rows.length },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
