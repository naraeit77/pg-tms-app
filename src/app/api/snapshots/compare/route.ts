import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { compareSnapshots } from '@/lib/pg/snapshot';

export const dynamic = 'force-dynamic';

/**
 * GET /api/snapshots/compare?id1=...&id2=...
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id1 = request.nextUrl.searchParams.get('id1');
    const id2 = request.nextUrl.searchParams.get('id2');

    if (!id1 || !id2) {
      return NextResponse.json({ error: 'id1 and id2 required' }, { status: 400 });
    }

    const result = await compareSnapshots(id1, id2);
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Failed to compare snapshots:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
