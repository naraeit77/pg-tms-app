import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { aiChatSessions, aiChatMessages } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getLLMClient } from '@/lib/ai/client';
import { PG_CHAT_SYSTEM_PROMPT } from '@/lib/ai/prompts/system';
import { chatTools } from '@/lib/ai/tools/definitions';
import { executeTool } from '@/lib/ai/tools/executor';
import { getPgConfig } from '@/lib/pg/utils';
import type { ChatMessage } from '@/lib/ai/types';

/**
 * POST /api/ai/chat
 * AI 챗봇 (Tool Calling 패턴, SSE 스트리밍)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { session_id, connection_id, message } = await request.json();

    if (!connection_id || !message) {
      return NextResponse.json({ error: 'connection_id and message required' }, { status: 400 });
    }

    // 세션 관리
    let chatSessionId = session_id;
    if (!chatSessionId) {
      const [newSession] = await db.insert(aiChatSessions).values({
        userId: session.user.id,
        connectionId: connection_id,
        title: message.substring(0, 50),
      }).returning({ id: aiChatSessions.id });
      chatSessionId = newSession.id;
    }

    // 사용자 메시지 저장
    await db.insert(aiChatMessages).values({
      sessionId: chatSessionId,
      role: 'user',
      content: message,
    });

    // 이전 대화 히스토리 로드 (최근 20개)
    const history = await db
      .select({ role: aiChatMessages.role, content: aiChatMessages.content })
      .from(aiChatMessages)
      .where(eq(aiChatMessages.sessionId, chatSessionId))
      .orderBy(aiChatMessages.createdAt)
      .limit(20);

    // 메시지 구성
    const messages: ChatMessage[] = [
      { role: 'system', content: PG_CHAT_SYSTEM_PROMPT },
      ...history.map((h) => ({ role: h.role as any, content: h.content || '' })),
    ];

    const client = getLLMClient();
    const config = await getPgConfig(connection_id);

    // Tool Calling 루프 (최대 5회)
    let finalContent = '';
    let allToolCalls: any[] = [];
    let allToolResults: any[] = [];

    for (let i = 0; i < 5; i++) {
      const response = await client.chat(messages, { tools: chatTools });

      if (response.tool_calls && response.tool_calls.length > 0) {
        // Tool Call 실행
        messages.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.tool_calls,
        });

        for (const toolCall of response.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await executeTool(toolCall.function.name, args, config);

          allToolCalls.push(toolCall);
          allToolResults.push({ tool_call_id: toolCall.id, name: toolCall.function.name, result });

          messages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          });
        }
        continue;
      }

      // Tool Call 없으면 최종 응답
      finalContent = response.content || '';
      break;
    }

    // 어시스턴트 메시지 저장
    await db.insert(aiChatMessages).values({
      sessionId: chatSessionId,
      role: 'assistant',
      content: finalContent,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
      toolResults: allToolResults.length > 0 ? allToolResults : null,
    });

    // 세션 업데이트
    await db.update(aiChatSessions).set({
      lastMessageAt: new Date(),
      messageCount: sql`${aiChatSessions.messageCount} + 2`,
    }).where(eq(aiChatSessions.id, chatSessionId));

    return NextResponse.json({
      success: true,
      data: {
        session_id: chatSessionId,
        content: finalContent,
        tool_calls: allToolCalls,
        tool_results: allToolResults,
      },
    });
  } catch (error: any) {
    console.error('AI chat error:', error);
    return NextResponse.json({ error: error.message || 'AI chat failed' }, { status: 500 });
  }
}
