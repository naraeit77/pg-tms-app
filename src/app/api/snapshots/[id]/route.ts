import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const snapshot = await getSnapshot(id);

    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: snapshot });
  } catch (error) {
    console.error('Failed to fetch snapshot:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    console.error('Failed to delete snapshot:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
