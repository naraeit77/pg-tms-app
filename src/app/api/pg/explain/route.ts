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
      const pool = getPool(config);
      const client = await pool.connect();
      try {
        await client.query(`SET statement_timeout = '${timeout}'`);

        const explainPrefix = analyze
          ? 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)'
          : 'EXPLAIN (FORMAT JSON)';

        // 1차: PREPARE/EXECUTE 방식 (text 타입)
        const paramNums = [...new Set((sql.match(/\$\d+/g) || []).map((p: string) => parseInt(p.slice(1))))] as number[];
        paramNums.sort((a: number, b: number) => a - b);
        const maxParam = Math.max(...paramNums);
        const types = Array(maxParam).fill('text').join(', ');
        const nulls = Array(maxParam).fill('NULL').join(', ');
        const stmtName = `_explain_${Date.now()}`;

        let success = false;

        try {
          await client.query(`PREPARE ${stmtName}(${types}) AS ${sql}`);
          const res = await client.query(`${explainPrefix} EXECUTE ${stmtName}(${nulls})`);
          await client.query(`DEALLOCATE ${stmtName}`);
          const planData = res.rows?.[0]?.['QUERY PLAN'];
          const plan = Array.isArray(planData) ? planData[0] : planData;
          result = { plan, planningTimeMs: plan?.['Planning Time'], executionTimeMs: plan?.['Execution Time'], rawJson: planData };
          success = true;
        } catch {
          try { await client.query(`DEALLOCATE ${stmtName}`); } catch { /* ignore */ }
        }

        // 2차: $N → NULL 치환 후 직접 EXPLAIN, 미인식 식별자도 반복 치환
        if (!success) {
          let retrySql = sql.replace(/\$\d+/g, 'NULL');
          let lastError: any = null;

          for (let attempt = 0; attempt < 10; attempt++) {
            try {
              const res = await client.query(`${explainPrefix} ${retrySql}`);
              const planData = res.rows?.[0]?.['QUERY PLAN'];
              const plan = Array.isArray(planData) ? planData[0] : planData;
              result = { plan, planningTimeMs: plan?.['Planning Time'], executionTimeMs: plan?.['Execution Time'], rawJson: planData };
              success = true;
              break;
            } catch (err: any) {
              lastError = err;
              // "column "X" does not exist" 또는 한글 locale 대응 (다양한 PG 버전/로케일)
              const colMatch = err?.message?.match(/column "([^"]+)" does not exist/)
                || err?.message?.match(/"([^"]+)" 열이 없습니다/)
                || err?.message?.match(/열 "([^"]+)".*존재하지 않습니다/)
                || err?.message?.match(/"([^"]+)".*칼럼이 없습니다/)
                || err?.message?.match(/"([^"]+)".*이름의 칼럼/);
              if (colMatch) {
                retrySql = retrySql.replace(new RegExp(`\\b${colMatch[1]}\\b`, 'g'), 'NULL');
                continue;
              }
              // 복구 불가능한 에러는 루프 탈출
              break;
            }
          }

          if (!success) {
            const errMsg = lastError?.message || 'EXPLAIN 실행 실패';
            throw new Error(`EXPLAIN 실행 실패: ${errMsg}`);
          }
        }
      } finally {
        await client.query("SET statement_timeout = '0'").catch(() => {});
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
    const message = error instanceof Error ? error.message : String(error);
    // EXPLAIN 실행 실패는 상세 메시지 전달 (디버깅 지원)
    if (message.includes('EXPLAIN')) {
      console.error('[Explain]', message);
      return NextResponse.json({ error: message, code: 'QUERY_ERROR' }, { status: 400 });
    }
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
