/**
 * PG-TMS LLM 클라이언트
 * Ollama + OpenAI 호환 API 지원, Tool Calling 지원
 */

import { getLLMConfig, getChatEndpoint } from './config';
import type { ChatMessage, LLMConfig, ToolDefinition, LLMStreamChunk } from './types';

export class LLMClient {
  private config: LLMConfig;

  constructor(config?: Partial<LLMConfig>) {
    this.config = { ...getLLMConfig(), ...config };
  }

  async healthCheck(): Promise<{ healthy: boolean; model: string; error?: string }> {
    try {
      const url = this.config.apiType === 'ollama'
        ? `${this.config.baseUrl}/api/tags`
        : `${this.config.baseUrl}/models`;

      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { healthy: true, model: this.config.modelName };
    } catch (error: any) {
      return { healthy: false, model: this.config.modelName, error: error.message };
    }
  }

  async chat(
    messages: ChatMessage[],
    options?: { tools?: ToolDefinition[]; tool_choice?: string }
  ): Promise<{ content: string; tool_calls?: any[] }> {
    const endpoint = getChatEndpoint(this.config);

    const body = this.config.apiType === 'ollama'
      ? {
          model: this.config.modelName,
          messages,
          stream: false,
          options: {
            num_predict: this.config.maxTokens,
            temperature: this.config.temperature,
          },
          ...(options?.tools ? { tools: options.tools } : {}),
        }
      : {
          model: this.config.modelName,
          messages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          stream: false,
          ...(options?.tools ? { tools: options.tools, tool_choice: options.tool_choice || 'auto' } : {}),
        };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => 'Unknown error');
      throw new Error(`LLM error (${res.status}): ${err}`);
    }

    const data = await res.json();

    if (this.config.apiType === 'ollama') {
      return {
        content: data.message?.content || '',
        tool_calls: data.message?.tool_calls,
      };
    }

    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content || '',
      tool_calls: choice?.message?.tool_calls,
    };
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: { tools?: ToolDefinition[] }
  ): AsyncGenerator<LLMStreamChunk> {
    const endpoint = getChatEndpoint(this.config);

    const body = this.config.apiType === 'ollama'
      ? {
          model: this.config.modelName,
          messages,
          stream: true,
          options: {
            num_predict: this.config.maxTokens,
            temperature: this.config.temperature,
          },
          ...(options?.tools ? { tools: options.tools } : {}),
        }
      : {
          model: this.config.modelName,
          messages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          stream: true,
          ...(options?.tools ? { tools: options.tools, tool_choice: 'auto' } : {}),
        };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!res.ok) {
      throw new Error(`LLM stream error (${res.status})`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // OpenAI SSE format
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { content: '', done: true };
            return;
          }
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta;
            yield {
              content: delta?.content || '',
              done: false,
              tool_calls: delta?.tool_calls,
            };
          } catch {}
          continue;
        }

        // Ollama NDJSON format
        try {
          const json = JSON.parse(trimmed);
          yield {
            content: json.message?.content || '',
            done: json.done || false,
            tool_calls: json.message?.tool_calls,
          };
          if (json.done) return;
        } catch {}
      }
    }
  }
}

// Singleton
let _client: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!_client) _client = new LLMClient();
  return _client;
}
