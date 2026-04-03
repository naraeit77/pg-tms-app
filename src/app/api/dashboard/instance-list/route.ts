import { NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
import { db } from '@/db';
import { pgConnections } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getPgConfig } from '@/lib/pg/utils';
import { collectGlobalStats } from '@/lib/pg/collectors/global-stats';
import { collectSessions } from '@/lib/pg/collectors/sessions';
import { collectSqlStats } from '@/lib/pg/collectors/sql-stats';

export const dynamic = 'force-dynamic';

interface InstanceMetrics {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  pgVersion: string | null;
  healthStatus: string;
  isDefault: boolean;
  status: 'normal' | 'warning' | 'critical' | 'inactive';
  metrics: {
    activeSessions: number;
    idleSessions: number;
    totalSessions: number;
    cacheHitRatio: number;
    tps: number;
    totalConnections: number;
    lockWaitSessions: number;
    slowQueries: number;
    replicationDelay: number;
    dbSizeMb: number;
    uptime: string;
    activeSessionDetails: {
      pid: number;
      usename: string;
      query: string | null;
      query_duration_ms: number | null;
      wait_event_type: string | null;
      wait_event: string | null;
      state: string;
      client_addr: string | null;
      application_name: string | null;
      query_id: string | null;
    }[];
    topSql: {
      queryid: string;
      query: string;
      calls: number;
      total_exec_time: number;
      mean_exec_time: number;
      shared_blks_hit: number;
      shared_blks_read: number;
      rows: number;
    }[];
  } | null;
  error?: string;
  lastCheckedAt: string;
}

/**
 * GET /api/dashboard/instance-list
 * 모든 활성 연결의 핵심 메트릭 일괄 조회 (인스턴스 목록 페이지)
 */
export async function GET() {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const connections = await db
      .select({
        id: pgConnections.id,
        name: pgConnections.name,
        host: pgConnections.host,
        port: pgConnections.port,
        database: pgConnections.database,
        pgVersion: pgConnections.pgVersion,
        healthStatus: pgConnections.healthStatus,
        isDefault: pgConnections.isDefault,
        isActive: pgConnections.isActive,
      })
      .from(pgConnections)
      .where(
        and(
          eq(pgConnections.userId, session.user.id),
          eq(pgConnections.isActive, true)
        )
      )
      .orderBy(desc(pgConnections.isDefault), pgConnections.name);

    // 각 인스턴스의 메트릭을 병렬 수집 (타임아웃 5초)
    const instances: InstanceMetrics[] = await Promise.all(
      connections.map(async (conn) => {
        const base: InstanceMetrics = {
          id: conn.id,
          name: conn.name,
          host: conn.host,
          port: conn.port ?? 5432,
          database: conn.database,
          pgVersion: conn.pgVersion,
          healthStatus: conn.healthStatus ?? 'UNKNOWN',
          isDefault: conn.isDefault ?? false,
          status: 'inactive',
          metrics: null,
          lastCheckedAt: new Date().toISOString(),
        };

        try {
          const config = await getPgConfig(conn.id, session.user.id);

          const [globalStats, sessions, topSql] = await Promise.all([
            collectGlobalStats(config),
            collectSessions(config),
            collectSqlStats(config, 15, 'total_exec_time').catch(() => []),
          ]);

          const activeSessions = sessions.filter((s) => s.state === 'active');
          const lockWaitSessions = sessions.filter(
            (s) => s.wait_event_type === 'Lock'
          );
          const slowQueries = activeSessions.filter(
            (s: any) => s.query_duration_ms != null && Number(s.query_duration_ms) > 1000
          );

          // 상태 판정: WhaTap 스타일 (critical > warning > normal)
          let status: InstanceMetrics['status'] = 'normal';
          if (
            lockWaitSessions.length > 5 ||
            slowQueries.length > 10 ||
            (globalStats.cache_hit_ratio != null && globalStats.cache_hit_ratio < 90)
          ) {
            status = 'critical';
          } else if (
            lockWaitSessions.length > 0 ||
            slowQueries.length > 3 ||
            activeSessions.length > 50
          ) {
            status = 'warning';
          }

          return {
            ...base,
            status,
            metrics: {
              activeSessions: activeSessions.length,
              idleSessions: sessions.filter((s) => s.state === 'idle').length,
              totalSessions: sessions.length,
              cacheHitRatio: globalStats.cache_hit_ratio ?? 0,
              tps: globalStats.tps ?? 0,
              totalConnections: sessions.length,
              lockWaitSessions: lockWaitSessions.length,
              slowQueries: slowQueries.length,
              replicationDelay: 0,
              dbSizeMb: globalStats.db_size
                ? Number((globalStats.db_size / 1024 / 1024).toFixed(1))
                : 0,
              uptime: globalStats.uptime || '',
              activeSessionDetails: activeSessions.slice(0, 20).map((s) => ({
                pid: s.pid,
                usename: s.usename,
                query: s.query?.substring(0, 200) ?? null,
                query_duration_ms: s.query_duration_ms,
                wait_event_type: s.wait_event_type,
                wait_event: s.wait_event,
                state: s.state,
                client_addr: s.client_addr ?? null,
                application_name: s.application_name ?? null,
                query_id: s.query_id,
              })),
              topSql: topSql.slice(0, 15).map((s) => ({
                queryid: s.queryid,
                query: s.query,
                calls: s.calls,
                total_exec_time: s.total_exec_time,
                mean_exec_time: s.mean_exec_time,
                shared_blks_hit: s.shared_blks_hit,
                shared_blks_read: s.shared_blks_read,
                rows: s.rows,
              })),
            },
          };
        } catch (error: any) {
          return {
            ...base,
            status: 'inactive' as const,
            error: error?.message || 'Connection failed',
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      data: instances,
      summary: {
        total: instances.length,
        normal: instances.filter((i) => i.status === 'normal').length,
        warning: instances.filter((i) => i.status === 'warning').length,
        critical: instances.filter((i) => i.status === 'critical').length,
        inactive: instances.filter((i) => i.status === 'inactive').length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return handlePgError(error, 'InstanceList');
  }
}
