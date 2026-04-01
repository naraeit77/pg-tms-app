import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { healthCheck, closePool } from '@/lib/pg/client';
import { PgConnectionConfig } from '@/lib/pg/types';

/**
 * POST /api/pg/connections/test
 * 연결 테스트 (저장 전 사용)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { host, port, database, username, password, sslMode } = body;

    if (!host || !database || !username || !password) {
      return NextResponse.json(
        { error: '필수 필드를 모두 입력해주세요' },
        { status: 400 }
      );
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

    // 테스트 후 풀 정리 (캐시된 풀이 남지 않도록)
    await closePool(config).catch(() => {});

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Connection test failed:', error);
    return NextResponse.json(
      { success: false, data: { isHealthy: false, error: error.message, pgStatStatementsEnabled: false, responseTimeMs: 0 } },
      { status: 200 }
    );
  }
}
