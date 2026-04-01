import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPgConfig } from '@/lib/pg/utils';
import { killSession } from '@/lib/pg/collectors/sessions';
import { db } from '@/db';
import { auditLogs } from '@/db/schema';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { connection_id, pid } = await request.json();
    if (!connection_id || !pid) {
      return NextResponse.json({ error: 'connection_id and pid required' }, { status: 400 });
    }

    const config = await getPgConfig(connection_id);
    const terminated = await killSession(config, pid);

    await db.insert(auditLogs).values({
      userId: session.user.id,
      action: 'KILL_SESSION',
      resourceType: 'pg_session',
      details: { connection_id, pid, terminated },
    });

    return NextResponse.json({ success: true, data: { terminated } });
  } catch (error: any) {
    console.error('Kill session error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
