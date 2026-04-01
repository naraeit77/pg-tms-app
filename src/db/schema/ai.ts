import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { pgConnections } from './connections';

export const aiChatSessions = pgTable('ai_chat_sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').references(() => pgConnections.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).default('새 대화'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).defaultNow(),
  messageCount: integer('message_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_chat_sessions_user').on(table.userId),
  index('idx_chat_sessions_last_msg').on(table.lastMessageAt),
]);

export const aiChatMessages = pgTable('ai_chat_messages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionId: uuid('session_id').notNull().references(() => aiChatSessions.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content'),
  toolCalls: jsonb('tool_calls'),
  toolResults: jsonb('tool_results'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_chat_messages_session').on(table.sessionId),
]);

export const aiAnalysisHistory = pgTable('ai_analysis_history', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  connectionId: uuid('connection_id').references(() => pgConnections.id, { onDelete: 'cascade' }),
  analysisType: varchar('analysis_type', { length: 50 }).notNull(),
  queryid: varchar('queryid', { length: 50 }),
  request: jsonb('request'),
  response: jsonb('response'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_analysis_history_conn').on(table.connectionId),
  index('idx_analysis_history_type').on(table.analysisType),
]);
