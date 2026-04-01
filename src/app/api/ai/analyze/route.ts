import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getLLMClient } from '@/lib/ai/client';
import { PG_SYSTEM_PROMPT } from '@/lib/ai/prompts/system';
import { buildSqlAnalysisPrompt, buildExplainAnalysisPrompt } from '@/lib/ai/prompts/analysis';
import { db } from '@/db';
import { aiAnalysisHistory } from '@/db/schema';
import type { ChatMessage } from '@/lib/ai/types';

/**
 * POST /api/ai/analyze
 * SQL 분석 / 실행계획 분석
 * body: { type: 'sql' | 'explain', metrics?, planJson?, sqlText?, connection_id }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, metrics, planJson, sqlText, connection_id } = body;

    let userPrompt: string;
    if (type === 'explain' && planJson) {
      userPrompt = buildExplainAnalysisPrompt(planJson, sqlText);
    } else if (type === 'sql' && metrics) {
      userPrompt = buildSqlAnalysisPrompt(metrics);
    } else {
      return NextResponse.json({ error: 'Invalid request. Need type + metrics or planJson' }, { status: 400 });
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: PG_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    const client = getLLMClient();
    const response = await client.chat(messages);

    // JSON 파싱 시도
    let parsed = null;
    try {
      const jsonMatch = response.content.match(/```json\s*([\s\S]*?)```/) ||
                         response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
    } catch {}

    // 분석 이력 저장
    await db.insert(aiAnalysisHistory).values({
      connectionId: connection_id,
      analysisType: type,
      queryid: metrics?.queryid?.toString(),
      request: body,
      response: { content: response.content, parsed },
      createdBy: session.user.id,
    });

    return NextResponse.json({
      success: true,
      data: {
        content: response.content,
        parsed,
      },
    });
  } catch (error: any) {
    console.error('AI analyze error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
