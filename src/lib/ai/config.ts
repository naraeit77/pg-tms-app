/**
 * LLM 설정 관리
 */

import { LLMConfig } from './types';

const defaultConfig: LLMConfig = {
  baseUrl: 'http://localhost:11434',
  modelName: 'qwen3:8b',
  apiType: 'ollama',
  maxTokens: 4096,
  temperature: 0.3,
  timeout: 180000,
};

export function getLLMConfig(): LLMConfig {
  return {
    baseUrl: process.env.LLM_BASE_URL || defaultConfig.baseUrl,
    modelName: process.env.LLM_MODEL_NAME || defaultConfig.modelName,
    apiType: (process.env.LLM_API_TYPE as 'ollama' | 'openai') || defaultConfig.apiType,
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '') || defaultConfig.maxTokens,
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '') || defaultConfig.temperature,
    timeout: parseInt(process.env.LLM_TIMEOUT || '') || defaultConfig.timeout,
  };
}

export function isLLMEnabled(): boolean {
  return !!process.env.LLM_BASE_URL;
}

export function getChatEndpoint(config: LLMConfig): string {
  if (config.apiType === 'ollama') {
    return `${config.baseUrl}/api/chat`;
  }
  return `${config.baseUrl}/chat/completions`;
}

export function getFeatureFlags() {
  return {
    chatbot: process.env.FEATURE_AI_CHATBOT === 'true',
    autoTuning: process.env.FEATURE_AI_AUTO_TUNING === 'true',
    indexAdvisor: process.env.FEATURE_AI_INDEX_ADVISOR === 'true',
    anomalyDetection: process.env.FEATURE_AI_ANOMALY_DETECTION === 'true',
    reportGeneration: process.env.FEATURE_AI_REPORT_GENERATION === 'true',
  };
}
