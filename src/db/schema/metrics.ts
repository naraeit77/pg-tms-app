import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  timestamp,
  jsonb,
  doublePrecision,
  index,
  bigserial,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * 실시간 메트릭 원본 테이블
 *
 * pg_partman으로 일별 파티셔닝 적용 예정:
 *   SELECT partman.create_parent('public.metrics_realtime', 'collected_at', '1 day', p_premake := 7);
 *
 * Drizzle ORM에서는 파티션 부모 테이블 정의만 하고,
 * 실제 파티셔닝은 SQL 마이그레이션으로 적용합니다.
 *
 * metric_type: 'global' | 'session' | 'wait_event' | 'lock'
 * data: JSONB로 메트릭 종류별 가변 데이터 저장
 */
export const metricsRealtime = pgTable('metrics_realtime', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  connectionId: uuid('connection_id').notNull(),
  collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
  metricType: varchar('metric_type', { length: 50 }).notNull(),
  data: jsonb('data').notNull(),
}, (table) => [
  index('idx_metrics_rt_tenant_conn_time').on(table.tenantId, table.connectionId, table.collectedAt),
  index('idx_metrics_rt_type').on(table.metricType),
  index('idx_metrics_rt_collected').on(table.collectedAt),
]);

/**
 * SQL 스냅샷 메트릭 (5분 간격 수집)
 *
 * pg_partman으로 월별 파티셔닝 적용 예정:
 *   SELECT partman.create_parent('public.metrics_snapshot', 'collected_at', '1 month', p_premake := 3);
 *
 * 기존 pg_tms_snap_sql_stats의 SaaS 확장 버전
 * tenant_id + connection_id로 멀티테넌트 격리
 * 델타값 포함하여 이전 스냅샷 대비 변화량 추적
 */
export const metricsSnapshot = pgTable('metrics_snapshot', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  connectionId: uuid('connection_id').notNull(),
  collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
  snapshotNumber: integer('snapshot_number'),
  // SQL 식별
  queryid: bigint('queryid', { mode: 'number' }),
  queryText: text('query_text'),
  username: varchar('username', { length: 100 }),
  // 누적 메트릭
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
  index('idx_metrics_snap_tenant_conn_time').on(table.tenantId, table.connectionId, table.collectedAt),
  index('idx_metrics_snap_queryid').on(table.queryid),
  index('idx_metrics_snap_collected').on(table.collectedAt),
  index('idx_metrics_snap_number').on(table.connectionId, table.snapshotNumber),
]);

/**
 * 글로벌 스냅샷 메타데이터 (5분 간격)
 *
 * 기존 pg_tms_snapshots의 SaaS 확장 버전
 * 스냅샷 수준의 글로벌 DB 상태 요약
 */
export const metricsSnapshotMeta = pgTable('metrics_snapshot_meta', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  connectionId: uuid('connection_id').notNull(),
  collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
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
  dbSizeBytes: bigint('db_size_bytes', { mode: 'number' }),
  // 수집 메타
  durationMs: integer('duration_ms'),
  sqlCount: integer('sql_count'),
  errorMessage: text('error_message'),
}, (table) => [
  index('idx_snap_meta_tenant_conn_time').on(table.tenantId, table.connectionId, table.collectedAt),
  index('idx_snap_meta_conn_number').on(table.connectionId, table.snapshotNumber),
]);
