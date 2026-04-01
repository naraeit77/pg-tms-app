/**
 * 지식 베이스 관리
 * PG 문서 시딩, 튜닝 이력 자동 임베딩
 */

import { pool } from '@/db';
import { splitIntoChunks, generateEmbedding } from './embeddings';

/**
 * 지식 추가 (텍스트 → 청크 → 임베딩 → 저장)
 */
export async function addKnowledge(
  category: string,
  title: string,
  content: string,
  metadata?: Record<string, any>
): Promise<number> {
  const chunks = splitIntoChunks(content);
  let inserted = 0;

  const client = await pool.connect();
  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkTitle = chunks.length > 1 ? `${title} (${i + 1}/${chunks.length})` : title;

      try {
        const embedding = await generateEmbedding(chunk);
        if (!embedding || embedding.length === 0) continue;

        const embeddingStr = `[${embedding.join(',')}]`;

        await client.query(
          `INSERT INTO tuning_knowledge_base (category, title, content, embedding, metadata)
           VALUES ($1, $2, $3, $4::vector, $5)`,
          [category, chunkTitle, chunk, embeddingStr, JSON.stringify(metadata || {})]
        );
        inserted++;
      } catch (error) {
        console.error(`Failed to add knowledge chunk ${i}:`, error);
      }
    }
  } finally {
    client.release();
  }

  return inserted;
}

/**
 * 지식 목록 조회
 */
export async function listKnowledge(category?: string, limit = 50): Promise<any[]> {
  const client = await pool.connect();
  try {
    let sql = `SELECT id, category, title, LENGTH(content) AS content_length, metadata, created_at
               FROM tuning_knowledge_base`;
    const params: any[] = [];

    if (category) {
      sql += ` WHERE category = $1`;
      params.push(category);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * 지식 삭제
 */
export async function deleteKnowledge(id: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM tuning_knowledge_base WHERE id = $1', [id]);
  } finally {
    client.release();
  }
}

/**
 * PG 기본 튜닝 지식 시딩
 */
export const PG_TUNING_KNOWLEDGE = [
  {
    category: 'index',
    title: 'PostgreSQL B-Tree 인덱스 가이드',
    content: `B-Tree 인덱스는 PostgreSQL의 기본 인덱스 타입입니다. 등호(=), 범위(<, >, BETWEEN), IS NULL, IN 연산에 효율적입니다.
복합 인덱스에서 컬럼 순서가 중요합니다: 등호 조건 컬럼을 먼저, 범위 조건 컬럼을 나중에 배치합니다.
Index Only Scan을 활용하려면 SELECT 절의 모든 컬럼을 INCLUDE에 포함하세요.
CREATE INDEX idx_example ON table_name (col1, col2) INCLUDE (col3);`,
  },
  {
    category: 'index',
    title: 'PostgreSQL 부분 인덱스 (Partial Index)',
    content: `부분 인덱스는 WHERE 절로 인덱스 대상 행을 제한합니다. 인덱스 크기를 줄이고 성능을 향상시킵니다.
예: CREATE INDEX idx_active_orders ON orders (customer_id) WHERE status = 'active';
전체 행의 일부만 자주 조회되는 경우 매우 효과적입니다.`,
  },
  {
    category: 'vacuum',
    title: 'Vacuum과 Dead Tuple 관리',
    content: `PostgreSQL은 MVCC로 UPDATE/DELETE 시 Dead Tuple이 발생합니다. VACUUM이 이를 정리합니다.
autovacuum_vacuum_threshold와 autovacuum_vacuum_scale_factor를 조정하여 Autovacuum 빈도를 제어합니다.
대량 DELETE 후에는 VACUUM FULL 대신 pg_repack 사용을 권장합니다.
Dead Tuple 비율이 10%를 초과하면 주의가 필요합니다.`,
  },
  {
    category: 'query',
    title: 'PostgreSQL 안티패턴',
    content: `1. SELECT * on wide tables → 필요한 컬럼만 명시
2. Large table Seq Scan → WHERE 조건에 맞는 인덱스 생성
3. N+1 queries → JOIN 또는 배치 조회로 변환
4. Implicit type cast → WHERE 절에서 타입 일치 보장
5. NOT IN with NULL → NOT EXISTS 또는 LEFT JOIN IS NULL 사용
6. ORDER BY + LIMIT without index → 정렬 컬럼에 인덱스 추가
7. Missing FK indexes → 외래 키 컬럼에 인덱스 생성`,
  },
  {
    category: 'parameter',
    title: 'PostgreSQL 주요 파라미터 튜닝',
    content: `shared_buffers: 총 메모리의 25% (최대 8GB 권장)
effective_cache_size: 총 메모리의 75%
work_mem: 복잡한 정렬/해시에 사용, 기본 4MB → 쿼리별 SET으로 조정
maintenance_work_mem: VACUUM, CREATE INDEX용, 512MB~1GB
random_page_cost: SSD는 1.1~1.5로 낮춤 (기본 4.0은 HDD 기준)
effective_io_concurrency: SSD는 200으로 설정`,
  },
];
