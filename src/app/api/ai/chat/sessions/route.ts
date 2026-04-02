import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-utils';
import { db } from '@/db';
import { aiChatSessions } from '@/db/schema';
import { eq, desc, inArray, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const sessions = await db
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.userId, session.user.id))
      .orderBy(desc(aiChatSessions.lastMessageAt))
      .limit(50);

    return NextResponse.json({ success: true, data: sessions });
  } catch (error) {
    console.error('[ChatSessions GET]', error);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const { id, ids, all } = await request.json();

    if (all) {
      // 전체 삭제
      await db.delete(aiChatSessions).where(eq(aiChatSessions.userId, session.user.id));
    } else if (ids && Array.isArray(ids) && ids.length > 0) {
      // 선택 삭제
      await db.delete(aiChatSessions).where(
        and(eq(aiChatSessions.userId, session.user.id), inArray(aiChatSessions.id, ids))
      );
    } else if (id) {
      // 단건 삭제
      await db.delete(aiChatSessions).where(
        and(eq(aiChatSessions.userId, session.user.id), eq(aiChatSessions.id, id))
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ChatSessions DELETE]', error);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
