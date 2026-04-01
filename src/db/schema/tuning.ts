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
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { pgConnections } from './connections';

/**
 * 튜닝 대상 SQL 관리
 * Oracle sqlId VARCHAR(13) → PG queryid BIGINT
 * Oracle bufferGets → PG sharedBlksRead
 */
export const tuningTasks = pgTable('tuning_tasks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  pgConnectionId: uuid('pg_connection_id').references(() => pgConnections.id, { onDelete: 'cascade' }),
  queryid: bigint('queryid', { mode: 'number' }).notNull(),
  sqlText: text('sql_text'),
  status: varchar('status', { length: 30 }).default('IDENTIFIED').notNull(),
  priority: varchar('priority', { length: 10 }).default('MEDIUM'),
  assignedTo: uuid('assigned_to').references(() => users.id),
  // Before 메트릭
  beforeCalls: bigint('before_calls', { mode: 'number' }),
  beforeTotalExecTime: doublePrecision('before_total_exec_time'),
  beforeMeanExecTime: doublePrecision('before_mean_exec_time'),
  beforeSharedBlksRead: bigint('before_shared_blks_read', { mode: 'number' }),
  beforeRows: bigint('before_rows', { mode: 'number' }),
  // After 메트릭
  afterCalls: bigint('after_calls', { mode: 'number' }),
  afterTotalExecTime: doublePrecision('after_total_exec_time'),
  afterMeanExecTime: doublePrecision('after_mean_exec_time'),
  afterSharedBlksRead: bigint('after_shared_blks_read', { mode: 'number' }),
  afterRows: bigint('after_rows', { mode: 'number' }),
  // 튜닝 내용
  tuningNotes: text('tuning_notes'),
  tuningResult: text('tuning_result'),
  improvementPct: doublePrecision('improvement_pct'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('idx_tuning_tasks_conn').on(table.pgConnectionId),
  index('idx_tuning_tasks_status').on(table.status),
  index('idx_tuning_tasks_queryid').on(table.queryid),
  index('idx_tuning_tasks_assigned').on(table.assignedTo),
]);

/**
 * 튜닝 이력/댓글
 */
export const tuningHistory = pgTable('tuning_history', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  taskId: uuid('task_id').notNull().references(() => tuningTasks.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id),
  action: varchar('action', { length: 50 }).notNull(),
  fromStatus: varchar('from_status', { length: 30 }),
  toStatus: varchar('to_status', { length: 30 }),
  comment: text('comment'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_tuning_history_task').on(table.taskId),
]);
