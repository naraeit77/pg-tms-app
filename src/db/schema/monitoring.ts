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
 * pg_stat_statements 기반 SQL 통계
 * Oracle sqlStatistics 대체
 */
export const pgSqlStatistics = pgTable('pgtms_sql_statistics', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  connectionId: uuid('connection_id').notNull().references(() => pgConnections.id, { onDelete: 'cascade' }),
  queryid: bigint('queryid', { mode: 'number' }).notNull(),
  query: text('query'),
  dbid: integer('dbid'),
  userid: integer('userid'),
  username: varchar('username', { length: 100 }),
  calls: bigint('calls', { mode: 'number' }).default(0),
  totalExecTime: doublePrecision('total_exec_time').default(0),
  minExecTime: doublePrecision('min_exec_time').default(0),
  maxExecTime: doublePrecision('max_exec_time').default(0),
  meanExecTime: doublePrecision('mean_exec_time').default(0),
  stddevExecTime: doublePrecision('stddev_exec_time').default(0),
  totalPlanTime: doublePrecision('total_plan_time').default(0),
  rows: bigint('rows', { mode: 'number' }).default(0),
  sharedBlksHit: bigint('shared_blks_hit', { mode: 'number' }).default(0),
  sharedBlksRead: bigint('shared_blks_read', { mode: 'number' }).default(0),
  sharedBlksDirtied: bigint('shared_blks_dirtied', { mode: 'number' }).default(0),
  sharedBlksWritten: bigint('shared_blks_written', { mode: 'number' }).default(0),
  localBlksHit: bigint('local_blks_hit', { mode: 'number' }).default(0),
  localBlksRead: bigint('local_blks_read', { mode: 'number' }).default(0),
  tempBlksRead: bigint('temp_blks_read', { mode: 'number' }).default(0),
  tempBlksWritten: bigint('temp_blks_written', { mode: 'number' }).default(0),
  blkReadTime: doublePrecision('blk_read_time').default(0),
  blkWriteTime: doublePrecision('blk_write_time').default(0),
  walRecords: bigint('wal_records', { mode: 'number' }).default(0),
  walBytes: bigint('wal_bytes', { mode: 'number' }).default(0),
  collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_pg_sql_stats_conn').on(table.connectionId),
  index('idx_pg_sql_stats_queryid').on(table.queryid),
  index('idx_pg_sql_stats_collected').on(table.collectedAt),
  index('idx_pg_sql_stats_total_exec').on(table.totalExecTime),
]);

/**
 * pg_stat_activity 기반 세션 모니터링
 * Oracle sessionMonitoring 대체
 */
export const pgSessionMonitoring = pgTable('pgtms_session_monitoring', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  connectionId: uuid('connection_id').notNull().references(() => pgConnections.id, { onDelete: 'cascade' }),
  pid: integer('pid').notNull(),
  datname: varchar('datname', { length: 100 }),
  usename: varchar('usename', { length: 100 }),
  applicationName: varchar('application_name', { length: 255 }),
  clientAddr: varchar('client_addr', { length: 50 }),
  clientPort: integer('client_port'),
  backendType: varchar('backend_type', { length: 50 }),
  state: varchar('state', { length: 20 }),
  waitEventType: varchar('wait_event_type', { length: 50 }),
  waitEvent: varchar('wait_event', { length: 100 }),
  query: text('query'),
  queryStart: timestamp('query_start', { withTimezone: true }),
  xactStart: timestamp('xact_start', { withTimezone: true }),
  stateChange: timestamp('state_change', { withTimezone: true }),
  backendStart: timestamp('backend_start', { withTimezone: true }),
  collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_pg_session_conn').on(table.connectionId),
  index('idx_pg_session_collected').on(table.collectedAt),
  index('idx_pg_session_state').on(table.state),
]);

/**
 * Wait Events 집계
 */
export const pgWaitEvents = pgTable('pgtms_wait_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  connectionId: uuid('connection_id').notNull().references(() => pgConnections.id, { onDelete: 'cascade' }),
  waitEventType: varchar('wait_event_type', { length: 50 }).notNull(),
  waitEvent: varchar('wait_event', { length: 100 }).notNull(),
  count: integer('count').default(0),
  collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_pg_wait_events_conn').on(table.connectionId),
  index('idx_pg_wait_events_collected').on(table.collectedAt),
]);

/**
 * 실행계획 저장
 */
export const pgExecutionPlans = pgTable('pgtms_execution_plans', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  connectionId: uuid('connection_id').notNull().references(() => pgConnections.id, { onDelete: 'cascade' }),
  queryid: bigint('queryid', { mode: 'number' }),
  sqlText: text('sql_text'),
  planJson: jsonb('plan_json'),
  planningTimeMs: doublePrecision('planning_time_ms'),
  executionTimeMs: doublePrecision('execution_time_ms'),
  totalCost: doublePrecision('total_cost'),
  nodeTypes: text('node_types').array(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_pg_exec_plans_conn').on(table.connectionId),
  index('idx_pg_exec_plans_queryid').on(table.queryid),
]);

/**
 * SQL 실행 이력 (시계열)
 */
export const pgSqlExecutionHistory = pgTable('pgtms_sql_execution_history', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  connectionId: uuid('connection_id').notNull().references(() => pgConnections.id, { onDelete: 'cascade' }),
  queryid: bigint('queryid', { mode: 'number' }).notNull(),
  calls: bigint('calls', { mode: 'number' }).default(0),
  totalExecTime: doublePrecision('total_exec_time').default(0),
  meanExecTime: doublePrecision('mean_exec_time').default(0),
  rows: bigint('rows', { mode: 'number' }).default(0),
  sharedBlksHit: bigint('shared_blks_hit', { mode: 'number' }).default(0),
  sharedBlksRead: bigint('shared_blks_read', { mode: 'number' }).default(0),
  collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_pg_sql_history_conn_queryid').on(table.connectionId, table.queryid),
  index('idx_pg_sql_history_collected').on(table.collectedAt),
]);
