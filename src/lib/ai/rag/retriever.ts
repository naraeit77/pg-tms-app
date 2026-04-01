/**
 * 벡터 유사도 검색 (cosine similarity)
 */

import { pool } from '@/db';
import { generateEmbedding } from './embeddings';

export interface KnowledgeResult {
  id: string;
  category: string;
  title: string;
  content: string;
  similarity: number;
  metadata: any;
}

/**
 * 쿼리 텍스트와 유사한 지식 검색
 */
export async function searchKnowledge(
  query: string,
  limit: number = 5,
  category?: string
): Promise<KnowledgeResult[]> {
  try {
    const embedding = await generateEmbedding(query);
    if (!embedding || embedding.length === 0) return [];

    const embeddingStr = `[${embedding.join(',')}]`;

    let sql = `
      SELECT id, category, title, content, metadata,
             1 - (embedding <=> $1::vector) AS similarity
      FROM tuning_knowledge_base
      WHERE embedding IS NOT NULL
    `;
    const params: any[] = [embeddingStr];

    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    sql += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length + 1}`;
    params.push(limit);

    const client = await pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows.map((r) => ({
        id: r.id,
        category: r.category,
        title: r.title,
        content: r.content,
        similarity: parseFloat(r.similarity),
        metadata: r.metadata,
      }));
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Knowledge search error:', error);
    return [];
  }
}

/**
 * RAG 컨텍스트 빌드: 검색 결과를 프롬프트 컨텍스트로 변환
 */
export function buildRAGContext(results: KnowledgeResult[]): string {
  if (results.length === 0) return '';

  const context = results
    .filter((r) => r.similarity > 0.3)
    .map((r) => `[${r.category}] ${r.title}\n${r.content}`)
    .join('\n\n---\n\n');

  if (!context) return '';

  return `\n\n## 참고 지식 베이스\n${context}`;
}
