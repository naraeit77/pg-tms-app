import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
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
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const connectionId = request.nextUrl.searchParams.get('connection_id');
    const queryidStr = request.nextUrl.searchParams.get('queryid');
    if (!connectionId || !queryidStr) {
      return NextResponse.json({ error: 'connection_id and queryid required' }, { status: 400 });
    }

    // queryid는 bigint이므로 문자열로 유지 (parseInt는 정밀도 손실 가능)
    const config = await getPgConfig(connectionId, session.user.id);

    // 동적 컬럼 감지
    let extraCols = '';
    try {
      const colCheck = await executeQuery(config, `
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'pg_stat_statements'
          AND column_name IN ('blk_read_time', 'blk_write_time')
      `);
      const available = new Set(colCheck.rows.map((r: any) => r.column_name));
      extraCols += available.has('blk_read_time') ? ',\n          COALESCE(blk_read_time, 0) AS blk_read_time' : ',\n          0 AS blk_read_time';
      extraCols += available.has('blk_write_time') ? ',\n          COALESCE(blk_write_time, 0) AS blk_write_time' : ',\n          0 AS blk_write_time';
    } catch {
      extraCols = ',\n          0 AS blk_read_time, 0 AS blk_write_time';
    }

    // 현재 pg_stat_statements에서 상세 조회
    let currentResult = { rows: [] as any[] };
    try {
      currentResult = await executeQuery(config, `
        SELECT
          queryid::text AS queryid, query, calls, total_exec_time, min_exec_time, max_exec_time,
          mean_exec_time, stddev_exec_time, rows,
          shared_blks_hit, shared_blks_read, shared_blks_dirtied, shared_blks_written,
          local_blks_hit, local_blks_read, temp_blks_read, temp_blks_written
          ${extraCols},
          pg_catalog.pg_get_userbyid(userid) AS username
        FROM pg_stat_statements
        WHERE queryid = $1::bigint
        LIMIT 1
      `, [queryidStr]);
    } catch (e: any) {
      // pg_stat_statements 확장이 없는 경우 빈 결과 반환
      if (e.message?.includes('relation') && e.message?.includes('does not exist')) {
        console.warn('pg_stat_statements extension not installed');
      } else {
        throw e;
      }
    }

    // 이력 데이터 (app DB) - queryid를 number로 변환 (Drizzle bigint mode: 'number')
    const queryidNum = Number(queryidStr);
    const history = await db
      .select()
      .from(pgSqlExecutionHistory)
      .where(
        and(
          eq(pgSqlExecutionHistory.connectionId, connectionId),
          eq(pgSqlExecutionHistory.queryid, queryidNum)
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
  } catch (error) {
    return handlePgError(error, 'SQL detail');
  }
}
