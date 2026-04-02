import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

/**
 * 조직 (멀티테넌트 최상위 단위)
 * SaaS 요금제, 리소스 쿼터, 빌링 등의 단위
 *
 * [SINGLE-TENANT NOTE] 현재 v1.0은 단일 테넌트 모드로 운영됩니다.
 * 이 스키마는 향후 멀티테넌트 확장을 위해 유지하며,
 * API 라우트에서는 userId 기반으로만 데이터를 격리합니다.
 * organizations, orgMembers, teams, teamMembers, teamConnections 테이블은
 * 현재 사용되지 않습니다.
 */
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  // 요금제
  planTier: varchar('plan_tier', { length: 30 }).default('free').notNull(),
  // 리소스 쿼터
  maxConnections: integer('max_connections').default(3),
  maxTeams: integer('max_teams').default(1),
  maxMembers: integer('max_members').default(5),
  collectionIntervalSec: integer('collection_interval_sec').default(300),
  retentionDays: integer('retention_days').default(7),
  // 상태
  isActive: boolean('is_active').default(true),
  // 빌링 연동 (Stripe 등)
  billingCustomerId: varchar('billing_customer_id', { length: 255 }),
  billingSubscriptionId: varchar('billing_subscription_id', { length: 255 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_organizations_slug').on(table.slug),
  index('idx_organizations_plan').on(table.planTier),
  index('idx_organizations_active').on(table.isActive),
]);

/**
 * 조직 멤버
 * 사용자 ↔ 조직 매핑 + 조직 내 역할
 */
export const orgMembers = pgTable('org_members', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 30 }).default('member').notNull(),
  // owner: 모든 권한 + 조직 삭제
  // admin: 멤버 관리, 커넥션 관리, 설정
  // member: 커넥션 사용, 튜닝 작업
  // viewer: 읽기 전용
  permissions: jsonb('permissions').default({}),
  invitedBy: uuid('invited_by').references(() => users.id),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  unique('uq_org_members_org_user').on(table.orgId, table.userId),
  index('idx_org_members_org').on(table.orgId),
  index('idx_org_members_user').on(table.userId),
  index('idx_org_members_role').on(table.role),
]);

/**
 * 팀
 * 조직 내 하위 그룹, 팀별로 접근 가능 커넥션 제어
 */
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  unique('uq_teams_org_name').on(table.orgId, table.name),
  index('idx_teams_org').on(table.orgId),
]);

/**
 * 팀 멤버
 */
export const teamMembers = pgTable('team_members', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 30 }).default('member').notNull(),
  // lead: 팀 관리, 멤버 추가/제거
  // member: 팀 리소스 접근
  // viewer: 읽기 전용
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  unique('uq_team_members_team_user').on(table.teamId, table.userId),
  index('idx_team_members_team').on(table.teamId),
  index('idx_team_members_user').on(table.userId),
]);

/**
 * 팀별 커넥션 접근 권한
 * 어떤 팀이 어떤 DB 커넥션에 접근 가능한지 제어
 */
export const teamConnections = pgTable('team_connections', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').notNull(),
  // 커넥션별 접근 레벨
  accessLevel: varchar('access_level', { length: 20 }).default('viewer').notNull(),
  // admin: 세션 킬, 설정 변경
  // operator: 튜닝 작업, 쿼리 실행
  // viewer: 메트릭 조회만
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  unique('uq_team_connections').on(table.teamId, table.connectionId),
  index('idx_team_connections_team').on(table.teamId),
  index('idx_team_connections_conn').on(table.connectionId),
]);
