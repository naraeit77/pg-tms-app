import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { pgTmsSnapshots } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createSnapshot } from '@/lib/pg/snapshot';

export const dynamic = 'force-dynamic';

/**
 * GET /api/snapshots?connection_id=...&limit=50
 * 스냅샷 목록 조회
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

    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');

    const snapshots = await db
      .select()
      .from(pgTmsSnapshots)
      .where(eq(pgTmsSnapshots.connectionId, connectionId))
      .orderBy(desc(pgTmsSnapshots.createdAt))
      .limit(limit);

    return NextResponse.json({ success: true, data: snapshots });
  } catch (error) {
    console.error('Failed to fetch snapshots:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/snapshots
 * 수동 스냅샷 생성
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { connection_id } = await request.json();
    if (!connection_id) {
      return NextResponse.json({ error: 'connection_id required' }, { status: 400 });
    }

    const snapshotId = await createSnapshot(connection_id);

    return NextResponse.json({ success: true, data: { id: snapshotId } }, { status: 201 });
  } catch (error: any) {
    console.error('Failed to create snapshot:', error);
    return NextResponse.json({ error: error.message || 'Failed to create snapshot' }, { status: 500 });
  }
}
