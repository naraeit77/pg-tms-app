/**
 * pg_stat_database / pg_stat_bgwriter / pg_stat_wal 기반 글로벌 통계
 */

import { executeQuery, type PgConnectionConfig } from '@/lib/pg';

export interface GlobalStatsRow {
  tps: number;
  active_backends: number;
  idle_backends: number;
  total_connections: number;
  cache_hit_ratio: number;
  tx_committed: number;
  tx_rolled_back: number;
  deadlocks: number;
  temp_bytes: number;
  db_size: number;
  checkpoints_req: number;
  checkpoints_timed: number;
  buffers_checkpoint: number;
  buffers_backend: number;
  wal_bytes: number;
  tup_returned: number;
  tup_fetched: number;
  tup_inserted: number;
  tup_updated: number;
  tup_deleted: number;
  blks_hit: number;
  blks_read: number;
}

export async function collectGlobalStats(config: PgConnectionConfig): Promise<GlobalStatsRow> {
  // PG 17+: checkpoint 컬럼이 pg_stat_bgwriter → pg_stat_checkpointer로 이동
  const versionResult = await executeQuery<{ ver_num: number }>(
    config,
    "SELECT current_setting('server_version_num')::int AS ver_num"
  );
  const pgVersion = versionResult.rows[0]?.ver_num || 0;
  const isPg17Plus = pgVersion >= 170000;

  const checkpointCte = isPg17Plus
    ? `checkpoint_stats AS (
        SELECT
          COALESCE(num_requested, 0) AS checkpoints_req,
          COALESCE(num_timed, 0) AS checkpoints_timed,
          COALESCE(buffers_written, 0) AS buffers_checkpoint
        FROM pg_stat_checkpointer
      )`
    : `checkpoint_stats AS (
        SELECT
          COALESCE(checkpoints_req, 0) AS checkpoints_req,
          COALESCE(checkpoints_timed, 0) AS checkpoints_timed,
          COALESCE(buffers_checkpoint, 0) AS buffers_checkpoint
        FROM pg_stat_bgwriter
      )`;

  const sql = `
    WITH db_stats AS (
      SELECT
        COALESCE(SUM(xact_commit + xact_rollback), 0) AS total_tx,
        COALESCE(SUM(xact_commit), 0) AS tx_committed,
        COALESCE(SUM(xact_rollback), 0) AS tx_rolled_back,
        COALESCE(SUM(deadlocks), 0) AS deadlocks,
        COALESCE(SUM(temp_bytes), 0) AS temp_bytes,
        CASE
          WHEN COALESCE(SUM(blks_hit), 0) + COALESCE(SUM(blks_read), 0) = 0 THEN 0
          ELSE ROUND(
            (COALESCE(SUM(blks_hit), 0)::numeric /
            (COALESCE(SUM(blks_hit), 0) + COALESCE(SUM(blks_read), 0)) * 100), 2
          )
        END AS cache_hit_ratio,
        COALESCE(SUM(tup_returned), 0) AS tup_returned,
        COALESCE(SUM(tup_fetched), 0) AS tup_fetched,
        COALESCE(SUM(tup_inserted), 0) AS tup_inserted,
        COALESCE(SUM(tup_updated), 0) AS tup_updated,
        COALESCE(SUM(tup_deleted), 0) AS tup_deleted,
        COALESCE(SUM(blks_hit), 0) AS blks_hit,
        COALESCE(SUM(blks_read), 0) AS blks_read
      FROM pg_stat_database
      WHERE datname = current_database()
    ),
    session_stats AS (
      SELECT
        COUNT(*) FILTER (WHERE state = 'active') AS active_backends,
        COUNT(*) FILTER (WHERE state = 'idle') AS idle_backends,
        COUNT(*) AS total_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
    ),
    ${checkpointCte}
    SELECT
      d.total_tx AS tps,
      s.active_backends,
      s.idle_backends,
      s.total_connections,
      d.cache_hit_ratio,
      d.tx_committed,
      d.tx_rolled_back,
      d.deadlocks,
      d.temp_bytes,
      pg_database_size(current_database()) AS db_size,
      d.tup_returned, d.tup_fetched, d.tup_inserted, d.tup_updated, d.tup_deleted,
      d.blks_hit, d.blks_read,
      c.checkpoints_req,
      c.checkpoints_timed,
      c.buffers_checkpoint,
      ${isPg17Plus
        ? '0 AS buffers_backend,'
        : 'COALESCE((SELECT buffers_backend FROM pg_stat_bgwriter), 0) AS buffers_backend,'}
      0 AS wal_bytes
    FROM db_stats d, session_stats s, checkpoint_stats c
  `;

  const result = await executeQuery<GlobalStatsRow>(config, sql);
  return result.rows[0] || {
    tps: 0, active_backends: 0, idle_backends: 0, total_connections: 0,
    cache_hit_ratio: 0, tx_committed: 0, tx_rolled_back: 0, deadlocks: 0,
    temp_bytes: 0, db_size: 0, checkpoints_req: 0, checkpoints_timed: 0,
    buffers_checkpoint: 0, buffers_backend: 0, wal_bytes: 0,
    tup_returned: 0, tup_fetched: 0, tup_inserted: 0, tup_updated: 0, tup_deleted: 0,
    blks_hit: 0, blks_read: 0,
  };
}
