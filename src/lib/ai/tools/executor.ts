/**
 * AI 챗봇 Tool 실행기
 * Tool Call을 받아 대상 PG DB에서 실행 후 결과 반환
 */

import { executeQuery, executeExplain, type PgConnectionConfig } from '@/lib/pg';

export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  config: PgConnectionConfig
): Promise<string> {
  try {
    switch (toolName) {
      case 'query_stats':
        return await executeQueryStats(args, config);
      case 'explain_query':
        return await executeExplainQuery(args, config);
      case 'table_info':
        return await executeTableInfo(args, config);
      case 'index_info':
        return await executeIndexInfo(args, config);
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (error: any) {
    return JSON.stringify({ error: error.message });
  }
}

async function executeQueryStats(args: any, config: PgConnectionConfig): Promise<string> {
  const orderBy = args.order_by || 'total_exec_time';
  const limit = args.limit || 10;
  const search = args.search;

  const validColumns = ['total_exec_time', 'calls', 'mean_exec_time', 'shared_blks_read', 'rows', 'temp_blks_written'];
  const safeOrder = validColumns.includes(orderBy) ? orderBy : 'total_exec_time';

  let sql = `
    SELECT queryid, query, calls, total_exec_time, mean_exec_time, rows,
           shared_blks_hit, shared_blks_read, temp_blks_written,
           pg_catalog.pg_get_userbyid(userid) AS username
    FROM pg_stat_statements
    WHERE query NOT LIKE '%pg_stat_statements%'
  `;
  const params: any[] = [];

  if (search) {
    params.push(`%${search}%`);
    sql += ` AND query ILIKE $${params.length}`;
  }

  sql += ` ORDER BY ${safeOrder} DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await executeQuery(config, sql, params);
  return JSON.stringify(result.rows.map((r: any) => ({
    queryid: r.queryid,
    query: r.query?.substring(0, 200),
    calls: r.calls,
    total_exec_time_ms: parseFloat(r.total_exec_time?.toFixed(1)),
    mean_exec_time_ms: parseFloat(r.mean_exec_time?.toFixed(2)),
    rows: r.rows,
    shared_blks_read: r.shared_blks_read,
    username: r.username,
  })));
}

async function executeExplainQuery(args: any, config: PgConnectionConfig): Promise<string> {
  const result = await executeExplain(config, args.sql, args.analyze || false, 15000);
  return JSON.stringify({
    plan: result.plan,
    planning_time_ms: result.planningTimeMs,
    execution_time_ms: result.executionTimeMs,
  });
}

async function executeTableInfo(args: any, config: PgConnectionConfig): Promise<string> {
  const tableName = args.table_name;
  const parts = tableName.includes('.') ? tableName.split('.') : ['public', tableName];

  const result = await executeQuery(config, `
    SELECT
      c.column_name, c.data_type, c.is_nullable, c.column_default,
      c.character_maximum_length
    FROM information_schema.columns c
    WHERE c.table_schema = $1 AND c.table_name = $2
    ORDER BY c.ordinal_position
  `, [parts[0], parts[1]]);

  const statsResult = await executeQuery(config, `
    SELECT
      pg_table_size(c.oid) AS table_size,
      pg_indexes_size(c.oid) AS indexes_size,
      s.n_live_tup, s.n_dead_tup, s.seq_scan, s.idx_scan
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = $1 AND c.relname = $2
  `, [parts[0], parts[1]]);

  return JSON.stringify({
    columns: result.rows,
    stats: statsResult.rows[0] || null,
  });
}

async function executeIndexInfo(args: any, config: PgConnectionConfig): Promise<string> {
  const tableName = args.table_name;
  const parts = tableName.includes('.') ? tableName.split('.') : ['public', tableName];

  const result = await executeQuery(config, `
    SELECT
      i.indexname AS index_name,
      i.indexdef AS index_definition,
      pg_relation_size(ix.indexrelid) AS index_size,
      s.idx_scan, s.idx_tup_read, s.idx_tup_fetch
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.tablename
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = i.schemaname
    JOIN pg_index ix ON ix.indexrelid = (
      SELECT oid FROM pg_class WHERE relname = i.indexname AND relnamespace = n.oid
    )
    LEFT JOIN pg_stat_user_indexes s ON s.indexrelname = i.indexname AND s.schemaname = i.schemaname
    WHERE i.schemaname = $1 AND i.tablename = $2
    ORDER BY s.idx_scan DESC NULLS LAST
  `, [parts[0], parts[1]]);

  return JSON.stringify(result.rows);
}
