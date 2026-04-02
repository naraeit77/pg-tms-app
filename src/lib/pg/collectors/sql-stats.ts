/**
 * pg_stat_statements 기반 SQL 통계 수집
 */

import { executeQuery, type PgConnectionConfig } from '@/lib/pg';

/**
 * pg_stat_statements 확장 존재 여부 확인 및 자동 설치 시도
 * @returns true if available, false if not
 */
export async function ensurePgStatStatements(config: PgConnectionConfig): Promise<boolean> {
  try {
    // 먼저 접근 가능한지 확인
    await executeQuery(config, 'SELECT 1 FROM pg_stat_statements LIMIT 1');
    return true;
  } catch (err: any) {
    console.warn('[pg_stat_statements] Initial check failed:', err.message);
    // 확장이 없으면 설치 시도
    try {
      await executeQuery(config, 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
      await executeQuery(config, 'SELECT 1 FROM pg_stat_statements LIMIT 1');
      return true;
    } catch (e: any) {
      console.warn('[pg_stat_statements] Extension not available:', e.message);
      return false;
    }
  }
}

export interface SqlStatRow {
  queryid: string;
  query: string;
  dbid: number;
  userid: number;
  username: string;
  calls: number;
  total_exec_time: number;
  min_exec_time: number;
  max_exec_time: number;
  mean_exec_time: number;
  stddev_exec_time: number;
  total_plan_time: number;
  rows: number;
  shared_blks_hit: number;
  shared_blks_read: number;
  shared_blks_dirtied: number;
  shared_blks_written: number;
  local_blks_hit: number;
  local_blks_read: number;
  temp_blks_read: number;
  temp_blks_written: number;
  blk_read_time: number;
  blk_write_time: number;
  wal_records: number;
  wal_bytes: number;
}

export async function collectSqlStats(
  config: PgConnectionConfig,
  limit: number = 100,
  orderBy: string = 'total_exec_time'
): Promise<SqlStatRow[]> {
  // ORDER BY에 사용할 수 있는 안전한 컬럼 (모든 버전에 존재)
  const validOrderColumns = [
    'total_exec_time', 'calls', 'shared_blks_read', 'shared_blks_hit',
    'mean_exec_time', 'rows', 'temp_blks_written',
  ];
  const safeOrderBy = validOrderColumns.includes(orderBy) ? orderBy : 'total_exec_time';

  // pg_stat_statements 버전에 따라 사용 가능한 컬럼이 다름
  // blk_read_time/blk_write_time: track_io_timing=on 필요 (PG 13+)
  // wal_records/wal_bytes: PG 13+
  // total_plan_time: PG 13+
  // 안전하게 동적으로 컬럼 존재 여부 확인
  let extraColumns = '';
  try {
    const colCheck = await executeQuery(config, `
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pg_stat_statements'
        AND column_name IN ('blk_read_time', 'blk_write_time', 'wal_records', 'wal_bytes', 'total_plan_time')
    `);
    const available = new Set(colCheck.rows.map((r: any) => r.column_name));

    if (available.has('total_plan_time')) extraColumns += ',\n      COALESCE(s.total_plan_time, 0) AS total_plan_time';
    else extraColumns += ',\n      0 AS total_plan_time';

    if (available.has('blk_read_time')) extraColumns += ',\n      COALESCE(s.blk_read_time, 0) AS blk_read_time';
    else extraColumns += ',\n      0 AS blk_read_time';

    if (available.has('blk_write_time')) extraColumns += ',\n      COALESCE(s.blk_write_time, 0) AS blk_write_time';
    else extraColumns += ',\n      0 AS blk_write_time';

    if (available.has('wal_records')) extraColumns += ',\n      COALESCE(s.wal_records, 0) AS wal_records';
    else extraColumns += ',\n      0 AS wal_records';

    if (available.has('wal_bytes')) extraColumns += ',\n      COALESCE(s.wal_bytes, 0) AS wal_bytes';
    else extraColumns += ',\n      0 AS wal_bytes';
  } catch {
    extraColumns = `,
      0 AS total_plan_time,
      0 AS blk_read_time,
      0 AS blk_write_time,
      0 AS wal_records,
      0 AS wal_bytes`;
  }

  const sql = `
    SELECT
      s.queryid::text AS queryid,
      s.query,
      s.dbid,
      s.userid,
      pg_catalog.pg_get_userbyid(s.userid) AS username,
      s.calls,
      s.total_exec_time,
      s.min_exec_time,
      s.max_exec_time,
      s.mean_exec_time,
      s.stddev_exec_time,
      s.rows,
      s.shared_blks_hit,
      s.shared_blks_read,
      s.shared_blks_dirtied,
      s.shared_blks_written,
      s.local_blks_hit,
      s.local_blks_read,
      s.temp_blks_read,
      s.temp_blks_written
      ${extraColumns}
    FROM pg_stat_statements s
    WHERE s.query NOT LIKE '%pg_stat_statements%'
      AND s.query NOT LIKE 'EXPLAIN%'
    ORDER BY s.${safeOrderBy} DESC
    LIMIT $1
  `;

  console.log(`[collectSqlStats] Querying pg_stat_statements on ${config.host}:${config.port}/${config.database} (limit=${limit}, order=${safeOrderBy})`);
  const result = await executeQuery<SqlStatRow>(config, sql, [limit]);
  console.log(`[collectSqlStats] Got ${result.rows.length} rows`);
  return result.rows;
}
