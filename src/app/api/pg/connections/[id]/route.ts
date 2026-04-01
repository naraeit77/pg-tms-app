import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { pgConnections, auditLogs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { encrypt } from '@/lib/crypto';
import { invalidateConnectionCache } from '@/lib/pg/utils';

/**
 * GET /api/pg/connections/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const [connection] = await db
      .select()
      .from(pgConnections)
      .where(and(eq(pgConnections.id, id), eq(pgConnections.userId, session.user.id)))
      .limit(1);

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    // 비밀번호는 반환하지 않음
    const { passwordEncrypted, ...safeConnection } = connection;

    return NextResponse.json({ success: true, data: safeConnection });
  } catch (error) {
    console.error('Failed to fetch connection:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, description, host, port, database, username, password, sslMode, searchPath, isDefault } = body;

    const updateData: any = {
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
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    // 캐시 무효화
    invalidateConnectionCache(id);

    // 감사 로그
    await db.insert(auditLogs).values({
      userId: session.user.id,
      action: 'UPDATE_CONNECTION',
      resourceType: 'pg_connection',
      resourceId: id,
      details: { fields_updated: Object.keys(updateData).filter((k) => k !== 'updatedAt') },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Failed to update connection:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const [deleted] = await db
      .delete(pgConnections)
      .where(and(eq(pgConnections.id, id), eq(pgConnections.userId, session.user.id)))
      .returning({ id: pgConnections.id, name: pgConnections.name });

    if (!deleted) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    // 캐시 무효화
    invalidateConnectionCache(id);

    // 감사 로그
    await db.insert(auditLogs).values({
      userId: session.user.id,
      action: 'DELETE_CONNECTION',
      resourceType: 'pg_connection',
      resourceId: id,
      details: { name: deleted.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete connection:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
