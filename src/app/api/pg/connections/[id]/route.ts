import { NextRequest } from 'next/server';
import { db } from '@/db';
import { pgConnections, auditLogs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { encrypt } from '@/lib/crypto';
import { invalidateConnectionCache } from '@/lib/pg/utils';
import {
  requireSession,
  apiSuccess,
  apiError,
} from '@/lib/api-utils';

/**
 * GET /api/pg/connections/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const { id } = await params;

    const [connection] = await db
      .select()
      .from(pgConnections)
      .where(and(eq(pgConnections.id, id), eq(pgConnections.userId, session.user.id)))
      .limit(1);

    if (!connection) {
      return apiError('연결을 찾을 수 없습니다.', 'NOT_FOUND', 404);
    }

    // 비밀번호는 반환하지 않음
    const { passwordEncrypted, ...safeConnection } = connection;

    return apiSuccess(safeConnection);
  } catch (error) {
    console.error('Failed to fetch connection:', error);
    return apiError('연결 조회에 실패했습니다.', 'INTERNAL_ERROR', 500);
  }
}

/**
 * PUT /api/pg/connections/[id]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const { id } = await params;
    const body = await request.json();
    const { name, description, host, port, database, username, password, sslMode, searchPath, isDefault } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (host !== undefined) updateData.host = host;
    if (port !== undefined) updateData.port = port;
    if (database !== undefined) updateData.database = database;
    if (username !== undefined) updateData.username = username;
    if (sslMode !== undefined) updateData.sslMode = sslMode;
    if (searchPath !== undefined) updateData.searchPath = searchPath;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (password) updateData.passwordEncrypted = encrypt(password);

    const [updated] = await db
      .update(pgConnections)
      .set(updateData)
      .where(and(eq(pgConnections.id, id), eq(pgConnections.userId, session.user.id)))
      .returning();

    if (!updated) {
      return apiError('연결을 찾을 수 없습니다.', 'NOT_FOUND', 404);
    }

    invalidateConnectionCache(id);

    try {
      await db.insert(auditLogs).values({
        userId: session.user.id,
        action: 'UPDATE_CONNECTION',
        resourceType: 'pg_connection',
        resourceId: id,
        details: { fields_updated: Object.keys(updateData).filter((k) => k !== 'updatedAt') },
      });
    } catch (auditError) {
      console.error('[Audit] UPDATE_CONNECTION log failed:', auditError);
    }

    return apiSuccess(updated);
  } catch (error) {
    console.error('Failed to update connection:', error);
    return apiError('연결 수정에 실패했습니다.', 'INTERNAL_ERROR', 500);
  }
}

/**
 * DELETE /api/pg/connections/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const { id } = await params;

    const [deleted] = await db
      .delete(pgConnections)
      .where(and(eq(pgConnections.id, id), eq(pgConnections.userId, session.user.id)))
      .returning({ id: pgConnections.id, name: pgConnections.name });

    if (!deleted) {
      return apiError('연결을 찾을 수 없습니다.', 'NOT_FOUND', 404);
    }

    invalidateConnectionCache(id);

    try {
      await db.insert(auditLogs).values({
        userId: session.user.id,
        action: 'DELETE_CONNECTION',
        resourceType: 'pg_connection',
        resourceId: id,
        details: { name: deleted.name },
      });
    } catch (auditError) {
      console.error('[Audit] DELETE_CONNECTION log failed:', auditError);
    }

    return apiSuccess({ id: deleted.id });
  } catch (error) {
    console.error('Failed to delete connection:', error);
    return apiError('연결 삭제에 실패했습니다.', 'INTERNAL_ERROR', 500);
  }
}
