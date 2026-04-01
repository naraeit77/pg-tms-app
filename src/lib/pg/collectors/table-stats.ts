/**
 * pg_stat_user_tables / pg_stat_user_indexes 기반 테이블/인덱스 통계
 */

import { executeQuery, type PgConnectionConfig } from '@/lib/pg';

export interface TableStatRow {
  schema_name: string;
  table_name: string;
  table_size: number;
  dead_tuples: number;
  live_tuples: number;
  bloat_ratio: number;
  seq_scan: number;
  seq_tup_read: number;
  idx_scan: number;
  idx_tup_fetch: number;
  n_tup_ins: number;
  n_tup_upd: number;
  n_tup_del: number;
}

export async function collectTableStats(config: PgConnectionConfig): Promise<TableStatRow[]> {
  const sql = `
    SELECT
      schemaname AS schema_name,
      relname AS table_name,
      pg_table_size(relid) AS table_size,
      n_dead_tup AS dead_tuples,
      n_live_tup AS live_tuples,
      CASE
        WHEN n_live_tup + n_dead_tup > 0
        THEN ROUND((n_dead_tup::numeric / (n_live_tup + n_dead_tup) * 100), 2)
        ELSE 0
      END AS bloat_ratio,
      COALESCE(seq_scan, 0) AS seq_scan,
      COALESCE(seq_tup_read, 0) AS seq_tup_read,
      COALESCE(idx_scan, 0) AS idx_scan,
      COALESCE(idx_tup_fetch, 0) AS idx_tup_fetch,
      COALESCE(n_tup_ins, 0) AS n_tup_ins,
      COALESCE(n_tup_upd, 0) AS n_tup_upd,
      COALESCE(n_tup_del, 0) AS n_tup_del
    FROM pg_stat_user_tables
    ORDER BY n_dead_tup DESC
    LIMIT 200
  `;

  const result = await executeQuery<TableStatRow>(config, sql);
  return result.rows;
}

export interface IndexStatRow {
  schema_name: string;
  table_name: string;
  index_name: string;
  index_size: number;
  idx_scan: number;
  idx_tup_read: number;
  idx_tup_fetch: number;
}

export async function collectIndexStats(config: PgConnectionConfig): Promise<IndexStatRow[]> {
  const sql = `
    SELECT
      schemaname AS schema_name,
      relname AS table_name,
      indexrelname AS index_name,
      pg_relation_size(indexrelid) AS index_size,
      COALESCE(idx_scan, 0) AS idx_scan,
      COALESCE(idx_tup_read, 0) AS idx_tup_read,
      COALESCE(idx_tup_fetch, 0) AS idx_tup_fetch
    FROM pg_stat_user_indexes
    ORDER BY idx_scan ASC
    LIMIT 200
  `;

  const result = await executeQuery<IndexStatRow>(config, sql);
  return result.rows;
}
