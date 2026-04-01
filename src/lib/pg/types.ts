/**
 * PostgreSQL 대상 DB 연결 관련 타입 정의
 */

export interface PgConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode?: string;
  searchPath?: string;
  applicationName?: string;
  maxConnections?: number;
  connectionTimeout?: number;
}

export interface PgQueryResult<T = any> {
  rows: T[];
  rowCount: number;
  fields?: { name: string; dataTypeID: number }[];
}

export interface PgHealthCheckResult {
  isHealthy: boolean;
  version?: string;
  pgStatStatementsEnabled: boolean;
  pgStatStatementsHasData?: boolean;
  error?: string;
  responseTimeMs: number;
}

export interface PgExplainResult {
  plan: any;
  executionTimeMs?: number;
  planningTimeMs?: number;
  rawJson: string;
}
