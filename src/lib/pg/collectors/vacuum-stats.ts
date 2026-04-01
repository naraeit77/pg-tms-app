/**
 * Vacuum/Autovacuum 모니터링 수집
 */

import { executeQuery, type PgConnectionConfig } from '@/lib/pg';

export interface VacuumStatRow {
  schema_name: string;
  table_name: string;
  last_vacuum: string | null;
  last_autovacuum: string | null;
  last_analyze: string | null;
  last_autoanalyze: string | null;
  vacuum_count: number;
  autovacuum_count: number;
  analyze_count: number;
  autoanalyze_count: number;
  dead_tuples: number;
  live_tuples: number;
}

export async function collectVacuumStats(config: PgConnectionConfig): Promise<VacuumStatRow[]> {
  const sql = `
    SELECT
      schemaname AS schema_name,
      relname AS table_name,
      last_vacuum,
      last_autovacuum,
      last_analyze,
      last_autoanalyze,
      COALESCE(vacuum_count, 0) AS vacuum_count,
      COALESCE(autovacuum_count, 0) AS autovacuum_count,
      COALESCE(analyze_count, 0) AS analyze_count,
      COALESCE(autoanalyze_count, 0) AS autoanalyze_count,
      n_dead_tup AS dead_tuples,
      n_live_tup AS live_tuples
    FROM pg_stat_user_tables
    ORDER BY n_dead_tup DESC
    LIMIT 200
  `;

  const result = await executeQuery<VacuumStatRow>(config, sql);
  return result.rows;
}
