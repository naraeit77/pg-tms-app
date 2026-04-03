import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
import { getPgConfig } from '@/lib/pg/utils';
import { executeQuery } from '@/lib/pg';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analysis/top-objects?connection_id=...&tab=bloating&type=table&limit=50
 * 6개 관점별 오브젝트 랭킹 (WhaTap Top 오브젝트 스타일)
 */
export async function GET(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const connectionId = request.nextUrl.searchParams.get('connection_id');
    if (!connectionId) {
      return NextResponse.json({ error: 'connection_id required' }, { status: 400 });
    }

    const tab = request.nextUrl.searchParams.get('tab') || 'bloating';
    const objType = request.nextUrl.searchParams.get('type') || 'table';
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || '50'), 200);
    const config = await getPgConfig(connectionId, session.user.id);

    let data: any[] = [];

    if (objType === 'table') {
      switch (tab) {
        case 'bloating':
          data = (await executeQuery(config, `
            SELECT
              s.schemaname,
              s.relname,
              pg_table_size(s.schemaname||'.'||s.relname)::bigint AS table_size,
              pg_total_relation_size(s.schemaname||'.'||s.relname)::bigint AS total_size,
              s.n_live_tup::bigint,
              s.n_dead_tup::bigint,
              CASE WHEN s.n_live_tup + s.n_dead_tup > 0
                THEN ROUND((s.n_dead_tup::numeric / (s.n_live_tup + s.n_dead_tup) * 100), 2)::float
                ELSE 0 END AS bloat_pct,
              CASE WHEN s.n_live_tup > 0
                THEN ROUND((pg_table_size(s.schemaname||'.'||s.relname)::numeric / s.n_live_tup), 1)::float
                ELSE 0 END AS bytes_per_row,
              s.last_autovacuum::text,
              s.autovacuum_count::int
            FROM pg_stat_user_tables s
            ORDER BY s.n_dead_tup DESC
            LIMIT $1
          `, [limit])).rows;
          break;
        case 'scan':
          data = (await executeQuery(config, `
            SELECT
              s.schemaname,
              s.relname,
              pg_table_size(s.schemaname||'.'||s.relname)::bigint AS table_size,
              s.n_live_tup::bigint,
              s.seq_scan::bigint,
              s.seq_tup_read::bigint,
              CASE WHEN s.seq_scan > 0
                THEN ROUND(s.seq_tup_read::numeric / s.seq_scan)::bigint
                ELSE 0 END AS avg_seq_rows,
              s.idx_scan::bigint,
              s.idx_tup_fetch::bigint,
              CASE WHEN (s.seq_scan + COALESCE(s.idx_scan, 0)) > 0
                THEN ROUND(COALESCE(s.idx_scan, 0)::numeric / (s.seq_scan + COALESCE(s.idx_scan, 0)) * 100, 1)::float
                ELSE 0 END AS idx_scan_ratio
            FROM pg_stat_user_tables s
            ORDER BY s.seq_scan DESC
            LIMIT $1
          `, [limit])).rows;
          break;
        case 'dml':
          data = (await executeQuery(config, `
            SELECT
              s.schemaname,
              s.relname,
              pg_table_size(s.schemaname||'.'||s.relname)::bigint AS table_size,
              s.n_tup_ins::bigint AS inserts,
              s.n_tup_upd::bigint AS updates,
              s.n_tup_del::bigint AS deletes,
              (s.n_tup_ins + s.n_tup_upd + s.n_tup_del)::bigint AS total_dml,
              s.n_tup_hot_upd::bigint AS hot_updates,
              CASE WHEN s.n_tup_upd > 0
                THEN ROUND(s.n_tup_hot_upd::numeric / s.n_tup_upd * 100, 1)::float
                ELSE 0 END AS hot_update_ratio,
              s.n_live_tup::bigint
            FROM pg_stat_user_tables s
            ORDER BY (s.n_tup_ins + s.n_tup_upd + s.n_tup_del) DESC
            LIMIT $1
          `, [limit])).rows;
          break;
        case 'analyze_time':
          data = (await executeQuery(config, `
            SELECT
              s.schemaname,
              s.relname,
              pg_table_size(s.schemaname||'.'||s.relname)::bigint AS table_size,
              s.n_live_tup::bigint,
              s.last_vacuum::text,
              s.last_autovacuum::text,
              s.last_analyze::text,
              s.last_autoanalyze::text,
              s.vacuum_count::int,
              s.autovacuum_count::int,
              s.analyze_count::int,
              s.autoanalyze_count::int,
              EXTRACT(EPOCH FROM (now() - COALESCE(s.last_autoanalyze, s.last_analyze)))::int AS secs_since_analyze,
              EXTRACT(EPOCH FROM (now() - COALESCE(s.last_autovacuum, s.last_vacuum)))::int AS secs_since_vacuum
            FROM pg_stat_user_tables s
            ORDER BY last_autoanalyze DESC NULLS LAST
            LIMIT $1
          `, [limit])).rows;
          break;
        case 'age':
          data = (await executeQuery(config, `
            SELECT
              n.nspname AS schemaname,
              c.relname,
              age(c.relfrozenxid)::bigint AS xid_age,
              pg_table_size(c.oid)::bigint AS table_size,
              s.n_live_tup::bigint,
              s.n_dead_tup::bigint,
              s.last_autovacuum::text,
              ROUND(age(c.relfrozenxid)::numeric / 2147483647 * 100, 2)::float AS wraparound_pct
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_stat_user_tables s ON s.schemaname = n.nspname AND s.relname = c.relname
            WHERE c.relkind = 'r'
              AND n.nspname NOT IN ('pg_catalog', 'information_schema')
            ORDER BY age(c.relfrozenxid) DESC
            LIMIT $1
          `, [limit])).rows;
          break;
        case 'dead_tuple':
          data = (await executeQuery(config, `
            SELECT
              s.schemaname,
              s.relname,
              pg_table_size(s.schemaname||'.'||s.relname)::bigint AS table_size,
              s.n_dead_tup::bigint,
              s.n_live_tup::bigint,
              CASE WHEN s.n_live_tup + s.n_dead_tup > 0
                THEN ROUND((s.n_dead_tup::numeric / (s.n_live_tup + s.n_dead_tup) * 100), 2)::float
                ELSE 0 END AS dead_ratio,
              s.n_mod_since_analyze::bigint,
              s.last_autovacuum::text,
              s.autovacuum_count::int,
              EXTRACT(EPOCH FROM (now() - s.last_autovacuum))::int AS secs_since_vacuum
            FROM pg_stat_user_tables s
            ORDER BY s.n_dead_tup DESC
            LIMIT $1
          `, [limit])).rows;
          break;
      }
    } else {
      // Index - 탭별 분석 (공통: 인덱스 컬럼, 타입, 정의 포함)
      const indexBase = `
        s.schemaname,
        s.relname AS tablename,
        s.indexrelname AS indexname,
        pg_relation_size(s.indexrelid)::bigint AS index_size,
        am.amname AS index_type,
        pg_get_indexdef(s.indexrelid) AS index_def,
        i.indisunique AS is_unique,
        i.indisprimary AS is_primary,
        ARRAY(
          SELECT a.attname
          FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
          ORDER BY k.ord
        )::text[] AS columns
      `;
      const indexJoin = `
        FROM pg_stat_user_indexes s
        JOIN pg_index i ON i.indexrelid = s.indexrelid
        JOIN pg_class ic ON ic.oid = s.indexrelid
        JOIN pg_am am ON am.oid = ic.relam
      `;

      switch (tab) {
        case 'bloating':
          data = (await executeQuery(config, `
            SELECT ${indexBase},
              pg_table_size(s.relid)::bigint AS table_size,
              s.idx_scan::bigint,
              s.idx_tup_read::bigint,
              CASE WHEN s.idx_scan = 0 THEN true ELSE false END AS unused
            ${indexJoin}
            ORDER BY pg_relation_size(s.indexrelid) DESC
            LIMIT $1
          `, [limit])).rows;
          break;
        case 'scan':
          data = (await executeQuery(config, `
            SELECT ${indexBase},
              s.idx_scan::bigint,
              s.idx_tup_read::bigint,
              s.idx_tup_fetch::bigint,
              CASE WHEN s.idx_tup_read > 0
                THEN ROUND(s.idx_tup_fetch::numeric / s.idx_tup_read * 100, 1)::float
                ELSE 0 END AS fetch_ratio
            ${indexJoin}
            ORDER BY s.idx_scan DESC
            LIMIT $1
          `, [limit])).rows;
          break;
        case 'dml':
          data = (await executeQuery(config, `
            SELECT ${indexBase},
              si.idx_blks_read::bigint,
              si.idx_blks_hit::bigint,
              CASE WHEN (si.idx_blks_hit + si.idx_blks_read) > 0
                THEN ROUND(si.idx_blks_hit::numeric / (si.idx_blks_hit + si.idx_blks_read) * 100, 1)::float
                ELSE 100 END AS cache_hit_ratio,
              s.idx_scan::bigint
            ${indexJoin}
            JOIN pg_statio_user_indexes si ON si.indexrelid = s.indexrelid
            ORDER BY si.idx_blks_read DESC
            LIMIT $1
          `, [limit])).rows;
          break;
        case 'analyze_time':
        case 'age':
        case 'dead_tuple':
        default:
          // 미사용 인덱스 감지 (삭제 후보)
          data = (await executeQuery(config, `
            SELECT ${indexBase},
              s.idx_scan::bigint,
              s.idx_tup_read::bigint
            ${indexJoin}
            WHERE s.idx_scan = 0
              AND NOT i.indisprimary
            ORDER BY pg_relation_size(s.indexrelid) DESC
            LIMIT $1
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
  } catch (error) {
    return handlePgError(error, 'Top objects');
  }
}
