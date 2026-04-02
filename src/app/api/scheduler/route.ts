import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-utils';
import { startScheduler, stopScheduler, getSchedulerStatus } from '@/lib/scheduler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/scheduler - 상태 조회
 */
export async function GET() {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    return NextResponse.json({ success: true, data: getSchedulerStatus() });
  } catch (error) {
    console.error('[SchedulerStatus]', error);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

/**
 * POST /api/scheduler - 시작/중지
 * body: { action: 'start' | 'stop', snapshotInterval?: number, retentionDays?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

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
    console.error('[SchedulerAction]', error);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
