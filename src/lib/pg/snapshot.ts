/**
 * PG-TMS 스냅샷 시스템
 * 모든 수집기 호출 → 스냅샷 테이블 저장 → 이전 대비 델타 계산
 */

import { db } from '@/db';
import { pgTmsSnapshots, pgTmsSnapSqlStats, pgTmsSnapWaitStats } from '@/db/schema';
import { eq, and, desc, lt } from 'drizzle-orm';
import { getPgConfig } from './utils';
import { collectSqlStats } from './collectors/sql-stats';
import { collectWaitEvents } from './collectors/wait-events';
import { collectGlobalStats } from './collectors/global-stats';

/**
 * 스냅샷 생성: 모든 수집기 실행 → DB 저장 → 델타 계산
 */
export async function createSnapshot(connectionId: string): Promise<string> {
  const startTime = Date.now();
  const config = await getPgConfig(connectionId);

  // 스냅샷 번호 결정
  const [lastSnapshot] = await db
    .select({ snapshotNumber: pgTmsSnapshots.snapshotNumber })
    .from(pgTmsSnapshots)
    .where(eq(pgTmsSnapshots.connectionId, connectionId))
    .orderBy(desc(pgTmsSnapshots.snapshotNumber))
    .limit(1);

  const snapshotNumber = (lastSnapshot?.snapshotNumber || 0) + 1;

  try {
    // 글로벌 통계 수집
    const globalStats = await collectGlobalStats(config);

    // 스냅샷 메타 생성
    const [snapshot] = await db
      .insert(pgTmsSnapshots)
      .values({
        connectionId,
        snapshotNumber,
        status: 'IN_PROGRESS',
        tps: globalStats.tps,
        activeBackends: globalStats.active_backends,
        idleBackends: globalStats.idle_backends,
        totalConnections: globalStats.total_connections,
        cacheHitRatio: globalStats.cache_hit_ratio,
        txCommitted: globalStats.tx_committed,
        txRolledBack: globalStats.tx_rolled_back,
        deadlocks: globalStats.deadlocks,
        tempBytes: globalStats.temp_bytes,
        walBytes: globalStats.wal_bytes,
        checkpointsReq: globalStats.checkpoints_req,
        checkpointsTimed: globalStats.checkpoints_timed,
      })
      .returning({ id: pgTmsSnapshots.id });

    const snapshotId = snapshot.id;

    // SQL 통계 수집 + 저장
    const sqlStats = await collectSqlStats(config, 200);

    // 이전 스냅샷의 SQL 통계 (델타 계산용)
    const [prevSnapshot] = await db
      .select({ id: pgTmsSnapshots.id })
      .from(pgTmsSnapshots)
      .where(
        and(
          eq(pgTmsSnapshots.connectionId, connectionId),
          lt(pgTmsSnapshots.snapshotNumber, snapshotNumber)
        )
      )
      .orderBy(desc(pgTmsSnapshots.snapshotNumber))
      .limit(1);

    let prevSqlMap = new Map<number, any>();
    if (prevSnapshot) {
      const prevSqlStats = await db
        .select()
        .from(pgTmsSnapSqlStats)
        .where(eq(pgTmsSnapSqlStats.snapshotId, prevSnapshot.id));

      prevSqlStats.forEach((row) => {
        prevSqlMap.set(row.queryid, row);
      });
    }

    // SQL 통계 저장 (배치 insert)
    if (sqlStats.length > 0) {
      const sqlValues = sqlStats.map((s) => {
        const prev = prevSqlMap.get(Number(s.queryid));
        return {
          snapshotId,
          queryid: Number(s.queryid),
          query: s.query,
          username: s.username,
          calls: s.calls,
          totalExecTime: s.total_exec_time,
          meanExecTime: s.mean_exec_time,
          rows: s.rows,
          sharedBlksHit: s.shared_blks_hit,
          sharedBlksRead: s.shared_blks_read,
          tempBlksRead: s.temp_blks_read,
          tempBlksWritten: s.temp_blks_written,
          blkReadTime: s.blk_read_time,
          blkWriteTime: s.blk_write_time,
          deltaCalls: prev ? s.calls - (prev.calls || 0) : null,
          deltaTotalExecTime: prev ? s.total_exec_time - (prev.totalExecTime || 0) : null,
          deltaRows: prev ? s.rows - (prev.rows || 0) : null,
          deltaSharedBlksRead: prev ? s.shared_blks_read - (prev.sharedBlksRead || 0) : null,
        };
      });

      // 50개씩 배치 insert
      for (let i = 0; i < sqlValues.length; i += 50) {
        const batch = sqlValues.slice(i, i + 50);
        await db.insert(pgTmsSnapSqlStats).values(batch);
      }
    }

    // Wait Events 수집 + 저장
    const waitEvents = await collectWaitEvents(config);
    if (waitEvents.length > 0) {
      await db.insert(pgTmsSnapWaitStats).values(
        waitEvents.map((w) => ({
          snapshotId,
          waitEventType: w.wait_event_type,
          waitEvent: w.wait_event,
          count: w.count,
        }))
      );
    }

    // 스냅샷 완료 업데이트
    const durationMs = Date.now() - startTime;
    await db
      .update(pgTmsSnapshots)
      .set({ status: 'COMPLETED', durationMs })
      .where(eq(pgTmsSnapshots.id, snapshotId));

    return snapshotId;
  } catch (error: any) {
    // 에러 발생 시 스냅샷 상태를 ERROR로
    console.error(`[Snapshot] Failed for connection ${connectionId}:`, error);
    throw error;
  }
}

/**
 * 스냅샷 조회
 */
export async function getSnapshot(snapshotId: string) {
  const [snapshot] = await db
    .select()
    .from(pgTmsSnapshots)
    .where(eq(pgTmsSnapshots.id, snapshotId))
    .limit(1);

  if (!snapshot) return null;

  const sqlStats = await db
    .select()
    .from(pgTmsSnapSqlStats)
    .where(eq(pgTmsSnapSqlStats.snapshotId, snapshotId));

  const waitStats = await db
    .select()
    .from(pgTmsSnapWaitStats)
    .where(eq(pgTmsSnapWaitStats.snapshotId, snapshotId));

  return { ...snapshot, sqlStats, waitStats };
}

/**
 * 두 스냅샷 비교 (성능 악화/개선 쿼리 식별)
 */
export async function compareSnapshots(snapshotId1: string, snapshotId2: string) {
  const [snap1, snap2] = await Promise.all([
    getSnapshot(snapshotId1),
    getSnapshot(snapshotId2),
  ]);

  if (!snap1 || !snap2) {
    throw new Error('One or both snapshots not found');
  }

  // queryid 기준 매핑
  const snap1Map = new Map(snap1.sqlStats.map((s) => [s.queryid, s]));
  const snap2Map = new Map(snap2.sqlStats.map((s) => [s.queryid, s]));

  const allQueryIds = new Set([...snap1Map.keys(), ...snap2Map.keys()]);
  const comparison = Array.from(allQueryIds).map((queryid) => {
    const s1 = snap1Map.get(queryid);
    const s2 = snap2Map.get(queryid);
    return {
      queryid,
      query: s2?.query || s1?.query,
      snap1: s1 ? { calls: s1.calls, totalExecTime: s1.totalExecTime, meanExecTime: s1.meanExecTime, sharedBlksRead: s1.sharedBlksRead } : null,
      snap2: s2 ? { calls: s2.calls, totalExecTime: s2.totalExecTime, meanExecTime: s2.meanExecTime, sharedBlksRead: s2.sharedBlksRead } : null,
      execTimeDelta: s1 && s2 ? (s2.totalExecTime || 0) - (s1.totalExecTime || 0) : null,
      callsDelta: s1 && s2 ? (s2.calls || 0) - (s1.calls || 0) : null,
    };
  });

  // 성능 악화 순으로 정렬
  comparison.sort((a, b) => (b.execTimeDelta || 0) - (a.execTimeDelta || 0));

  return {
    snapshot1: { id: snap1.id, snapshotNumber: snap1.snapshotNumber, createdAt: snap1.createdAt },
    snapshot2: { id: snap2.id, snapshotNumber: snap2.snapshotNumber, createdAt: snap2.createdAt },
    comparison,
    summary: {
      totalQueries: comparison.length,
      degraded: comparison.filter((c) => (c.execTimeDelta || 0) > 0).length,
      improved: comparison.filter((c) => (c.execTimeDelta || 0) < 0).length,
      newQueries: comparison.filter((c) => !c.snap1).length,
      removedQueries: comparison.filter((c) => !c.snap2).length,
    },
  };
}

/**
 * 오래된 스냅샷 정리
 */
export async function purgeOldSnapshots(connectionId: string, retentionDays: number = 90): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const deleted = await db
    .delete(pgTmsSnapshots)
    .where(
      and(
        eq(pgTmsSnapshots.connectionId, connectionId),
        lt(pgTmsSnapshots.createdAt, cutoff)
      )
    )
    .returning({ id: pgTmsSnapshots.id });

  return deleted.length;
}
