import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  doublePrecision,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pgConnections } from './connections';

/**
 * PG-TMS 스냅샷 메타 + 글로벌 통계 요약
 */
export const pgTmsSnapshots = pgTable('pg_tms_snapshots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  connectionId: uuid('connection_id').notNull().references(() => pgConnections.id, { onDelete: 'cascade' }),
  snapshotNumber: integer('snapshot_number').notNull(),
  status: varchar('status', { length: 20 }).default('COMPLETED'),
  // 글로벌 통계 요약
  tps: doublePrecision('tps'),
  activeBackends: integer('active_backends'),
  idleBackends: integer('idle_backends'),
  totalConnections: integer('total_connections'),
  cacheHitRatio: doublePrecision('cache_hit_ratio'),
  txCommitted: bigint('tx_committed', { mode: 'number' }),
  txRolledBack: bigint('tx_rolled_back', { mode: 'number' }),
  deadlocks: bigint('deadlocks', { mode: 'number' }),
  tempBytes: bigint('temp_bytes', { mode: 'number' }),
  walBytes: bigint('wal_bytes', { mode: 'number' }),
  checkpointsReq: bigint('checkpoints_req', { mode: 'number' }),
  checkpointsTimed: bigint('checkpoints_timed', { mode: 'number' }),
  durationMs: integer('duration_ms'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_snapshots_conn').on(table.connectionId),
  index('idx_snapshots_created').on(table.createdAt),
  index('idx_snapshots_conn_number').on(table.connectionId, table.snapshotNumber),
]);

/**
 * 스냅샷별 SQL 통계 + 델타 컬럼
 */
export const pgTmsSnapSqlStats = pgTable('pg_tms_snap_sql_stats', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  snapshotId: uuid('snapshot_id').notNull().references(() => pgTmsSnapshots.id, { onDelete: 'cascade' }),
  queryid: bigint('queryid', { mode: 'number' }).notNull(),
  query: text('query'),
  username: varchar('username', { length: 100 }),
  // 누적값
  calls: bigint('calls', { mode: 'number' }).default(0),
  totalExecTime: doublePrecision('total_exec_time').default(0),
  meanExecTime: doublePrecision('mean_exec_time').default(0),
  rows: bigint('rows', { mode: 'number' }).default(0),
  sharedBlksHit: bigint('shared_blks_hit', { mode: 'number' }).default(0),
  sharedBlksRead: bigint('shared_blks_read', { mode: 'number' }).default(0),
  tempBlksRead: bigint('temp_blks_read', { mode: 'number' }).default(0),
  tempBlksWritten: bigint('temp_blks_written', { mode: 'number' }).default(0),
  blkReadTime: doublePrecision('blk_read_time').default(0),
  blkWriteTime: doublePrecision('blk_write_time').default(0),
  // 델타값 (이전 스냅샷 대비)
  deltaCalls: bigint('delta_calls', { mode: 'number' }),
  deltaTotalExecTime: doublePrecision('delta_total_exec_time'),
  deltaRows: bigint('delta_rows', { mode: 'number' }),
  deltaSharedBlksRead: bigint('delta_shared_blks_read', { mode: 'number' }),
}, (table) => [
  index('idx_snap_sql_snapshot').on(table.snapshotId),
  index('idx_snap_sql_queryid').on(table.queryid),
]);

/**
 * 스냅샷별 Wait Event 통계
 */
export const pgTmsSnapWaitStats = pgTable('pg_tms_snap_wait_stats', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  snapshotId: uuid('snapshot_id').notNull().references(() => pgTmsSnapshots.id, { onDelete: 'cascade' }),
  waitEventType: varchar('wait_event_type', { length: 50 }).notNull(),
  waitEvent: varchar('wait_event', { length: 100 }).notNull(),
  count: integer('count').default(0),
}, (table) => [
  index('idx_snap_wait_snapshot').on(table.snapshotId),
]);

/**
 * 테이블 Bloat 모니터링
 */
export const pgTableBloatStats = pgTable('pgtms_table_bloat_stats', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  connectionId: uuid('connection_id').notNull().references(() => pgConnections.id, { onDelete: 'cascade' }),
  schemaName: varchar('schema_name', { length: 100 }).notNull(),
  tableName: varchar('table_name', { length: 100 }).notNull(),
  tableSize: bigint('table_size', { mode: 'number' }),
  deadTuples: bigint('dead_tuples', { mode: 'number' }),
  liveTuples: bigint('live_tuples', { mode: 'number' }),
  bloatRatio: doublePrecision('bloat_ratio'),
  seqScan: bigint('seq_scan', { mode: 'number' }),
  seqTupRead: bigint('seq_tup_read', { mode: 'number' }),
  idxScan: bigint('idx_scan', { mode: 'number' }),
  idxTupFetch: bigint('idx_tup_fetch', { mode: 'number' }),
  nTupIns: bigint('n_tup_ins', { mode: 'number' }),
  nTupUpd: bigint('n_tup_upd', { mode: 'number' }),
  nTupDel: bigint('n_tup_del', { mode: 'number' }),
  collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_table_bloat_conn').on(table.connectionId),
  index('idx_table_bloat_collected').on(table.collectedAt),
]);

/**
 * 인덱스 사용률 추적
 */
export const pgIndexUsageStats = pgTable('pgtms_index_usage_stats', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  connectionId: uuid('connection_id').notNull().references(() => pgConnections.id, { onDelete: 'cascade' }),
  schemaName: varchar('schema_name', { length: 100 }).notNull(),
  tableName: varchar('table_name', { length: 100 }).notNull(),
  indexName: varchar('index_name', { length: 100 }).notNull(),
  indexSize: bigint('index_size', { mode: 'number' }),
  idxScan: bigint('idx_scan', { mode: 'number' }),
  idxTupRead: bigint('idx_tup_read', { mode: 'number' }),
  idxTupFetch: bigint('idx_tup_fetch', { mode: 'number' }),
  collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_index_usage_conn').on(table.connectionId),
  index('idx_index_usage_collected').on(table.collectedAt),
]);

/**
 * Vacuum/Autovacuum 모니터링
 */
export const pgVacuumStats = pgTable('pgtms_vacuum_stats', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  connectionId: uuid('connection_id').notNull().references(() => pgConnections.id, { onDelete: 'cascade' }),
  schemaName: varchar('schema_name', { length: 100 }).notNull(),
  tableName: varchar('table_name', { length: 100 }).notNull(),
  lastVacuum: timestamp('last_vacuum', { withTimezone: true }),
  lastAutovacuum: timestamp('last_autovacuum', { withTimezone: true }),
  lastAnalyze: timestamp('last_analyze', { withTimezone: true }),
  lastAutoanalyze: timestamp('last_autoanalyze', { withTimezone: true }),
  vacuumCount: bigint('vacuum_count', { mode: 'number' }),
  autovacuumCount: bigint('autovacuum_count', { mode: 'number' }),
  analyzeCount: bigint('analyze_count', { mode: 'number' }),
  autoanalyzeCount: bigint('autoanalyze_count', { mode: 'number' }),
  deadTuples: bigint('dead_tuples', { mode: 'number' }),
  liveTuples: bigint('live_tuples', { mode: 'number' }),
  collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_vacuum_stats_conn').on(table.connectionId),
  index('idx_vacuum_stats_collected').on(table.collectedAt),
]);
