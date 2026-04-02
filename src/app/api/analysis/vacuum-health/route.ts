import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
import { getPgConfig } from '@/lib/pg/utils';
import { executeQuery } from '@/lib/pg';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analysis/vacuum-health?connection_id=...
 * Vacuum 헬스 요약 + Top5 (WhaTap Vacuum 분석 스타일)
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

    const [deadTuples, bloat, txAge, autovacuumSettings, runningVacuums] = await Promise.all([
      // Dead Tuples Top 5
      executeQuery<{
        schemaname: string;
        relname: string;
        n_dead_tup: number;
        n_live_tup: number;
        dead_ratio: number;
        last_autovacuum: string | null;
      }>(config, `
        SELECT schemaname, relname,
          n_dead_tup::bigint,
          n_live_tup::bigint,
          CASE WHEN n_live_tup + n_dead_tup > 0
            THEN ROUND((n_dead_tup::numeric / (n_live_tup + n_dead_tup) * 100), 2)::float
            ELSE 0 END AS dead_ratio,
          last_autovacuum::text
        FROM pg_stat_user_tables
        WHERE n_dead_tup > 0
        ORDER BY n_dead_tup DESC LIMIT 10
      `),

      // Bloat Size Top 5 (추정)
      executeQuery<{
        schemaname: string;
        relname: string;
        table_size_bytes: number;
        dead_tup_bytes: number;
      }>(config, `
        SELECT schemaname, relname,
          pg_table_size(schemaname || '.' || relname)::bigint AS table_size_bytes,
          (n_dead_tup * (SELECT avg(avg_width) FROM pg_stats WHERE tablename = relname))::bigint AS dead_tup_bytes
        FROM pg_stat_user_tables
        WHERE n_dead_tup > 100
        ORDER BY n_dead_tup DESC LIMIT 10
      `).catch(() => ({ rows: [] })),

      // Transaction Age
      executeQuery<{
        datname: string;
        age: number;
        max_age: number;
        pct: number;
      }>(config, `
        SELECT datname,
          age(datfrozenxid)::bigint AS age,
          current_setting('autovacuum_freeze_max_age')::bigint AS max_age,
          ROUND((age(datfrozenxid)::numeric / current_setting('autovacuum_freeze_max_age')::numeric * 100), 2)::float AS pct
        FROM pg_database
        WHERE datallowconn
        ORDER BY age DESC
      `).catch(() => ({ rows: [] })),

      // Autovacuum Settings
      executeQuery<{ name: string; setting: string }>(config, `
        SELECT name, setting FROM pg_settings
        WHERE name LIKE 'autovacuum%' OR name IN ('vacuum_cost_delay', 'vacuum_cost_limit', 'vacuum_cost_page_hit')
        ORDER BY name
      `).catch(() => ({ rows: [] })),

      // Running vacuum workers
      executeQuery<{
        pid: number;
        query: string;
        duration_sec: number;
      }>(config, `
        SELECT pid, query,
          EXTRACT(EPOCH FROM (now() - query_start))::float AS duration_sec
        FROM pg_stat_activity
        WHERE backend_type = 'autovacuum worker'
        ORDER BY query_start
      `).catch(() => ({ rows: [] })),
    ]);

    const totalDeadTuples = deadTuples.rows.reduce((sum, r) => sum + Number(r.n_dead_tup), 0);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalDeadTuples,
          topDeadTupleTable: deadTuples.rows[0]?.relname ?? '-',
          maxTxAgePct: txAge.rows[0]?.pct ?? 0,
          runningVacuumWorkers: runningVacuums.rows.length,
        },
        deadTuples: deadTuples.rows,
        bloat: bloat.rows,
        txAge: txAge.rows,
        autovacuumSettings: autovacuumSettings.rows,
        runningVacuums: runningVacuums.rows,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return handlePgError(error, 'Vacuum health');
  }
}
