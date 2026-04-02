import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
import { compareSnapshots } from '@/lib/pg/snapshot';

export const dynamic = 'force-dynamic';

/**
 * GET /api/snapshots/compare?id1=...&id2=...
 */
export async function GET(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const id1 = request.nextUrl.searchParams.get('id1');
    const id2 = request.nextUrl.searchParams.get('id2');

    if (!id1 || !id2) {
      return NextResponse.json({ error: 'id1 and id2 required' }, { status: 400 });
    }

    const result = await compareSnapshots(id1, id2);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handlePgError(error, 'SnapshotCompare');
  }
}
