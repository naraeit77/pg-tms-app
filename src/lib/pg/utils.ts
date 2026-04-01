/**
 * PG 연결 유틸리티
 * DB에서 연결 정보 로드 + 비밀번호 복호화
 */

import { db } from '@/db';
import { pgConnections } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from '@/lib/crypto';
import { PgConnectionConfig } from './types';

// 연결 정보 캐시 (TTL: 5분)
const connectionCache = new Map<string, { config: PgConnectionConfig; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000;

/**
 * connectionId로 DB에서 연결 정보를 로드하고 비밀번호를 복호화
 */
export async function getPgConfig(connectionId: string): Promise<PgConnectionConfig> {
  // 캐시 확인
  const cached = connectionCache.get(connectionId);
  if (cached && cached.expiry > Date.now()) {
    return cached.config;
  }

  // DB에서 연결 정보 조회
  const [connection] = await db
    .select()
    .from(pgConnections)
    .where(eq(pgConnections.id, connectionId))
    .limit(1);

  if (!connection) {
    throw new Error(`Connection not found: ${connectionId}`);
  }

  if (!connection.isActive) {
    throw new Error(`Connection is inactive: ${connection.name}`);
  }

  // 비밀번호 복호화
  const password = decrypt(connection.passwordEncrypted);

  const config: PgConnectionConfig = {
    id: connection.id,
    name: connection.name,
    host: connection.host,
    port: connection.port || 5432,
    database: connection.database,
    username: connection.username,
    password,
    sslMode: connection.sslMode || 'prefer',
    searchPath: connection.searchPath || 'public',
    applicationName: connection.applicationName || 'pg-tms',
    maxConnections: connection.maxConnections || 10,
    connectionTimeout: connection.connectionTimeout || 30000,
  };

  // 캐시 저장
  connectionCache.set(connectionId, {
    config,
    expiry: Date.now() + CACHE_TTL,
  });

  return config;
}

/**
 * 캐시 무효화
 */
export function invalidateConnectionCache(connectionId?: string): void {
  if (connectionId) {
    connectionCache.delete(connectionId);
  } else {
    connectionCache.clear();
  }
}
