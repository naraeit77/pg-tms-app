/**
 * 분석 컨텍스트별 프롬프트
 */

import type { PgSQLMetrics } from '../types';

export function buildSqlAnalysisPrompt(metrics: PgSQLMetrics, context?: string): string {
  return `다음 PostgreSQL SQL의 성능을 분석하고 튜닝 권고사항을 제시해주세요.

## SQL 정보
- queryid: ${metrics.queryid}
- SQL: ${metrics.query}

## 성능 메트릭 (pg_stat_statements)
- Calls: ${metrics.calls?.toLocaleString()}
- Total Exec Time: ${metrics.total_exec_time?.toFixed(1)}ms
- Mean Exec Time: ${metrics.mean_exec_time?.toFixed(2)}ms
- Min/Max Exec Time: ${metrics.min_exec_time?.toFixed(2)} / ${metrics.max_exec_time?.toFixed(2)}ms
- Rows: ${metrics.rows?.toLocaleString()}
- Shared Blks Hit: ${metrics.shared_blks_hit?.toLocaleString()}
- Shared Blks Read: ${metrics.shared_blks_read?.toLocaleString()}
- Shared Blks Written: ${metrics.shared_blks_written?.toLocaleString()}
- Temp Blks Read/Written: ${metrics.temp_blks_read?.toLocaleString()} / ${metrics.temp_blks_written?.toLocaleString()}
- Block Read/Write Time: ${metrics.blk_read_time?.toFixed(1)} / ${metrics.blk_write_time?.toFixed(1)}ms

${context ? `## 추가 컨텍스트\n${context}` : ''}

## 요청 형식 (JSON)
\`\`\`json
{
  "summary": "전체 평가 요약",
  "issues": ["발견된 성능 이슈"],
  "recommendations": ["튜닝 권고사항"],
  "indexSuggestions": [{"tableName": "", "columns": [], "indexType": "btree", "ddl": "CREATE INDEX ...", "reason": "", "estimatedImprovement": ""}],
  "rewriteSuggestions": [{"original": "", "rewritten": "", "reason": "", "estimatedImprovement": ""}],
  "performanceScore": 75
}
\`\`\``;
}

export function buildExplainAnalysisPrompt(planJson: string, sqlText?: string): string {
  return `다음 PostgreSQL 실행계획(EXPLAIN JSON)을 분석해주세요.

${sqlText ? `## SQL\n${sqlText}\n` : ''}
## 실행계획
\`\`\`json
${planJson}
\`\`\`

## 분석 요청
1. 병목 노드 식별 (Seq Scan on large table, Sort with high cost 등)
2. 인덱스 활용 여부 평가
3. Join 전략 적정성 평가
4. 개선 권고 (인덱스 DDL, 쿼리 재작성, 파라미터 변경)
5. 예상 개선 효과`;
}

export function buildAutoTuningPrompt(sqlList: Array<PgSQLMetrics & { explainJson?: string; tableInfo?: string }>): string {
  const sqlSummaries = sqlList.map((s, i) => `
### SQL #${i + 1} (queryid: ${s.queryid})
- SQL: ${s.query?.substring(0, 500)}
- Calls: ${s.calls} | Mean Time: ${s.mean_exec_time?.toFixed(2)}ms | Rows: ${s.rows}
- Shared Read: ${s.shared_blks_read} | Temp Written: ${s.temp_blks_written}
${s.explainJson ? `- Plan: ${s.explainJson.substring(0, 500)}...` : ''}
${s.tableInfo ? `- Tables: ${s.tableInfo}` : ''}
`).join('\n');

  return `다음 PostgreSQL Top SQL들을 자동 분석하고 튜닝 권고를 제시해주세요.

${sqlSummaries}

## 요청 형식 (JSON 배열)
\`\`\`json
[
  {
    "queryid": 12345,
    "priority": "HIGH",
    "summary": "분석 요약",
    "recommendations": ["권고1", "권고2"],
    "indexDDL": ["CREATE INDEX ..."],
    "parameterChanges": ["SET work_mem = '256MB'"],
    "rewrittenSQL": "SELECT ...",
    "estimatedImprovement": "50%"
  }
]
\`\`\``;
}

export function buildIndexAdvisorPrompt(tableStats: string, topQueries: string, existingIndexes: string): string {
  return `다음 PostgreSQL 데이터베이스의 인덱스 최적화를 분석해주세요.

## 높은 Seq Scan 테이블
${tableStats}

## Top 쿼리 WHERE/JOIN 컬럼
${topQueries}

## 기존 인덱스
${existingIndexes}

## 요청
1. 누락된 인덱스 식별 + DDL 생성
2. 미사용 인덱스 제거 제안
3. 복합 인덱스 최적화
4. 부분 인덱스 제안 (WHERE 조건 기반)

## 응답 형식 (JSON)
\`\`\`json
{
  "missingIndexes": [{"ddl": "CREATE INDEX ...", "reason": "", "tables": [], "estimatedImprovement": ""}],
  "unusedIndexes": [{"name": "", "ddl": "DROP INDEX ...", "reason": ""}],
  "summary": ""
}
\`\`\``;
}
