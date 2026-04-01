import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  inet,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { organizations } from './organizations';

/**
 * PostgreSQL 대상 DB 연결 정보
 * orgId: SaaS 멀티테넌트 소속 조직 (nullable for backward compat)
 */
export const pgConnections = pgTable('pg_connections', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  host: varchar('host', { length: 255 }).notNull(),
  port: integer('port').default(5432),
  database: varchar('database', { length: 100 }).notNull(),
  username: varchar('username', { length: 100 }).notNull(),
  passwordEncrypted: text('password_encrypted').notNull(),
  sslMode: varchar('ssl_mode', { length: 20 }).default('prefer'),
  searchPath: varchar('search_path', { length: 255 }).default('public'),
  applicationName: varchar('application_name', { length: 100 }).default('pg-tms'),
  pgVersion: varchar('pg_version', { length: 20 }),
  pgStatStatementsEnabled: boolean('pg_stat_statements_enabled').default(false),
  isActive: boolean('is_active').default(true),
  isDefault: boolean('is_default').default(false),
  maxConnections: integer('max_connections').default(10),
  connectionTimeout: integer('connection_timeout').default(30000),
  lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
  lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
  healthStatus: varchar('health_status', { length: 20 }).default('UNKNOWN'),
  metadata: jsonb('metadata').default({}),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_pg_connections_user').on(table.userId),
  index('idx_pg_connections_org').on(table.orgId),
  index('idx_pg_connections_active').on(table.isActive),
  index('idx_pg_connections_default').on(table.isDefault),
  index('idx_pg_connections_health').on(table.healthStatus),
  unique('uq_pg_connections_user_name').on(table.userId, table.name),
]);

export const systemSettings = pgTable('system_settings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  category: varchar('category', { length: 50 }).notNull(),
  key: varchar('key', { length: 100 }).notNull(),
  value: jsonb('value').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  unique('uq_system_settings_category_key').on(table.category, table.key),
]);

export const schedulerJobs = pgTable('scheduler_jobs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull(),
  jobType: varchar('job_type', { length: 50 }).notNull(),
  cronExpression: varchar('cron_expression', { length: 100 }),
  status: varchar('status', { length: 20 }).default('ACTIVE'),
  pgConnectionId: uuid('pg_connection_id').references(() => pgConnections.id, { onDelete: 'cascade' }),
  config: jsonb('config').default({}),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastRunStatus: varchar('last_run_status', { length: 20 }),
  lastRunDurationMs: integer('last_run_duration_ms'),
  lastErrorMessage: text('last_error_message'),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  runCount: integer('run_count').default(0),
  failCount: integer('fail_count').default(0),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_scheduler_jobs_status').on(table.status),
  index('idx_scheduler_jobs_type').on(table.jobType),
  index('idx_scheduler_jobs_next_run').on(table.nextRunAt),
]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id),
  action: varchar('action', { length: 50 }).notNull(),
  resourceType: varchar('resource_type', { length: 50 }),
  resourceId: uuid('resource_id'),
  details: jsonb('details'),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_audit_logs_user').on(table.userId),
  index('idx_audit_logs_created').on(table.createdAt),
  index('idx_audit_logs_resource').on(table.resourceType, table.resourceId),
]);
