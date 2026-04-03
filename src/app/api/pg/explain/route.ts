import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handlePgError } from '@/lib/api-utils';
import { getPgConfig } from '@/lib/pg/utils';
import { executeExplain, getPool } from '@/lib/pg/client';
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

    const config = await getPgConfig(connection_id, session.user.id);
    const hasParams = /\$\d+/.test(sql);

    let result: any;

    if (hasParams) {
      // 파라미터가 있는 SQL: PREPARE → EXPLAIN EXECUTE → DEALLOCATE
      const paramNums = [...new Set((sql.match(/\$\d+/g) || []).map((p: string) => parseInt(p.slice(1))))].sort((a, b) => a - b);
      const maxParam = Math.max(...paramNums);
      const types = Array(maxParam).fill('unknown').join(', ');
      const nulls = Array(maxParam).fill('NULL').join(', ');
      const stmtName = `_explain_${Date.now()}`;

      const pool = getPool(config);
      const client = await pool.connect();
      try {
        await client.query(`SET LOCAL statement_timeout = '${timeout}'`);
        await client.query(`PREPARE ${stmtName}(${types}) AS ${sql}`);
        const explainCmd = analyze
          ? `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE ${stmtName}(${nulls})`
          : `EXPLAIN (FORMAT JSON) EXECUTE ${stmtName}(${nulls})`;
        const res = await client.query(explainCmd);
        await client.query(`DEALLOCATE ${stmtName}`);

        const planData = res.rows?.[0]?.['QUERY PLAN'];
        const plan = Array.isArray(planData) ? planData[0] : planData;
        result = {
          plan,
          planningTimeMs: plan?.['Planning Time'],
          executionTimeMs: plan?.['Execution Time'],
          rawJson: planData,
        };
      } finally {
        client.release();
      }
    } else {
      result = await executeExplain(config, sql, analyze, timeout);
    }

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
