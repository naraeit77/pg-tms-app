import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPgConfig } from '@/lib/pg/utils';
import { executeQuery } from '@/lib/pg';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analysis/lock-tree?connection_id=...
 * 계층적 Lock Holder/Waiter 관계 데이터 (WhaTap 락 트리 스타일)
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

    // 계층적 락 트리: holder → waiter 관계
    const lockTree = await executeQuery<{
      blocked_pid: number;
      blocked_user: string;
      blocked_query: string;
      blocked_duration_ms: number;
      blocked_lock_mode: string;
      blocked_relation: string | null;
      blocking_pid: number;
      blocking_user: string;
      blocking_query: string;
      blocking_duration_ms: number;
      blocking_state: string;
    }>(
      config,
      `WITH RECURSIVE lock_chain AS (
        SELECT
          blocked.pid AS blocked_pid,
          blocked_activity.usename AS blocked_user,
          blocked_activity.query AS blocked_query,
          EXTRACT(EPOCH FROM (now() - blocked_activity.query_start))::float * 1000 AS blocked_duration_ms,
          blocked.mode AS blocked_lock_mode,
          CASE WHEN blocked.relation IS NOT NULL THEN blocked.relation::regclass::text ELSE NULL END AS blocked_relation,
          blocking.pid AS blocking_pid,
          blocking_activity.usename AS blocking_user,
          blocking_activity.query AS blocking_query,
          EXTRACT(EPOCH FROM (now() - blocking_activity.query_start))::float * 1000 AS blocking_duration_ms,
          blocking_activity.state AS blocking_state
        FROM pg_locks blocked
        JOIN pg_stat_activity blocked_activity ON blocked.pid = blocked_activity.pid
        JOIN pg_locks blocking ON blocking.locktype = blocked.locktype
          AND blocking.database IS NOT DISTINCT FROM blocked.database
          AND blocking.relation IS NOT DISTINCT FROM blocked.relation
          AND blocking.page IS NOT DISTINCT FROM blocked.page
          AND blocking.tuple IS NOT DISTINCT FROM blocked.tuple
          AND blocking.virtualxid IS NOT DISTINCT FROM blocked.virtualxid
          AND blocking.transactionid IS NOT DISTINCT FROM blocked.transactionid
          AND blocking.classid IS NOT DISTINCT FROM blocked.classid
          AND blocking.objid IS NOT DISTINCT FROM blocked.objid
          AND blocking.objsubid IS NOT DISTINCT FROM blocked.objsubid
          AND blocking.pid != blocked.pid
        JOIN pg_stat_activity blocking_activity ON blocking.pid = blocking_activity.pid
        WHERE NOT blocked.granted AND blocking.granted
      )
      SELECT DISTINCT * FROM lock_chain
      ORDER BY blocking_pid, blocked_pid
      LIMIT 100`
    ).catch(() => ({ rows: [] }));

    // 현재 Lock Wait 세션 수 시계열 (간이)
    const lockWaitCount = await executeQuery<{ count: number }>(
      config,
      `SELECT COUNT(*)::int AS count FROM pg_locks WHERE NOT granted`
    ).catch(() => ({ rows: [{ count: 0 }] }));

    return NextResponse.json({
      success: true,
      data: {
        tree: lockTree.rows,
        lockWaitCount: lockWaitCount.rows[0]?.count ?? 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
