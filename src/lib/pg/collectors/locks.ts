/**
 * pg_locks + pg_stat_activity 기반 락 수집
 */

import { executeQuery, type PgConnectionConfig } from '@/lib/pg';

export interface LockRow {
  pid: number;
  usename: string;
  datname: string;
  locktype: string;
  relation: string | null;
  mode: string;
  granted: boolean;
  wait_event_type: string | null;
  wait_event: string | null;
  state: string;
  query: string;
  query_duration_ms: number | null;
  blocking_pid: number | null;
  blocking_query: string | null;
}

export async function collectLocks(config: PgConnectionConfig): Promise<LockRow[]> {
  const sql = `
    SELECT
      l.pid,
      a.usename,
      a.datname,
      l.locktype,
      CASE
        WHEN l.relation IS NOT NULL THEN l.relation::regclass::text
        ELSE NULL
      END AS relation,
      l.mode,
      l.granted,
      a.wait_event_type,
      a.wait_event,
      a.state,
      a.query,
      CASE
        WHEN a.state = 'active' AND a.query_start IS NOT NULL
        THEN EXTRACT(EPOCH FROM (now() - a.query_start)) * 1000
        ELSE NULL
      END AS query_duration_ms,
      bl.pid AS blocking_pid,
      bla.query AS blocking_query
    FROM pg_locks l
    JOIN pg_stat_activity a ON l.pid = a.pid
    LEFT JOIN pg_locks bl ON (
      bl.relation = l.relation
      AND bl.granted = true
      AND bl.pid <> l.pid
      AND NOT l.granted
    )
    LEFT JOIN pg_stat_activity bla ON bl.pid = bla.pid
    WHERE a.pid <> pg_backend_pid()
      AND a.datname IS NOT NULL
    ORDER BY l.granted ASC, a.query_start ASC NULLS LAST
  `;

  const result = await executeQuery<LockRow>(config, sql);
  return result.rows;
}
