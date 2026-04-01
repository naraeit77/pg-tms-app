import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { tuningTasks, tuningHistory } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const [task] = await db.select().from(tuningTasks).where(eq(tuningTasks.id, id)).limit(1);
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const history = await db.select().from(tuningHistory)
      .where(eq(tuningHistory.taskId, id))
      .orderBy(desc(tuningHistory.createdAt));

    return NextResponse.json({ success: true, data: { ...task, history } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
