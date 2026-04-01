/**
 * pg_stat_activity 기반 Wait Events 집계
 */

import { executeQuery, type PgConnectionConfig } from '@/lib/pg';

export interface WaitEventRow {
  wait_event_type: string;
  wait_event: string;
  count: number;
}

export async function collectWaitEvents(config: PgConnectionConfig): Promise<WaitEventRow[]> {
  const sql = `
    SELECT
      wait_event_type,
      wait_event,
      COUNT(*) AS count
    FROM pg_stat_activity
    WHERE wait_event IS NOT NULL
      AND pid <> pg_backend_pid()
      AND datname IS NOT NULL
    GROUP BY wait_event_type, wait_event
    ORDER BY count DESC
  `;

  const result = await executeQuery<WaitEventRow>(config, sql);
  return result.rows;
}
