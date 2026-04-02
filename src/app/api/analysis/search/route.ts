import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
import { getPgConfig } from '@/lib/pg/utils';
import { executeQuery } from '@/lib/pg/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analysis/search?connection_id=...&q=...
 */
export async function GET(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const connectionId = request.nextUrl.searchParams.get('connection_id');
    const q = request.nextUrl.searchParams.get('q');
    if (!connectionId || !q) {
      return NextResponse.json({ error: 'connection_id and q required' }, { status: 400 });
    }

    const config = await getPgConfig(connectionId, session.user.id);

    let rows: any[] = [];
    try {
      const result = await executeQuery(config, `
        SELECT
          queryid::text AS queryid, query, calls, total_exec_time, mean_exec_time, rows,
          shared_blks_hit, shared_blks_read,
          pg_catalog.pg_get_userbyid(userid) AS username
        FROM pg_stat_statements
        WHERE query ILIKE $1
        ORDER BY total_exec_time DESC
        LIMIT 50
      `, [`%${q}%`]);
      rows = result.rows;
    } catch (e: any) {
      if (e.message?.includes('relation') && e.message?.includes('does not exist')) {
        return NextResponse.json({
          success: false,
          error: 'pg_stat_statements 확장이 설치되어 있지 않습니다. CREATE EXTENSION pg_stat_statements; 실행이 필요합니다.',
          data: [],
        });
      }
      throw e;
    }

    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
