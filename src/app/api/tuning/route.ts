import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { tuningTasks, tuningHistory } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const connectionId = request.nextUrl.searchParams.get('connection_id');
    const status = request.nextUrl.searchParams.get('status');

    let query = db.select().from(tuningTasks).$dynamic();

    if (connectionId) {
      query = query.where(eq(tuningTasks.pgConnectionId, connectionId));
    }

    const tasks = await query.orderBy(desc(tuningTasks.createdAt)).limit(100);
    return NextResponse.json({ success: true, data: tasks });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
