import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { pgConnections, auditLogs } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { encrypt } from '@/lib/crypto';
import {
  requireSession,
  apiSuccess,
  apiError,
  validateRequired,
} from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pg/connections
 * PostgreSQL 연결 목록 조회 (현재 사용자 소유만)
 */
export async function GET() {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const connections = await db
      .select({
        id: pgConnections.id,
        name: pgConnections.name,
        description: pgConnections.description,
        host: pgConnections.host,
        port: pgConnections.port,
        database: pgConnections.database,
        username: pgConnections.username,
        ssl_mode: pgConnections.sslMode,
        pg_version: pgConnections.pgVersion,
        pg_stat_statements_enabled: pgConnections.pgStatStatementsEnabled,
        is_active: pgConnections.isActive,
        is_default: pgConnections.isDefault,
        health_status: pgConnections.healthStatus,
        last_connected_at: pgConnections.lastConnectedAt,
        last_health_check_at: pgConnections.lastHealthCheckAt,
        created_at: pgConnections.createdAt,
      })
      .from(pgConnections)
      .where(and(
        eq(pgConnections.userId, session.user.id),
        eq(pgConnections.isActive, true),
      ))
      .orderBy(desc(pgConnections.isDefault), pgConnections.name);

    // 프론트엔드 호환: 배열 직접 반환 (database-selector, connections page에서 .map() 사용)
    return NextResponse.json(connections);
  } catch (error) {
    console.error('Failed to fetch connections:', error);
    return apiError('연결 목록 조회에 실패했습니다.', 'INTERNAL_ERROR', 500);
  }
}

/**
 * POST /api/pg/connections
 * PostgreSQL 연결 생성
 */
export async function POST(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { name, description, host, port, database, username, password, sslMode, searchPath, isDefault } = body;

    const missingError = validateRequired(body, ['name', 'host', 'database', 'username', 'password']);
    if (missingError) {
      return apiError(missingError, 'BAD_REQUEST', 400);
    }

    const passwordEncrypted = encrypt(password);

    const [newConnection] = await db
      .insert(pgConnections)
      .values({
        userId: session.user.id,
        name,
        description: description || null,
        host,
        port: port || 5432,
        database,
        username,
        passwordEncrypted,
        sslMode: sslMode || 'prefer',
        searchPath: searchPath || 'public',
        isDefault: isDefault || false,
        createdBy: session.user.id,
      })
      .returning();

    // 감사 로그 (실패해도 연결 생성에 영향 없음)
    try {
      await db.insert(auditLogs).values({
        userId: session.user.id,
        action: 'CREATE_CONNECTION',
        resourceType: 'pg_connection',
        resourceId: newConnection.id,
        details: { name, host, port: port || 5432, database },
      });
    } catch (auditError) {
      console.error('[Audit] CREATE_CONNECTION log failed:', auditError);
    }

    return apiSuccess(newConnection, 201);
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === '23505') {
      return apiError('이미 같은 이름의 연결이 존재합니다.', 'CONFLICT', 409);
    }
    console.error('Failed to create connection:', err.message);
    return apiError('연결 생성에 실패했습니다.', 'INTERNAL_ERROR', 500);
  }
}
