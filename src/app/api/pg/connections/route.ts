import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { pgConnections, auditLogs } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { encrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pg/connections
 * PostgreSQL 연결 목록 조회
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    return NextResponse.json(connections);
  } catch (error) {
    console.error('Failed to fetch connections:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/pg/connections
 * PostgreSQL 연결 생성
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, host, port, database, username, password, sslMode, searchPath, isDefault } = body;

    if (!name || !host || !database || !username || !password) {
      return NextResponse.json(
        { error: '필수 필드를 모두 입력해주세요 (이름, 호스트, 데이터베이스, 사용자명, 비밀번호)' },
        { status: 400 }
      );
    }

    // 비밀번호 암호화
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

    // 감사 로그 (실패해도 연결 생성에 영향 없도록)
    try {
      await db.insert(auditLogs).values({
        userId: session.user.id,
        action: 'CREATE_CONNECTION',
        resourceType: 'pg_connection',
        resourceId: newConnection.id,
        details: { name, host, port: port || 5432, database },
      });
    } catch (auditError) {
      console.error('Audit log failed:', auditError);
    }

    return NextResponse.json({ success: true, data: newConnection }, { status: 201 });
  } catch (error: any) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 같은 이름의 연결이 존재합니다.' }, { status: 400 });
    }
    console.error('Failed to create connection:', error?.message || error, error?.code, error?.detail);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
