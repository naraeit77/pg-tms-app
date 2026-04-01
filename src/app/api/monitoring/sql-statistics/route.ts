import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPgConfig } from '@/lib/pg/utils';
import { collectSqlStats } from '@/lib/pg/collectors/sql-stats';

export const dynamic = 'force-dynamic';

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

    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100');
    const orderBy = request.nextUrl.searchParams.get('order_by') || 'total_exec_time';

    const config = await getPgConfig(connectionId);
    const data = await collectSqlStats(config, limit, orderBy);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('SQL statistics error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
