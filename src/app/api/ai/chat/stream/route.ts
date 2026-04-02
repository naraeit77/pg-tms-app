import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/api-utils';
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
 * POST /api/ai/chat/stream
 * AI 챗봇 — SSE 스트리밍 응답 + Tool Calling
 */
export async function POST(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const { session_id, connection_id, message } = await request.json();

    if (!connection_id || !message) {
      return new Response(JSON.stringify({ error: 'connection_id and message required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
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

    const messages: ChatMessage[] = [
      { role: 'system', content: PG_CHAT_SYSTEM_PROMPT },
      ...history.map((h) => ({ role: h.role as any, content: h.content || '' })),
    ];

    const client = getLLMClient();
    const config = await getPgConfig(connection_id, session.user.id);

    const encoder = new TextEncoder();
    let allToolCalls: any[] = [];
    let allToolResults: any[] = [];
    let fullContent = '';

    const send = (controller: ReadableStreamDefaultController, data: any) => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    };

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Send session_id immediately
          send(controller, { type: 'session', session_id: chatSessionId });

          // Tool Calling 루프 (최대 5회)
          for (let i = 0; i < 5; i++) {
            const response = await client.chat(messages, { tools: chatTools });

            if (response.tool_calls && response.tool_calls.length > 0) {
              // Notify client about tool calls
              for (const toolCall of response.tool_calls) {
                send(controller, {
                  type: 'tool_start',
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments,
                });

                messages.push({
                  role: 'assistant',
                  content: response.content || '',
                  tool_calls: [toolCall],
                });

                const args = typeof toolCall.function.arguments === 'string'
                  ? JSON.parse(toolCall.function.arguments)
                  : toolCall.function.arguments;
                const result = await executeTool(toolCall.function.name, args, config);

                allToolCalls.push(toolCall);
                allToolResults.push({ tool_call_id: toolCall.id, name: toolCall.function.name, result });

                send(controller, {
                  type: 'tool_result',
                  name: toolCall.function.name,
                  result: result.substring(0, 500), // preview
                });

                messages.push({
                  role: 'tool',
                  content: result,
                  tool_call_id: toolCall.id,
                });
              }
              continue;
            }

            // 최종 응답 — 스트리밍
            fullContent = response.content || '';
            break;
          }

          // Stream final content using streamChat for the final generation
          if (!fullContent) {
            // If tool loop exhausted without final content, do one more call without tools
            const finalResponse = await client.chat(messages);
            fullContent = finalResponse.content || '';
          }

          // Send content in chunks for smooth rendering
          const chunkSize = 20;
          for (let i = 0; i < fullContent.length; i += chunkSize) {
            const chunk = fullContent.substring(i, i + chunkSize);
            send(controller, { type: 'content', content: chunk });
            // Small delay for smooth rendering
            await new Promise(r => setTimeout(r, 10));
          }

          send(controller, { type: 'done' });

          // 어시스턴트 메시지 저장
          await db.insert(aiChatMessages).values({
            sessionId: chatSessionId,
            role: 'assistant',
            content: fullContent,
            toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
            toolResults: allToolResults.length > 0 ? allToolResults : null,
          });

          // 세션 업데이트
          await db.update(aiChatSessions).set({
            lastMessageAt: new Date(),
            messageCount: sql`${aiChatSessions.messageCount} + 2`,
          }).where(eq(aiChatSessions.id, chatSessionId));

        } catch (error) {
          send(controller, {
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '요청 처리 중 오류가 발생했습니다.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
