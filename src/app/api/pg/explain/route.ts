import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPgConfig } from '@/lib/pg/utils';
import { executeExplain } from '@/lib/pg/client';
import { db } from '@/db';
import { pgExecutionPlans } from '@/db/schema';

/**
 * POST /api/pg/explain
 * EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 실행
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { connection_id, sql, analyze = false, timeout = 30000, queryid, save = false } = await request.json();

    if (!connection_id || !sql) {
      return NextResponse.json({ error: 'connection_id and sql required' }, { status: 400 });
    }

    const config = await getPgConfig(connection_id);
    const result = await executeExplain(config, sql, analyze, timeout);

    // 저장 옵션
    if (save && result.plan) {
      const plan = result.plan;
      const nodeTypes = extractNodeTypes(plan.Plan || plan);

      await db.insert(pgExecutionPlans).values({
        connectionId: connection_id,
        queryid: queryid || null,
        sqlText: sql,
        planJson: result.plan,
        planningTimeMs: result.planningTimeMs,
        executionTimeMs: result.executionTimeMs,
        totalCost: plan.Plan?.['Total Cost'] || plan['Total Cost'],
        nodeTypes,
        createdBy: session.user.id,
      });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('EXPLAIN error:', error);
    return NextResponse.json({ error: error.message || 'EXPLAIN failed' }, { status: 500 });
  }
}

function extractNodeTypes(node: any, types: Set<string> = new Set()): string[] {
  if (!node) return Array.from(types);
  if (node['Node Type']) types.add(node['Node Type']);
  if (node.Plans) {
    for (const child of node.Plans) {
      extractNodeTypes(child, types);
    }
  }
  return Array.from(types);
}
