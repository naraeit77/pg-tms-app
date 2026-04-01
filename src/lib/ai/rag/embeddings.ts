/**
 * 임베딩 생성
 * Ollama embeddings API 또는 OpenAI embeddings API 호환
 */

import { getLLMConfig } from '../config';

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

/**
 * 텍스트를 청크로 분할
 */
export function splitIntoChunks(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim()) chunks.push(chunk.trim());
    if (i + chunkSize >= words.length) break;
  }

  return chunks.length > 0 ? chunks : [text];
}

/**
 * 텍스트 → 임베딩 벡터 생성
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const config = getLLMConfig();

  if (config.apiType === 'ollama') {
    const res = await fetch(`${config.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.modelName,
        prompt: text,
      }),
    });

    if (!res.ok) throw new Error(`Embedding error: ${res.status}`);
    const data = await res.json();
    return data.embedding;
  }

  // OpenAI compatible
  const res = await fetch(`${config.baseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'text-embedding-ada-002',
      input: text,
    }),
  });

  if (!res.ok) throw new Error(`Embedding error: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
}

/**
 * 여러 텍스트 임베딩 (배치)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    try {
      const embedding = await generateEmbedding(text);
      results.push(embedding);
    } catch (error) {
      console.error('Embedding generation failed for chunk:', error);
      results.push([]);
    }
  }
  return results;
}
