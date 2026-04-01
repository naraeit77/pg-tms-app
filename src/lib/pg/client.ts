/**
 * PostgreSQL 대상 DB 커넥션 풀 관리
 * ora_tms/src/lib/oracle/client.ts 패턴 참조하여 구현
 */

import { Pool, PoolConfig } from 'pg';
import { PgConnectionConfig, PgQueryResult, PgHealthCheckResult, PgExplainResult } from './types';

// 대상 DB별 커넥션 풀 Map
const pools: Map<string, Pool> = new Map();

/**
 * 대상 PG DB에 대한 커넥션 풀을 가져오거나 생성
 */
export function getPool(config: PgConnectionConfig): Pool {
  const poolKey = `${config.host}:${config.port}/${config.database}/${config.username}`;

  let pool = pools.get(poolKey);
  if (pool) return pool;

  const poolConfig: PoolConfig = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    max: config.maxConnections || 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: config.connectionTimeout || 30000,
    application_name: config.applicationName || 'pg-tms',
  };

  // SSL 설정: disable/prefer는 SSL 없이, require는 인증서 미검증, verify-full은 완전 검증
  if (config.sslMode === 'require') {
    poolConfig.ssl = { rejectUnauthorized: false };
  } else if (config.sslMode === 'verify-full') {
    poolConfig.ssl = true;
  }
  // 'disable' 및 'prefer'는 ssl 설정 안 함 (pg 드라이버 기본값: SSL 없이 연결)

  pool = new Pool(poolConfig);

  pool.on('error', (err) => {
    console.error(`[PG Pool Error] ${poolKey}:`, err.message);
  });

  pools.set(poolKey, pool);
  return pool;
}

/**
 * 대상 PG DB에 쿼리 실행
 */
export async function executeQuery<T = any>(
  config: PgConnectionConfig,
  sql: string,
  params?: any[]
): Promise<PgQueryResult<T>> {
  const pool = getPool(config);
  const client = await pool.connect();

  try {
    // search_path 설정
    if (config.searchPath && config.searchPath !== 'public') {
      await client.query(`SET search_path TO ${config.searchPath}`);
    }

    const result = await client.query(sql, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0,
      fields: result.fields?.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    };
  } finally {
    client.release();
  }
}

/**
 * 대상 PG DB 헬스 체크
 */
export async function healthCheck(config: PgConnectionConfig): Promise<PgHealthCheckResult> {
  const startTime = Date.now();

  try {
    const pool = getPool(config);
    const client = await pool.connect();

    try {
      // 버전 확인
      const versionResult = await client.query('SELECT version()');
      const versionString = versionResult.rows[0]?.version || '';
      const versionMatch = versionString.match(/PostgreSQL (\d+\.\d+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      // pg_stat_statements 확장 확인
      let pgStatStatementsEnabled = false;
      let pgStatStatementsHasData = false;
      try {
        const countResult = await client.query('SELECT COUNT(*)::int AS cnt FROM pg_stat_statements');
        pgStatStatementsEnabled = true;
        pgStatStatementsHasData = (countResult.rows[0]?.cnt || 0) > 0;
      } catch {
        pgStatStatementsEnabled = false;
      }

      return {
        isHealthy: true,
        version,
        pgStatStatementsEnabled,
        pgStatStatementsHasData,
        responseTimeMs: Date.now() - startTime,
      };
    } finally {
      client.release();
    }
  } catch (error: any) {
    return {
      isHealthy: false,
      pgStatStatementsEnabled: false,
      error: error.message,
      responseTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 실행
 * 안전 장치: 트랜잭션 래핑 + 타임아웃 + ROLLBACK
 */
export async function executeExplain(
  config: PgConnectionConfig,
  sql: string,
  analyze: boolean = false,
  timeoutMs: number = 30000
): Promise<PgExplainResult> {
  const pool = getPool(config);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = '${timeoutMs}'`);

    // 읽기 전용 보장 (ANALYZE 시에도 변경 방지)
    if (analyze) {
      await client.query('SET LOCAL default_transaction_read_only = on');
    }

    const explainQuery = analyze
      ? `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`
      : `EXPLAIN (FORMAT JSON) ${sql}`;

    const result = await client.query(explainQuery);
    const plan = result.rows[0]?.['QUERY PLAN'];

    await client.query('ROLLBACK');

    return {
      plan: plan?.[0] || plan,
      executionTimeMs: plan?.[0]?.['Execution Time'],
      planningTimeMs: plan?.[0]?.['Planning Time'],
      rawJson: JSON.stringify(plan, null, 2),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 특정 연결의 커넥션 풀 종료
 */
export async function closePool(config: PgConnectionConfig): Promise<void> {
  const poolKey = `${config.host}:${config.port}/${config.database}/${config.username}`;
  const pool = pools.get(poolKey);
  if (pool) {
    await pool.end();
    pools.delete(poolKey);
  }
}

/**
 * 모든 커넥션 풀 종료
 */
export async function closeAllPools(): Promise<void> {
  const closePromises = Array.from(pools.values()).map((pool) => pool.end());
  await Promise.all(closePromises);
  pools.clear();
}
