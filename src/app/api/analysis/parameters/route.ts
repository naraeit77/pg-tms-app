import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPgConfig } from '@/lib/pg/utils';
import { executeQuery } from '@/lib/pg';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analysis/parameters?connection_id=...&category=all
 * PG 파라미터 조회 (WhaTap DB 파라미터 스타일)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const connectionId = request.nextUrl.searchParams.get('connection_id');
    if (!connectionId) {
      return NextResponse.json({ error: 'connection_id required' }, { status: 400 });
    }

    const category = request.nextUrl.searchParams.get('category') || 'all';
    const config = await getPgConfig(connectionId);

    let whereClause = '';
    switch (category) {
      case 'memory':
        whereClause = `WHERE category = 'Resource Usage / Memory'`;
        break;
      case 'wal':
        whereClause = `WHERE category LIKE '%WAL%' OR category LIKE '%Replication%'`;
        break;
      case 'autovacuum':
        whereClause = `WHERE name LIKE 'autovacuum%' OR name LIKE 'vacuum%'`;
        break;
      case 'connections':
        whereClause = `WHERE category = 'Connections and Authentication'`;
        break;
      case 'query':
        whereClause = `WHERE category LIKE '%Query%' OR category LIKE '%Planner%' OR category LIKE '%Optimizer%'`;
        break;
      case 'logging':
        whereClause = `WHERE category LIKE '%Reporting%' OR category LIKE '%Log%'`;
        break;
    }

    const result = await executeQuery<{
      name: string;
      setting: string;
      unit: string | null;
      category: string;
      short_desc: string;
      context: string;
      source: string;
      boot_val: string;
      reset_val: string;
      pending_restart: boolean;
    }>(config, `
      SELECT name, setting, unit, category, short_desc,
        context, source, boot_val, reset_val, pending_restart
      FROM pg_settings
      ${whereClause}
      ORDER BY category, name
    `);

    // 변경된 파라미터 (boot_val != setting)
    const changed = result.rows.filter(
      (r) => r.setting !== r.boot_val && r.boot_val !== null
    );

    return NextResponse.json({
      success: true,
      data: {
        parameters: result.rows,
        changedCount: changed.length,
        totalCount: result.rows.length,
        categories: [...new Set(result.rows.map((r) => r.category))].sort(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
