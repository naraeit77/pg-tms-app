import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPgConfig } from '@/lib/pg/utils';
import { executeQuery } from '@/lib/pg';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analysis/top-objects?connection_id=...&tab=bloating&type=table&limit=50
 * 6개 관점별 오브젝트 랭킹 (WhaTap Top 오브젝트 스타일)
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

    const tab = request.nextUrl.searchParams.get('tab') || 'bloating';
    const objType = request.nextUrl.searchParams.get('type') || 'table';
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || '50'), 200);
    const config = await getPgConfig(connectionId);

    let data: any[] = [];

    if (objType === 'table') {
      switch (tab) {
        case 'bloating':
          data = (await executeQuery(config, `
            SELECT schemaname, relname,
              pg_table_size(schemaname||'.'||relname)::bigint AS table_size,
              n_dead_tup::bigint,
              CASE WHEN n_live_tup+n_dead_tup>0
                THEN ROUND((n_dead_tup::numeric/(n_live_tup+n_dead_tup)*100),2)::float ELSE 0 END AS bloat_pct
            FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT $1
          `, [limit])).rows;
          break;
        case 'scan':
          data = (await executeQuery(config, `
            SELECT schemaname, relname,
              seq_scan::bigint, seq_tup_read::bigint,
              idx_scan::bigint, idx_tup_fetch::bigint
            FROM pg_stat_user_tables ORDER BY seq_scan DESC LIMIT $1
          `, [limit])).rows;
          break;
        case 'dml':
          data = (await executeQuery(config, `
            SELECT schemaname, relname,
              n_tup_ins::bigint AS inserts,
              n_tup_upd::bigint AS updates,
              n_tup_del::bigint AS deletes,
              n_tup_hot_upd::bigint AS hot_updates
            FROM pg_stat_user_tables ORDER BY (n_tup_ins+n_tup_upd+n_tup_del) DESC LIMIT $1
          `, [limit])).rows;
          break;
        case 'analyze_time':
          data = (await executeQuery(config, `
            SELECT schemaname, relname,
              last_vacuum::text, last_autovacuum::text,
              last_analyze::text, last_autoanalyze::text,
              vacuum_count::int, autovacuum_count::int,
              analyze_count::int, autoanalyze_count::int
            FROM pg_stat_user_tables ORDER BY last_autoanalyze DESC NULLS LAST LIMIT $1
          `, [limit])).rows;
          break;
        case 'age':
          data = (await executeQuery(config, `
            SELECT schemaname, relname,
              age(relfrozenxid)::bigint AS xid_age,
              pg_table_size(oid)::bigint AS table_size
            FROM pg_class
            WHERE relkind = 'r' AND relnamespace NOT IN (
              SELECT oid FROM pg_namespace WHERE nspname IN ('pg_catalog','information_schema')
            )
            ORDER BY age(relfrozenxid) DESC LIMIT $1
          `, [limit])).rows;
          break;
        case 'dead_tuple':
          data = (await executeQuery(config, `
            SELECT schemaname, relname,
              n_dead_tup::bigint, n_live_tup::bigint,
              last_autovacuum::text
            FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT $1
          `, [limit])).rows;
          break;
      }
    } else {
      // Index
      switch (tab) {
        case 'bloating':
        case 'scan':
        default:
          data = (await executeQuery(config, `
            SELECT schemaname, relname AS tablename, indexrelname AS indexname,
              pg_relation_size(indexrelid)::bigint AS index_size,
              idx_scan::bigint, idx_tup_read::bigint, idx_tup_fetch::bigint
            FROM pg_stat_user_indexes ORDER BY idx_scan ASC LIMIT $1
          `, [limit])).rows;
          break;
      }
    }

    return NextResponse.json({
      success: true,
      data,
      meta: { tab, type: objType, limit },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
