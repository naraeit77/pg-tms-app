import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPgConfig } from '@/lib/pg/utils';
import { executeQuery, executeExplain } from '@/lib/pg/client';
import { getLLMClient } from '@/lib/ai/client';
import { PG_SYSTEM_PROMPT } from '@/lib/ai/prompts/system';
import { db } from '@/db';
import { aiAnalysisHistory } from '@/db/schema';
import type { ChatMessage } from '@/lib/ai/types';

interface TableInfo {
  name: string;
  alias?: string;
  schema?: string;
  columns: ColumnInfo[];
  existingIndexes: ExistingIndex[];
  estimatedRows?: number;
  seqScanCount?: number;
  idxScanCount?: number;
}

interface ColumnInfo {
  name: string;
  type: string;
  usedIn: ('where' | 'join' | 'orderby' | 'groupby' | 'select')[];
  hasIndex: boolean;
  indexName?: string;
}

interface JoinInfo {
  leftTable: string;
  rightTable: string;
  leftColumn: string;
  rightColumn: string;
  joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
}

interface ExistingIndex {
  name: string;
  columns: string[];
  type: string;
  isUnique: boolean;
  size?: string;
  scanCount?: number;
}

interface IndexRecommendation {
  table: string;
  columns: string[];
  type: string;
  ddl: string;
  reason: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedImprovement: string;
}

interface QueryArtifactsResult {
  tables: TableInfo[];
  joins: JoinInfo[];
  recommendations: IndexRecommendation[];
  explainPlan?: any;
  accessPaths: AccessPath[];
  hints?: string;
  summary: {
    tableCount: number;
    joinCount: number;
    existingIndexCount: number;
    missingIndexCount: number;
    overallHealthScore: number;
  };
}

interface AccessPath {
  step: number;
  table: string;
  accessType: string;
  condition?: string;
  estimatedCost?: number;
}

/**
 * POST /api/ai/query-artifacts
 * 쿼리 아티팩트 분석 - 인덱스 생성도 + 최적화 분석
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { sql, connectionId, options = {} } = body;

    if (!sql?.trim()) {
      return NextResponse.json({ error: 'SQL이 필요합니다' }, { status: 400 });
    }

    let explainPlan: any = null;
    let tableStats: TableInfo[] = [];

    // 연결이 있으면 실제 DB에서 정보 수집
    if (connectionId) {
      const config = await getPgConfig(connectionId);

      // 1) EXPLAIN 실행
      try {
        const explainResult = await executeExplain(config, sql, false, 15000);
        explainPlan = explainResult.plan;
      } catch (e: any) {
        console.warn('EXPLAIN failed:', e.message);
      }

      // 2) SQL에서 테이블 추출 후 인덱스/통계 조회
      const tables = extractTablesFromSQL(sql);

      for (const t of tables) {
        const tableName = t.name;
        const schema = t.schema || 'public';

        try {
          // 테이블 컬럼 조회
          const colResult = await executeQuery(config, `
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2
            ORDER BY ordinal_position
          `, [schema, tableName]);

          // 인덱스 조회
          const idxResult = await executeQuery(config, `
            SELECT
              i.relname AS index_name,
              ix.indisunique AS is_unique,
              am.amname AS index_type,
              array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS columns,
              pg_relation_size(i.oid) AS index_size,
              COALESCE(psi.idx_scan, 0) AS scan_count
            FROM pg_index ix
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_am am ON am.oid = i.relam
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            LEFT JOIN pg_stat_user_indexes psi ON psi.indexrelid = i.oid
            WHERE n.nspname = $1 AND t.relname = $2
            GROUP BY i.relname, ix.indisunique, am.amname, i.oid, psi.idx_scan
          `, [schema, tableName]);

          // 테이블 통계
          const statResult = await executeQuery(config, `
            SELECT
              COALESCE(seq_scan, 0) AS seq_scan_count,
              COALESCE(idx_scan, 0) AS idx_scan_count,
              COALESCE(n_live_tup, 0) AS estimated_rows
            FROM pg_stat_user_tables
            WHERE schemaname = $1 AND relname = $2
          `, [schema, tableName]);

          const stat = statResult.rows[0];
          const usedColumns = extractColumnsForTable(sql, tableName, t.alias);

          tableStats.push({
            name: tableName,
            alias: t.alias,
            schema,
            columns: colResult.rows.map((c: any) => {
              const usage = usedColumns.find(u => u.name.toLowerCase() === c.column_name.toLowerCase());
              const matchingIdx = idxResult.rows.find((idx: any) =>
                idx.columns.some((col: string) => col.toLowerCase() === c.column_name.toLowerCase())
              );
              return {
                name: c.column_name,
                type: c.data_type,
                usedIn: usage?.usedIn || [],
                hasIndex: !!matchingIdx,
                indexName: matchingIdx?.index_name,
              };
            }),
            existingIndexes: idxResult.rows.map((idx: any) => ({
              name: idx.index_name,
              columns: idx.columns,
              type: idx.index_type,
              isUnique: idx.is_unique,
              size: formatBytes(idx.index_size),
              scanCount: idx.scan_count,
            })),
            estimatedRows: stat?.estimated_rows || 0,
            seqScanCount: stat?.seq_scan_count || 0,
            idxScanCount: stat?.idx_scan_count || 0,
          });
        } catch (e: any) {
          console.warn(`Table info failed for ${tableName}:`, e.message);
          // 최소 정보로 추가
          tableStats.push({
            name: tableName,
            alias: t.alias,
            schema,
            columns: [],
            existingIndexes: [],
          });
        }
      }
    }

    // AI 분석으로 권고사항 생성
    const joins = extractJoinsFromSQL(sql);
    let recommendations: IndexRecommendation[] = [];
    let accessPaths: AccessPath[] = [];
    let hints: string | undefined;
    let healthScore = 100;

    if (options.includeRecommendations !== false) {
      const aiResult = await generateAIRecommendations(
        sql,
        tableStats,
        joins,
        explainPlan,
        !!options.includeHints
      );
      recommendations = aiResult.recommendations;
      accessPaths = aiResult.accessPaths;
      hints = aiResult.hints;
      healthScore = aiResult.healthScore;
    }

    // 기존 인덱스 수 집계
    const existingIndexCount = tableStats.reduce((sum, t) => sum + t.existingIndexes.length, 0);

    const result: QueryArtifactsResult = {
      tables: tableStats,
      joins,
      recommendations,
      explainPlan,
      accessPaths,
      hints,
      summary: {
        tableCount: tableStats.length,
        joinCount: joins.length,
        existingIndexCount,
        missingIndexCount: recommendations.filter(r => r.priority === 'HIGH').length,
        overallHealthScore: healthScore,
      },
    };

    // 분석 이력 저장
    if (connectionId) {
      db.insert(aiAnalysisHistory)
        .values({
          connectionId,
          analysisType: 'query_artifacts',
          request: { sql, options },
          response: result,
          createdBy: session.user.id,
        })
        .catch((err: Error) => console.error('Failed to save analysis history:', err));
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Query artifacts error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * SQL에서 테이블 추출 (기본 정규식 파서)
 */
function extractTablesFromSQL(sql: string): Array<{ name: string; alias?: string; schema?: string }> {
  const tables: Array<{ name: string; alias?: string; schema?: string }> = [];
  const normalizedSql = sql.replace(/\s+/g, ' ').replace(/--[^\n]*/g, '');

  // FROM / JOIN 절에서 테이블 추출
  const tablePattern = /(?:FROM|JOIN|INNER\s+JOIN|LEFT\s+(?:OUTER\s+)?JOIN|RIGHT\s+(?:OUTER\s+)?JOIN|FULL\s+(?:OUTER\s+)?JOIN|CROSS\s+JOIN)\s+((?:(\w+)\.)?(\w+))(?:\s+(?:AS\s+)?(\w+))?/gi;

  let match;
  while ((match = tablePattern.exec(normalizedSql)) !== null) {
    const schema = match[2] || undefined;
    const name = match[3];
    const alias = match[4];

    // 예약어 제외
    const reserved = ['select', 'where', 'on', 'and', 'or', 'inner', 'left', 'right', 'full', 'cross', 'join', 'outer', 'group', 'order', 'having', 'limit', 'offset', 'union', 'intersect', 'except'];
    if (!reserved.includes(name.toLowerCase()) && !tables.find(t => t.name === name)) {
      tables.push({ name, alias, schema });
    }
  }

  return tables;
}

/**
 * SQL에서 특정 테이블의 사용 컬럼 추출
 */
function extractColumnsForTable(
  sql: string,
  tableName: string,
  alias?: string
): Array<{ name: string; usedIn: ('where' | 'join' | 'orderby' | 'groupby' | 'select')[] }> {
  const columns: Map<string, Set<string>> = new Map();
  const normalizedSql = sql.replace(/\s+/g, ' ');
  const tableRef = alias || tableName;

  // table.column 또는 alias.column 패턴
  const colPattern = new RegExp(`\\b${tableRef}\\.(\\w+)\\b`, 'gi');
  let match;
  while ((match = colPattern.exec(normalizedSql)) !== null) {
    const colName = match[1];
    if (!columns.has(colName)) columns.set(colName, new Set());

    // 위치에 따른 사용 유형 판별
    const beforeMatch = normalizedSql.substring(0, match.index).toUpperCase();
    if (beforeMatch.includes('WHERE') && !beforeMatch.includes('ORDER BY') && !beforeMatch.includes('GROUP BY')) {
      columns.get(colName)!.add('where');
    }
    if (beforeMatch.includes('ON ') || beforeMatch.includes('JOIN')) {
      columns.get(colName)!.add('join');
    }
    if (beforeMatch.includes('ORDER BY')) {
      columns.get(colName)!.add('orderby');
    }
    if (beforeMatch.includes('GROUP BY')) {
      columns.get(colName)!.add('groupby');
    }
  }

  return Array.from(columns.entries()).map(([name, usedIn]) => ({
    name,
    usedIn: Array.from(usedIn) as any[],
  }));
}

/**
 * SQL에서 JOIN 관계 추출
 */
function extractJoinsFromSQL(sql: string): JoinInfo[] {
  const joins: JoinInfo[] = [];
  const normalizedSql = sql.replace(/\s+/g, ' ');

  const joinPattern = /(\w+)\s+(?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*(?:OUTER\s+)?JOIN\s+(?:(\w+)\.)?(\w+)(?:\s+(?:AS\s+)?(\w+))?\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/gi;

  let match;
  while ((match = joinPattern.exec(normalizedSql)) !== null) {
    const joinTypeMatch = normalizedSql.substring(Math.max(0, match.index - 20), match.index).toUpperCase();
    let joinType: JoinInfo['joinType'] = 'INNER';
    if (joinTypeMatch.includes('LEFT')) joinType = 'LEFT';
    else if (joinTypeMatch.includes('RIGHT')) joinType = 'RIGHT';
    else if (joinTypeMatch.includes('FULL')) joinType = 'FULL';
    else if (joinTypeMatch.includes('CROSS')) joinType = 'CROSS';

    joins.push({
      leftTable: match[5],
      rightTable: match[7],
      leftColumn: match[6],
      rightColumn: match[8],
      joinType,
    });
  }

  return joins;
}

/**
 * AI를 이용한 권고사항 생성
 */
async function generateAIRecommendations(
  sql: string,
  tables: TableInfo[],
  joins: JoinInfo[],
  explainPlan: any,
  includeHints: boolean
): Promise<{
  recommendations: IndexRecommendation[];
  accessPaths: AccessPath[];
  hints?: string;
  healthScore: number;
}> {
  const tablesSummary = tables.map(t => {
    const idxList = t.existingIndexes.map(i => `  - ${i.name}: (${i.columns.join(', ')}) [${i.type}] scans=${i.scanCount}`).join('\n');
    const usedCols = t.columns.filter(c => c.usedIn.length > 0).map(c => `  - ${c.name} (${c.usedIn.join(', ')}) ${c.hasIndex ? '✓indexed' : '✗no-index'}`).join('\n');
    return `### ${t.schema}.${t.name}${t.alias ? ` (alias: ${t.alias})` : ''}
rows≈${t.estimatedRows} | seq_scan=${t.seqScanCount} | idx_scan=${t.idxScanCount}
Used columns:\n${usedCols || '  (none detected)'}
Existing indexes:\n${idxList || '  (none)'}`;
  }).join('\n\n');

  const joinsSummary = joins.map(j =>
    `${j.leftTable}.${j.leftColumn} ${j.joinType} JOIN ${j.rightTable}.${j.rightColumn}`
  ).join('\n');

  const prompt = `다음 PostgreSQL SQL을 분석하여 인덱스 권고, 접근 경로, 건강도 점수를 JSON으로 반환하세요.

## SQL
\`\`\`sql
${sql}
\`\`\`

## 테이블 정보
${tablesSummary}

## JOIN 관계
${joinsSummary || '(없음)'}

${explainPlan ? `## EXPLAIN Plan\n\`\`\`json\n${JSON.stringify(explainPlan, null, 2).substring(0, 3000)}\n\`\`\`` : ''}

## 응답 형식 (JSON)
\`\`\`json
{
  "recommendations": [
    {
      "table": "테이블명",
      "columns": ["col1", "col2"],
      "type": "btree",
      "ddl": "CREATE INDEX idx_xxx ON table(col1, col2);",
      "reason": "WHERE 절에서 사용되나 인덱스 없음",
      "priority": "HIGH",
      "estimatedImprovement": "Seq Scan → Index Scan 전환, 약 70% 성능 향상"
    }
  ],
  "accessPaths": [
    {
      "step": 1,
      "table": "테이블명",
      "accessType": "Index Scan (idx_xxx)",
      "condition": "col1 = ?",
      "estimatedCost": 10.5
    }
  ],
  ${includeHints ? '"hints": "/*+ SeqScan(t1) IndexScan(t2 idx_name) NestLoop(t1 t2) Leading(t1 t2) */",' : ''}
  "healthScore": 75
}
\`\`\``;

  const messages: ChatMessage[] = [
    { role: 'system', content: PG_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];

  try {
    const client = getLLMClient();
    const response = await client.chat(messages);

    // JSON 파싱
    const jsonMatch = response.content.match(/```json\s*([\s\S]*?)```/) ||
                       response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      return {
        recommendations: parsed.recommendations || [],
        accessPaths: parsed.accessPaths || [],
        hints: parsed.hints,
        healthScore: parsed.healthScore || 50,
      };
    }
  } catch (e: any) {
    console.error('AI recommendation failed:', e.message);
  }

  // AI 실패 시 규칙 기반 분석
  return generateRuleBasedRecommendations(tables, joins);
}

/**
 * 규칙 기반 권고사항 (AI 대체)
 */
function generateRuleBasedRecommendations(
  tables: TableInfo[],
  joins: JoinInfo[]
): {
  recommendations: IndexRecommendation[];
  accessPaths: AccessPath[];
  healthScore: number;
} {
  const recommendations: IndexRecommendation[] = [];
  const accessPaths: AccessPath[] = [];
  let healthScore = 100;

  for (const table of tables) {
    // WHERE/JOIN에 사용되지만 인덱스가 없는 컬럼
    const unindexedCols = table.columns.filter(
      c => (c.usedIn.includes('where') || c.usedIn.includes('join')) && !c.hasIndex
    );

    if (unindexedCols.length > 0) {
      const cols = unindexedCols.map(c => c.name);
      recommendations.push({
        table: table.name,
        columns: cols,
        type: 'btree',
        ddl: `CREATE INDEX idx_${table.name}_${cols.join('_')} ON ${table.schema || 'public'}.${table.name} (${cols.join(', ')});`,
        reason: `WHERE/JOIN에 사용되는 컬럼에 인덱스 없음`,
        priority: table.estimatedRows && table.estimatedRows > 10000 ? 'HIGH' : 'MEDIUM',
        estimatedImprovement: 'Seq Scan → Index Scan 전환 예상',
      });
      healthScore -= 15 * unindexedCols.length;
    }

    // Seq Scan이 많은 테이블
    if (table.seqScanCount && table.idxScanCount && table.seqScanCount > table.idxScanCount * 5) {
      healthScore -= 10;
    }

    accessPaths.push({
      step: accessPaths.length + 1,
      table: table.name,
      accessType: table.existingIndexes.length > 0 ? 'Index Scan' : 'Seq Scan',
      estimatedCost: 0,
    });
  }

  return {
    recommendations,
    accessPaths,
    healthScore: Math.max(0, healthScore),
  };
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
