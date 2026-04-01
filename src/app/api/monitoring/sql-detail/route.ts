import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPgConfig } from '@/lib/pg/utils';
import { executeQuery } from '@/lib/pg/client';
import { db } from '@/db';
import { pgSqlExecutionHistory } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/monitoring/sql-detail?connection_id=...&queryid=...
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const connectionId = request.nextUrl.searchParams.get('connection_id');
    const queryidStr = request.nextUrl.searchParams.get('queryid');
    if (!connectionId || !queryidStr) {
      return NextResponse.json({ error: 'connection_id and queryid required' }, { status: 400 });
    }

    const queryid = parseInt(queryidStr);
    const config = await getPgConfig(connectionId);

    // 현재 pg_stat_statements에서 상세 조회
    let currentResult = { rows: [] as any[] };
    try {
      currentResult = await executeQuery(config, `
        SELECT
          queryid, query, calls, total_exec_time, min_exec_time, max_exec_time,
          mean_exec_time, stddev_exec_time, rows,
          shared_blks_hit, shared_blks_read, shared_blks_dirtied, shared_blks_written,
          local_blks_hit, local_blks_read, temp_blks_read, temp_blks_written,
          COALESCE(blk_read_time, 0) AS blk_read_time,
          COALESCE(blk_write_time, 0) AS blk_write_time,
          pg_catalog.pg_get_userbyid(userid) AS username
        FROM pg_stat_statements
        WHERE queryid = $1
        LIMIT 1
      `, [queryid]);
    } catch (e: any) {
      // pg_stat_statements 확장이 없는 경우 빈 결과 반환
      if (e.message?.includes('relation') && e.message?.includes('does not exist')) {
        console.warn('pg_stat_statements extension not installed');
      } else {
        throw e;
      }
    }

    // 이력 데이터 (app DB)
    const history = await db
      .select()
      .from(pgSqlExecutionHistory)
      .where(
        and(
          eq(pgSqlExecutionHistory.connectionId, connectionId),
          eq(pgSqlExecutionHistory.queryid, queryid)
        )
      )
      .orderBy(desc(pgSqlExecutionHistory.collectedAt))
      .limit(100);

    return NextResponse.json({
      success: true,
      data: {
        current: currentResult.rows[0] || null,
        history,
      },
    });
  } catch (error: any) {
    console.error('SQL detail error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
