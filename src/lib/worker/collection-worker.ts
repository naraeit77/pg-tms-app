/**
 * Collection Worker - 독립 수집 프로세스 프로토타입
 *
 * 기존 src/lib/scheduler/index.ts의 setInterval 방식을
 * 독립 프로세스로 분리한 구조.
 *
 * 기존 수집기 함수 (collectors/*) 를 100% 재사용하며,
 * 수집된 메트릭을 metrics_realtime / metrics_snapshot 테이블에 저장합니다.
 *
 * 사용법 (독립 실행):
 *   npx tsx src/lib/worker/collection-worker.ts
 *
 * 또는 API Route에서 시작:
 *   import { startWorker, stopWorker } from '@/lib/worker/collection-worker';
 */

import { db } from '@/db';
import { pgConnections, metricsRealtime, metricsSnapshotMeta, metricsSnapshot } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPgConfig } from '@/lib/pg/utils';
import {
  collectGlobalStats,
  collectSessions,
  collectWaitEvents,
  collectLocks,
  collectSqlStats,
  collectTableStats,
  collectVacuumStats,
} from '@/lib/pg/collectors';
import { type PgConnectionConfig } from '@/lib/pg/types';

// ─── Worker State ───────────────────────────────────────────

interface WorkerState {
  isRunning: boolean;
  realtimeIntervalId: ReturnType<typeof setInterval> | null;
  snapshotIntervalId: ReturnType<typeof setInterval> | null;
  hourlyIntervalId: ReturnType<typeof setInterval> | null;
  stats: {
    realtimeCollections: number;
    snapshotCollections: number;
    errors: number;
    lastRealtimeAt: Date | null;
    lastSnapshotAt: Date | null;
  };
  // Circuit breaker per connection
  circuitBreakers: Map<string, CircuitBreaker>;
}

interface CircuitBreaker {
  failures: number;
  lastFailure: Date | null;
  isOpen: boolean;
  nextRetryAt: Date | null;
}

const state: WorkerState = {
  isRunning: false,
  realtimeIntervalId: null,
  snapshotIntervalId: null,
  hourlyIntervalId: null,
  stats: {
    realtimeCollections: 0,
    snapshotCollections: 0,
    errors: 0,
    lastRealtimeAt: null,
    lastSnapshotAt: null,
  },
  circuitBreakers: new Map(),
};

// ─── Circuit Breaker ────────────────────────────────────────

const MAX_FAILURES = 3;
const BREAKER_RESET_MS = 5 * 60 * 1000; // 5분

function getBreaker(connectionId: string): CircuitBreaker {
  let breaker = state.circuitBreakers.get(connectionId);
  if (!breaker) {
    breaker = { failures: 0, lastFailure: null, isOpen: false, nextRetryAt: null };
    state.circuitBreakers.set(connectionId, breaker);
  }
  return breaker;
}

function recordFailure(connectionId: string): void {
  const breaker = getBreaker(connectionId);
  breaker.failures++;
  breaker.lastFailure = new Date();

  if (breaker.failures >= MAX_FAILURES) {
    breaker.isOpen = true;
    // Exponential backoff: 5s, 15s, 45s, 2min, 5min
    const backoffMs = Math.min(
      5000 * Math.pow(3, breaker.failures - MAX_FAILURES),
      BREAKER_RESET_MS,
    );
    breaker.nextRetryAt = new Date(Date.now() + backoffMs);
    console.warn(`[Worker] Circuit OPEN for ${connectionId}, retry at ${breaker.nextRetryAt.toISOString()}`);
  }
}

function recordSuccess(connectionId: string): void {
  const breaker = getBreaker(connectionId);
  breaker.failures = 0;
  breaker.isOpen = false;
  breaker.nextRetryAt = null;
}

function canCollect(connectionId: string): boolean {
  const breaker = getBreaker(connectionId);
  if (!breaker.isOpen) return true;
  if (breaker.nextRetryAt && new Date() >= breaker.nextRetryAt) {
    // Half-open: 재시도 허용
    return true;
  }
  return false;
}

// ─── Connection List ────────────────────────────────────────

interface ConnectionInfo {
  id: string;
  name: string;
  orgId: string | null;
}

async function getActiveConnections(): Promise<ConnectionInfo[]> {
  return db
    .select({
      id: pgConnections.id,
      name: pgConnections.name,
      orgId: pgConnections.orgId,
    })
    .from(pgConnections)
    .where(eq(pgConnections.isActive, true));
}

// ─── Real-time Collection (5초) ─────────────────────────────

async function collectRealtime(): Promise<void> {
  const connections = await getActiveConnections();

  await Promise.allSettled(
    connections.map(async (conn) => {
      if (!canCollect(conn.id)) return;

      try {
        const config = await getPgConfig(conn.id);
        if (!config) return;

        // 병렬로 실시간 메트릭 수집
        const [globalStats, sessions, waitEvents, locks] = await Promise.all([
          collectGlobalStats(config).catch(() => null),
          collectSessions(config).catch(() => null),
          collectWaitEvents(config).catch(() => null),
          collectLocks(config).catch(() => null),
        ]);

        const now = new Date();
        const tenantId = conn.orgId || conn.id; // 단일 테넌트: orgId=null → connectionId 사용
        const inserts = [];

        if (globalStats) {
          inserts.push({
            tenantId,
            connectionId: conn.id,
            collectedAt: now,
            metricType: 'global' as const,
            data: globalStats,
          });
        }

        if (sessions && sessions.length > 0) {
          inserts.push({
            tenantId,
            connectionId: conn.id,
            collectedAt: now,
            metricType: 'session' as const,
            data: {
              count: sessions.length,
              active: sessions.filter((s) => s.state === 'active').length,
              idle: sessions.filter((s) => s.state === 'idle').length,
              idleInTransaction: sessions.filter((s) => s.state === 'idle in transaction').length,
              sessions: sessions.slice(0, 50), // 상위 50개만 저장
            },
          });
        }

        if (waitEvents && waitEvents.length > 0) {
          inserts.push({
            tenantId,
            connectionId: conn.id,
            collectedAt: now,
            metricType: 'wait_event' as const,
            data: { events: waitEvents },
          });
        }

        if (locks && locks.length > 0) {
          inserts.push({
            tenantId,
            connectionId: conn.id,
            collectedAt: now,
            metricType: 'lock' as const,
            data: { locks: locks.slice(0, 100) },
          });
        }

        // 배치 INSERT
        if (inserts.length > 0) {
          await db.insert(metricsRealtime).values(inserts);
        }

        recordSuccess(conn.id);
        state.stats.realtimeCollections++;
      } catch (error: any) {
        recordFailure(conn.id);
        state.stats.errors++;
        console.error(`[Worker] Realtime collection failed for ${conn.name}:`, error.message);
      }
    }),
  );

  state.stats.lastRealtimeAt = new Date();
}

// ─── Snapshot Collection (5분) ──────────────────────────────

async function collectSnapshot(): Promise<void> {
  const connections = await getActiveConnections();

  for (const conn of connections) {
    if (!canCollect(conn.id)) continue;

    try {
      const config = await getPgConfig(conn.id);
      if (!config) continue;

      const tenantId = conn.orgId || conn.id;
      const now = new Date();

      // 글로벌 통계
      const globalStats = await collectGlobalStats(config);

      // SQL 통계 (상위 200개)
      const sqlStats = await collectSqlStats(config, 200);

      // 스냅샷 번호 계산 (해당 커넥션의 마지막 번호 + 1)
      const lastMeta = await db
        .select({ snapshotNumber: metricsSnapshotMeta.snapshotNumber })
        .from(metricsSnapshotMeta)
        .where(eq(metricsSnapshotMeta.connectionId, conn.id))
        .orderBy(metricsSnapshotMeta.snapshotNumber)
        .limit(1);

      const snapshotNumber = (lastMeta[0]?.snapshotNumber ?? 0) + 1;

      // 메타 저장
      await db.insert(metricsSnapshotMeta).values({
        tenantId,
        connectionId: conn.id,
        collectedAt: now,
        snapshotNumber,
        status: 'COMPLETED',
        tps: globalStats?.tps ?? null,
        activeBackends: globalStats?.active_backends ?? null,
        idleBackends: globalStats?.idle_backends ?? null,
        totalConnections: globalStats?.total_connections ?? null,
        cacheHitRatio: globalStats?.cache_hit_ratio ?? null,
        txCommitted: globalStats?.tx_committed ?? null,
        txRolledBack: globalStats?.tx_rolled_back ?? null,
        deadlocks: globalStats?.deadlocks ?? null,
        dbSizeBytes: globalStats?.db_size ?? null,
        sqlCount: sqlStats?.length ?? 0,
      });

      // SQL 통계 배치 저장 (50개씩)
      if (sqlStats && sqlStats.length > 0) {
        const BATCH_SIZE = 50;
        for (let i = 0; i < sqlStats.length; i += BATCH_SIZE) {
          const batch = sqlStats.slice(i, i + BATCH_SIZE);
          await db.insert(metricsSnapshot).values(
            batch.map((row) => ({
              tenantId,
              connectionId: conn.id,
              collectedAt: now,
              snapshotNumber,
              queryid: Number(row.queryid),
              queryText: row.query,
              username: row.username,
              calls: row.calls,
              totalExecTime: row.total_exec_time,
              meanExecTime: row.mean_exec_time,
              rows: row.rows,
              sharedBlksHit: row.shared_blks_hit,
              sharedBlksRead: row.shared_blks_read,
              tempBlksRead: row.temp_blks_read,
              tempBlksWritten: row.temp_blks_written,
              blkReadTime: row.blk_read_time,
              blkWriteTime: row.blk_write_time,
              // TODO: 델타 계산 - 이전 스냅샷과 비교
              deltaCalls: null,
              deltaTotalExecTime: null,
              deltaRows: null,
              deltaSharedBlksRead: null,
            })),
          );
        }
      }

      recordSuccess(conn.id);
      state.stats.snapshotCollections++;
      console.log(`[Worker] Snapshot #${snapshotNumber} completed for ${conn.name} (${sqlStats?.length ?? 0} SQLs)`);
    } catch (error: any) {
      recordFailure(conn.id);
      state.stats.errors++;
      console.error(`[Worker] Snapshot failed for ${conn.name}:`, error.message);
    }
  }

  state.stats.lastSnapshotAt = new Date();
}

// ─── Hourly Collection (1시간) ──────────────────────────────

async function collectHourly(): Promise<void> {
  const connections = await getActiveConnections();

  for (const conn of connections) {
    if (!canCollect(conn.id)) continue;

    try {
      const config = await getPgConfig(conn.id);
      if (!config) continue;

      const tenantId = conn.orgId || conn.id;
      const now = new Date();

      const [tableStats, vacuumStats] = await Promise.all([
        collectTableStats(config).catch(() => null),
        collectVacuumStats(config).catch(() => null),
      ]);

      const inserts = [];

      if (tableStats) {
        inserts.push({
          tenantId,
          connectionId: conn.id,
          collectedAt: now,
          metricType: 'table_stats' as const,
          data: { tables: tableStats.slice(0, 200) },
        });
      }

      if (vacuumStats) {
        inserts.push({
          tenantId,
          connectionId: conn.id,
          collectedAt: now,
          metricType: 'vacuum_stats' as const,
          data: { tables: vacuumStats.slice(0, 200) },
        });
      }

      if (inserts.length > 0) {
        await db.insert(metricsRealtime).values(inserts);
      }

      recordSuccess(conn.id);
    } catch (error: any) {
      recordFailure(conn.id);
      state.stats.errors++;
      console.error(`[Worker] Hourly collection failed for ${conn.name}:`, error.message);
    }
  }
}

// ─── Worker Lifecycle ───────────────────────────────────────

export interface WorkerConfig {
  realtimeIntervalMs?: number;   // 기본 5000 (5초)
  snapshotIntervalMs?: number;   // 기본 300000 (5분)
  hourlyIntervalMs?: number;     // 기본 3600000 (1시간)
}

export function startWorker(config: WorkerConfig = {}): void {
  if (state.isRunning) {
    console.log('[Worker] Already running');
    return;
  }

  const {
    realtimeIntervalMs = 5_000,
    snapshotIntervalMs = 300_000,
    hourlyIntervalMs = 3_600_000,
  } = config;

  state.isRunning = true;
  console.log(`[Worker] Starting (realtime: ${realtimeIntervalMs}ms, snapshot: ${snapshotIntervalMs}ms, hourly: ${hourlyIntervalMs}ms)`);

  // 즉시 첫 수집
  collectRealtime();
  collectSnapshot();

  // 주기적 수집 시작
  state.realtimeIntervalId = setInterval(collectRealtime, realtimeIntervalMs);
  state.snapshotIntervalId = setInterval(collectSnapshot, snapshotIntervalMs);
  state.hourlyIntervalId = setInterval(collectHourly, hourlyIntervalMs);
}

export function stopWorker(): void {
  if (!state.isRunning) return;

  if (state.realtimeIntervalId) clearInterval(state.realtimeIntervalId);
  if (state.snapshotIntervalId) clearInterval(state.snapshotIntervalId);
  if (state.hourlyIntervalId) clearInterval(state.hourlyIntervalId);

  state.realtimeIntervalId = null;
  state.snapshotIntervalId = null;
  state.hourlyIntervalId = null;
  state.isRunning = false;

  console.log('[Worker] Stopped');
}

export function getWorkerStatus() {
  return {
    isRunning: state.isRunning,
    ...state.stats,
    circuitBreakers: Object.fromEntries(
      Array.from(state.circuitBreakers.entries()).map(([id, breaker]) => [
        id,
        { failures: breaker.failures, isOpen: breaker.isOpen, nextRetryAt: breaker.nextRetryAt },
      ]),
    ),
  };
}

// ─── Standalone Execution ───────────────────────────────────

// npx tsx src/lib/worker/collection-worker.ts 로 직접 실행 가능
if (typeof require !== 'undefined' && require.main === module) {
  console.log('[Worker] Starting as standalone process...');

  startWorker({
    realtimeIntervalMs: parseInt(process.env.REALTIME_INTERVAL_MS || '5000'),
    snapshotIntervalMs: parseInt(process.env.SNAPSHOT_INTERVAL_MS || '300000'),
    hourlyIntervalMs: parseInt(process.env.HOURLY_INTERVAL_MS || '3600000'),
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('[Worker] SIGINT received, shutting down...');
    stopWorker();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[Worker] SIGTERM received, shutting down...');
    stopWorker();
    process.exit(0);
  });
}
