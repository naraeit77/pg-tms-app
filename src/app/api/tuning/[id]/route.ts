import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-utils';
import { db } from '@/db';
import { tuningTasks, tuningHistory } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const { id } = await params;
    const [task] = await db.select().from(tuningTasks).where(eq(tuningTasks.id, id)).limit(1);
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const history = await db.select().from(tuningHistory)
      .where(eq(tuningHistory.taskId, id))
      .orderBy(desc(tuningHistory.createdAt));

    return NextResponse.json({ success: true, data: { ...task, history } });
  } catch (error) {
    console.error('[TuningDetail]', error);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const { id } = await params;
    const body = await request.json();
    const { status, assigned_to, tuning_notes, tuning_result, after_metrics, comment } = body;

    const [current] = await db.select().from(tuningTasks).where(eq(tuningTasks.id, id)).limit(1);
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updateData: any = { updatedAt: new Date() };
    if (status) updateData.status = status;
    if (assigned_to !== undefined) updateData.assignedTo = assigned_to;
    if (tuning_notes) updateData.tuningNotes = tuning_notes;
    if (tuning_result) updateData.tuningResult = tuning_result;
    if (after_metrics) {
      updateData.afterCalls = after_metrics.calls;
      updateData.afterTotalExecTime = after_metrics.total_exec_time;
      updateData.afterMeanExecTime = after_metrics.mean_exec_time;
      updateData.afterSharedBlksRead = after_metrics.shared_blks_read;
      updateData.afterRows = after_metrics.rows;
      if (current.beforeMeanExecTime && after_metrics.mean_exec_time) {
        updateData.improvementPct = ((current.beforeMeanExecTime - after_metrics.mean_exec_time) / current.beforeMeanExecTime) * 100;
      }
    }
    if (status === 'COMPLETED') updateData.completedAt = new Date();

    const [updated] = await db.update(tuningTasks).set(updateData).where(eq(tuningTasks.id, id)).returning();

    await db.insert(tuningHistory).values({
      taskId: id,
      userId: session.user.id,
      action: status ? 'STATUS_CHANGED' : 'UPDATED',
      fromStatus: current.status,
      toStatus: status || current.status,
      comment: comment || null,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('[TuningUpdate]', error);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
