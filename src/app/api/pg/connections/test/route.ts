import { NextRequest } from 'next/server';
import { healthCheck, closePool } from '@/lib/pg/client';
import { PgConnectionConfig } from '@/lib/pg/types';
import {
  requireSession,
  apiSuccess,
  apiError,
  validateRequired,
} from '@/lib/api-utils';

/**
 * POST /api/pg/connections/test
 * 연결 테스트 (저장 전 사용)
 */
export async function POST(request: NextRequest) {
  try {
    const { errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { host, port, database, username, password, sslMode } = body;

    const missingError = validateRequired(body, ['host', 'database', 'username', 'password']);
    if (missingError) {
      return apiError(missingError, 'BAD_REQUEST', 400);
    }

    const config: PgConnectionConfig = {
      id: 'test',
      name: 'test-connection',
      host,
      port: port || 5432,
      database,
      username,
      password,
      sslMode: sslMode || 'prefer',
      connectionTimeout: 10000,
    };

    const result = await healthCheck(config);

    // 테스트 후 풀 정리
    await closePool(config).catch(() => {});

    return apiSuccess(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Connection test failed:', message);
    return apiSuccess({
      isHealthy: false,
      error: message,
      pgStatStatementsEnabled: false,
      responseTimeMs: 0,
    });
  }
}
