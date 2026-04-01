/**
 * AI 챗봇 Tool Calling 도구 정의
 */

import type { ToolDefinition } from '../types';

export const chatTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'query_stats',
      description: 'pg_stat_statements에서 SQL 통계를 조회합니다. 느린 쿼리, Top SQL, 특정 쿼리 검색에 사용합니다.',
      parameters: {
        type: 'object',
        properties: {
          order_by: {
            type: 'string',
            enum: ['total_exec_time', 'calls', 'mean_exec_time', 'shared_blks_read', 'rows', 'temp_blks_written'],
            description: '정렬 기준',
          },
          limit: { type: 'number', description: '조회 건수 (기본 10)' },
          search: { type: 'string', description: 'SQL 텍스트 검색어 (ILIKE)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'explain_query',
      description: 'SQL의 실행계획을 EXPLAIN (FORMAT JSON)으로 조회합니다.',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: '실행계획을 확인할 SQL' },
          analyze: { type: 'boolean', description: '실제 실행 여부 (기본 false)' },
        },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'table_info',
      description: '테이블의 컬럼 정보, 크기, 통계를 조회합니다.',
      parameters: {
        type: 'object',
        properties: {
          table_name: { type: 'string', description: '테이블명 (schema.table 또는 table)' },
        },
        required: ['table_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'index_info',
      description: '테이블의 인덱스 목록과 사용 통계를 조회합니다.',
      parameters: {
        type: 'object',
        properties: {
          table_name: { type: 'string', description: '테이블명' },
        },
        required: ['table_name'],
      },
    },
  },
];
