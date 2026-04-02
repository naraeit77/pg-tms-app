import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
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
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const { connection_id, sql, analyze = false, timeout = 30000, queryid, save = false } = await request.json();

    if (!connection_id || !sql) {
      return NextResponse.json({ error: 'connection_id and sql required' }, { status: 400 });
    }

    // pg_stat_statements의 $1, $2 등 파라미터를 NULL로 치환 (EXPLAIN은 실행하지 않으므로 안전)
    const safeSql = sql.replace(/\$\d+/g, 'NULL');

    const config = await getPgConfig(connection_id, session.user.id);
    const result = await executeExplain(config, safeSql, analyze, timeout);

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
  } catch (error) {
    return handlePgError(error, 'Explain');
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
