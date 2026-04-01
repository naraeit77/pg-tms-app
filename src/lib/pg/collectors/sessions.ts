/**
 * pg_stat_activity 기반 세션 수집
 */

import { executeQuery, type PgConnectionConfig } from '@/lib/pg';

export interface SessionRow {
  pid: number;
  datname: string;
  usename: string;
  application_name: string;
  client_addr: string;
  client_port: number;
  backend_type: string;
  state: string;
  wait_event_type: string | null;
  wait_event: string | null;
  query: string;
  query_start: string | null;
  xact_start: string | null;
  state_change: string | null;
  backend_start: string | null;
  query_duration_ms: number | null;
}

export async function collectSessions(config: PgConnectionConfig): Promise<SessionRow[]> {
  const sql = `
    SELECT
      pid,
      datname,
      usename,
      application_name,
      client_addr::text,
      client_port,
      backend_type,
      state,
      wait_event_type,
      wait_event,
      query,
      query_start,
      xact_start,
      state_change,
      backend_start,
      CASE
        WHEN state = 'active' AND query_start IS NOT NULL
        THEN EXTRACT(EPOCH FROM (now() - query_start)) * 1000
        ELSE NULL
      END AS query_duration_ms
    FROM pg_stat_activity
    WHERE pid <> pg_backend_pid()
      AND datname IS NOT NULL
    ORDER BY
      CASE state WHEN 'active' THEN 0 WHEN 'idle in transaction' THEN 1 ELSE 2 END,
      query_start ASC NULLS LAST
  `;

  const result = await executeQuery<SessionRow>(config, sql);
  return result.rows;
}

export async function killSession(config: PgConnectionConfig, pid: number): Promise<boolean> {
  const sql = `SELECT pg_terminate_backend($1) AS terminated`;
  const result = await executeQuery<{ terminated: boolean }>(config, sql, [pid]);
  return result.rows[0]?.terminated ?? false;
}
