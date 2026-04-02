import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  doublePrecision,
  index,
  bigserial,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { pgConnections } from './connections';

/**
 * 알림 규칙
 * 메트릭 임계값 기반 알림 + 이상 탐지 규칙
 *
 * [SINGLE-TENANT] userId로 소유권 격리. orgId는 향후 멀티테넌트용 (nullable)
 */
export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id'), // 향후 멀티테넌트 확장용
  connectionId: uuid('connection_id').references(() => pgConnections.id, { onDelete: 'cascade' }),
  // null이면 사용자의 모든 커넥션에 적용
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  // 대상 메트릭
  metric: varchar('metric', { length: 100 }).notNull(),
  // 'active_sessions', 'cache_hit_ratio', 'deadlocks',
  // 'long_query_seconds', 'replication_lag', 'table_bloat_ratio',
  // 'connection_usage_pct', 'tps', 'temp_bytes'
  // 조건
  condition: varchar('condition', { length: 20 }).notNull(),
  // 'gt', 'gte', 'lt', 'lte', 'eq', 'neq'
  threshold: doublePrecision('threshold').notNull(),
  // 지속 시간 (N초 동안 조건 충족 시 발동)
  durationSeconds: integer('duration_seconds').default(60),
  // 심각도
  severity: varchar('severity', { length: 20 }).default('WARNING').notNull(),
  // 'INFO', 'WARNING', 'CRITICAL'
  // 알림 채널
  notificationChannels: jsonb('notification_channels').default([]),
  // [
  //   { "type": "email", "to": "admin@example.com" },
  //   { "type": "slack", "webhookUrl": "https://hooks.slack.com/..." },
  //   { "type": "webhook", "url": "https://api.example.com/alert", "headers": {} }
  // ]
  // 재발동 방지 (쿨다운)
  cooldownMinutes: integer('cooldown_minutes').default(15),
  // 상태
  isActive: boolean('is_active').default(true),
  lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
  lastResolvedAt: timestamp('last_resolved_at', { withTimezone: true }),
  triggerCount: integer('trigger_count').default(0),
  // 메타
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_alert_rules_user').on(table.userId),
  index('idx_alert_rules_org').on(table.orgId),
  index('idx_alert_rules_conn').on(table.connectionId),
  index('idx_alert_rules_metric').on(table.metric),
  index('idx_alert_rules_active').on(table.isActive),
]);

/**
 * 알림 이력
 * 발동된 알림의 기록, 해결 추적
 *
 * pg_partman으로 월별 파티셔닝 적용 예정
 */
export const alertHistory = pgTable('alert_history', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  ruleId: uuid('rule_id').references(() => alertRules.id, { onDelete: 'set null' }),
  userId: uuid('user_id').notNull(),
  orgId: uuid('org_id'), // 향후 멀티테넌트 확장용
  connectionId: uuid('connection_id').notNull(),
  // 알림 내용
  metric: varchar('metric', { length: 100 }).notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  condition: varchar('condition', { length: 20 }).notNull(),
  threshold: doublePrecision('threshold').notNull(),
  metricValue: doublePrecision('metric_value').notNull(),
  message: text('message'),
  // 상태
  status: varchar('status', { length: 20 }).default('TRIGGERED').notNull(),
  // 'TRIGGERED', 'ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED'
  triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  acknowledgedBy: uuid('acknowledged_by'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by'),
  // 알림 전송 결과
  notificationResults: jsonb('notification_results').default([]),
  // [{ "channel": "email", "success": true, "sentAt": "..." }]
}, (table) => [
  index('idx_alert_history_user').on(table.userId),
  index('idx_alert_history_org').on(table.orgId),
  index('idx_alert_history_conn').on(table.connectionId),
  index('idx_alert_history_rule').on(table.ruleId),
  index('idx_alert_history_triggered').on(table.triggeredAt),
  index('idx_alert_history_status').on(table.status),
  index('idx_alert_history_severity').on(table.severity),
]);

/**
 * 알림 템플릿 (내장 + 사용자 정의)
 */
export const alertTemplates = pgTable('alert_templates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  metric: varchar('metric', { length: 100 }).notNull(),
  condition: varchar('condition', { length: 20 }).notNull(),
  threshold: doublePrecision('threshold').notNull(),
  durationSeconds: integer('duration_seconds').default(60),
  severity: varchar('severity', { length: 20 }).default('WARNING'),
  // 'builtin' = 시스템 내장, 'custom' = 사용자 정의
  templateType: varchar('template_type', { length: 20 }).default('builtin'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
