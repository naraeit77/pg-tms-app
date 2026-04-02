import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-utils';
import { db } from '@/db';
import { pgTmsSnapshots } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSnapshot } from '@/lib/pg/snapshot';

/**
 * GET /api/snapshots/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const { id } = await params;
    const snapshot = await getSnapshot(id);

    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: snapshot });
  } catch (error) {
    console.error('[SnapshotDetail]', error);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

/**
 * DELETE /api/snapshots/[id]
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
      .delete(pgTmsSnapshots)
      .where(eq(pgTmsSnapshots.id, id))
      .returning({ id: pgTmsSnapshots.id });

    if (!deleted) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[SnapshotDelete]', error);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
