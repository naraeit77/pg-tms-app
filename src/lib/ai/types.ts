/**
 * PG-TMS AI/LLM 타입 정의
 */

export interface LLMConfig {
  baseUrl: string;
  modelName: string;
  apiType: 'ollama' | 'openai';
  maxTokens: number;
  temperature: number;
  timeout: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
}

export interface PgSQLMetrics {
  queryid: number;
  query: string;
  calls: number;
  total_exec_time: number;
  mean_exec_time: number;
  min_exec_time: number;
  max_exec_time: number;
  rows: number;
  shared_blks_hit: number;
  shared_blks_read: number;
  shared_blks_written: number;
  temp_blks_read: number;
  temp_blks_written: number;
  blk_read_time: number;
  blk_write_time: number;
}

export interface SQLAnalysisResult {
  summary: string;
  issues: string[];
  recommendations: string[];
  indexSuggestions: IndexSuggestion[];
  rewriteSuggestions: RewriteSuggestion[];
  performanceScore: number;
}

export interface IndexSuggestion {
  tableName: string;
  columns: string[];
  indexType: string;
  ddl: string;
  reason: string;
  estimatedImprovement: string;
}

export interface RewriteSuggestion {
  original: string;
  rewritten: string;
  reason: string;
  estimatedImprovement: string;
}

export interface LLMStreamChunk {
  content: string;
  done: boolean;
  tool_calls?: ToolCall[];
}
