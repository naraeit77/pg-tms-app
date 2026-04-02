import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
import { getPgConfig } from '@/lib/pg/utils';
import { collectSqlStats } from '@/lib/pg/collectors/sql-stats';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const connectionId = request.nextUrl.searchParams.get('connection_id');
    if (!connectionId) {
      return NextResponse.json({ error: 'connection_id required' }, { status: 400 });
    }

    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100');
    const orderBy = request.nextUrl.searchParams.get('order_by') || 'total_exec_time';

    const config = await getPgConfig(connectionId, session.user.id);
    const data = await collectSqlStats(config, limit, orderBy);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handlePgError(error, 'SQL statistics');
  }
}
