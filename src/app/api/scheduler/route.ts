import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { startScheduler, stopScheduler, getSchedulerStatus } from '@/lib/scheduler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/scheduler - 상태 조회
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ success: true, data: getSchedulerStatus() });
  } catch (error) {
    console.error('Scheduler status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/scheduler - 시작/중지
 * body: { action: 'start' | 'stop', snapshotInterval?: number, retentionDays?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, snapshotInterval, retentionDays } = await request.json();

    if (action === 'start') {
      startScheduler(snapshotInterval || 300, retentionDays || 90);
    } else if (action === 'stop') {
      stopScheduler();
    } else {
      return NextResponse.json({ error: 'Invalid action. Use "start" or "stop"' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: getSchedulerStatus() });
  } catch (error) {
    console.error('Scheduler action error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
