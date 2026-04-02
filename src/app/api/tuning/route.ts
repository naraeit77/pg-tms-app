import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-utils';
import { db } from '@/db';
import { tuningTasks, tuningHistory } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const connectionId = request.nextUrl.searchParams.get('connection_id');
    const status = request.nextUrl.searchParams.get('status');

    let query = db.select().from(tuningTasks).$dynamic();

    if (connectionId) {
      query = query.where(eq(tuningTasks.pgConnectionId, connectionId));
    }

    const tasks = await query.orderBy(desc(tuningTasks.createdAt)).limit(100);
    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    console.error('[TuningList]', error);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { connection_id, queryid, sql_text, priority, assigned_to, before_metrics } = body;

    const [task] = await db.insert(tuningTasks).values({
      pgConnectionId: connection_id,
      queryid,
      sqlText: sql_text,
      priority: priority || 'MEDIUM',
      assignedTo: assigned_to || null,
      beforeCalls: before_metrics?.calls,
      beforeTotalExecTime: before_metrics?.total_exec_time,
      beforeMeanExecTime: before_metrics?.mean_exec_time,
      beforeSharedBlksRead: before_metrics?.shared_blks_read,
      beforeRows: before_metrics?.rows,
      createdBy: session.user.id,
    }).returning();

    await db.insert(tuningHistory).values({
      taskId: task.id,
      userId: session.user.id,
      action: 'CREATED',
      toStatus: 'IDENTIFIED',
      comment: '튜닝 대상 등록',
    });

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error) {
    console.error('[TuningCreate]', error);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
