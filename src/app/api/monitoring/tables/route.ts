import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
import { getPgConfig } from '@/lib/pg/utils';
import { collectTableStats, collectIndexStats } from '@/lib/pg/collectors/table-stats';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const connectionId = request.nextUrl.searchParams.get('connection_id');
    if (!connectionId) {
      return NextResponse.json({ error: 'connection_id required' }, { status: 400 });
    }

    const type = request.nextUrl.searchParams.get('type') || 'tables';
    const config = await getPgConfig(connectionId, session.user.id);

    if (type === 'indexes') {
      const data = await collectIndexStats(config);
      return NextResponse.json({ success: true, data });
    }

    const data = await collectTableStats(config);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handlePgError(error, 'Tables');
  }
}
