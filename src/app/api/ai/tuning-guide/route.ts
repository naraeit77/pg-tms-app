import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/api-utils';
import { getLLMClient } from '@/lib/ai/client';
import { PG_SYSTEM_PROMPT } from '@/lib/ai/prompts/system';
import { db } from '@/db';
import { aiAnalysisHistory } from '@/db/schema';
import type { ChatMessage } from '@/lib/ai/types';

const CONTEXT_PROMPTS: Record<string, string> = {
  tuning: `PostgreSQL SQL 성능 분석 및 튜닝 전문가로서 답변합니다.
아래 SQL의 성능을 분석하고 구체적인 튜닝 권고사항을 제시하세요.
- 인덱스 추가/변경 DDL
- SQL 재작성 제안
- PostgreSQL 파라미터 조정
- 예상 개선 효과`,
  explain: `PostgreSQL 실행계획 해석 전문가로서 답변합니다.
아래 SQL과 실행계획을 이해하기 쉽게 설명하세요.
- 각 노드(Seq Scan, Index Scan, Hash Join 등)의 의미
- 비용(cost)과 행 수 해석
- 병목 지점 식별
- 개선 방향 제안`,
  index: `PostgreSQL 인덱스 설계 전문가로서 답변합니다.
아래 SQL을 분석하여 최적의 인덱스를 설계하세요.
- B-Tree, Hash, GiST, GIN, BRIN 중 적합한 인덱스 유형
- 복합 인덱스 컬럼 순서 결정 근거
- 부분 인덱스(Partial Index) 가능성
- 커버링 인덱스(Index Only Scan) 가능성
- CREATE INDEX DDL 코드`,
  rewrite: `PostgreSQL SQL 최적화 전문가로서 답변합니다.
아래 SQL을 더 효율적인 SQL로 재작성하세요.
- 서브쿼리 → JOIN 변환
- EXISTS vs IN 최적화
- CTE(WITH) 활용
- 윈도우 함수 활용
- 불필요한 정렬/그룹핑 제거
- 원본 SQL과 재작성 SQL 비교`,
};

/**
 * POST /api/ai/tuning-guide
 * AI 튜닝 가이드 - 스트리밍 응답
 */
export async function POST(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const {
      sql_text,
      execution_plan,
      context = 'tuning',
      language = 'ko',
      metrics,
      follow_up,
      conversation_history,
      user_question,
      connection_id,
    } = body;

    if (!sql_text?.trim() && !follow_up) {
      return new Response(JSON.stringify({ error: 'SQL이 필요합니다' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const contextPrompt = CONTEXT_PROMPTS[context] || CONTEXT_PROMPTS.tuning;
    const langDirective = language === 'en' ? 'Answer in English.' : '한국어로 답변하세요.';

    const messages: ChatMessage[] = [
      { role: 'system', content: `${PG_SYSTEM_PROMPT}\n\n${contextPrompt}\n\n${langDirective}` },
    ];

    if (follow_up && conversation_history) {
      // 추가 질문: 이전 대화 컨텍스트 포함
      for (const msg of conversation_history) {
        messages.push({ role: msg.role, content: msg.content });
      }
      messages.push({
        role: 'user',
        content: `이전 분석 대상 SQL:\n\`\`\`sql\n${sql_text}\n\`\`\`\n\n${execution_plan ? `실행계획:\n${execution_plan}\n\n` : ''}사용자의 추가 질문: ${user_question}`,
      });
    } else {
      // 초기 분석 요청
      let userContent = `## 분석 대상 SQL\n\`\`\`sql\n${sql_text}\n\`\`\``;

      if (execution_plan?.trim()) {
        userContent += `\n\n## 실행계획\n\`\`\`\n${execution_plan}\n\`\`\``;
      }

      if (metrics && metrics.calls > 0) {
        userContent += `\n\n## pg_stat_statements 성능 메트릭
- 실행 횟수 (calls): ${metrics.calls?.toLocaleString()}
- 총 실행시간: ${metrics.total_exec_time?.toFixed(1)}ms
- 평균 실행시간: ${metrics.mean_exec_time?.toFixed(2)}ms
- 처리 행수: ${metrics.rows?.toLocaleString()}
- Shared Blocks Hit: ${metrics.shared_blks_hit?.toLocaleString()}
- Shared Blocks Read: ${metrics.shared_blks_read?.toLocaleString()}
- Temp Blocks Written: ${metrics.temp_blks_written?.toLocaleString()}`;
      }

      messages.push({ role: 'user', content: userContent });
    }

    // 스트리밍 응답
    const client = getLLMClient();
    const stream = client.streamChat(messages);

    const encoder = new TextEncoder();
    let fullContent = '';

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.content) {
              fullContent += chunk.content;
              const sseData = `data: ${JSON.stringify({ type: 'content', content: chunk.content })}\n\n`;
              controller.enqueue(encoder.encode(sseData));
            }
            if (chunk.done) {
              const doneData = `data: ${JSON.stringify({ type: 'done' })}\n\n`;
              controller.enqueue(encoder.encode(doneData));
            }
          }

          // 분석 이력 저장 (비동기)
          if (!follow_up && connection_id) {
            db.insert(aiAnalysisHistory)
              .values({
                connectionId: connection_id,
                analysisType: `tuning_guide_${context}`,
                request: { sql_text, context, language },
                response: { content: fullContent },
                createdBy: session.user!.id,
              })
              .catch((err: Error) => console.error('Failed to save analysis history:', err));
          }
        } catch (error) {
          const errorData = `data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : String(error) })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
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
    console.error('[TuningGuide]', error);
    return new Response(JSON.stringify({ error: '요청 처리 중 오류가 발생했습니다.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
