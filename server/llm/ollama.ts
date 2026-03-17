// ============================================================================
// Ollama LLM Client
// ============================================================================

import type { LLMMessage, LLMStreamChunk, LLMResponse } from '../../lib/types';
import { getConfig } from '../config';

export interface OllamaOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  host?: string;
}

interface OllamaChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  stream: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
    top_p?: number;
  };
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaListResponse {
  models: {
    name: string;
    model: string;
    modified_at: string;
    size: number;
  }[];
}

interface OllamaPullResponse {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

/**
 * Check if Ollama server is available
 */
export async function isOllamaAvailable(host?: string): Promise<boolean> {
  const config = getConfig();
  const baseUrl = host || config.models.ollama_host;
  
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * List available models
 */
export async function listModels(host?: string): Promise<string[]> {
  const config = getConfig();
  const baseUrl = host || config.models.ollama_host;
  
  const response = await fetch(`${baseUrl}/api/tags`);
  if (!response.ok) {
    throw new Error(`Failed to list models: ${response.statusText}`);
  }
  
  const data = await response.json() as OllamaListResponse;
  return data.models.map(m => m.name);
}

/**
 * Check if a specific model is available
 */
export async function hasModel(model: string, host?: string): Promise<boolean> {
  try {
    const models = await listModels(host);
    return models.some(m => m === model || m.startsWith(`${model}:`));
  } catch {
    return false;
  }
}

/**
 * Pull a model (auto-download if not available)
 */
export async function pullModel(
  model: string,
  host?: string,
  onProgress?: (progress: { status: string; completed?: number; total?: number }) => void
): Promise<void> {
  const config = getConfig();
  const baseUrl = host || config.models.ollama_host;
  
  const response = await fetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model, stream: true })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to pull model ${model}: ${response.statusText}`);
  }
  
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }
  
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter(Boolean);
    
    for (const line of lines) {
      try {
        const data = JSON.parse(line) as OllamaPullResponse;
        if (onProgress) {
          onProgress({
            status: data.status,
            completed: data.completed,
            total: data.total
          });
        }
      } catch {
        // Ignore parse errors in progress updates
      }
    }
  }
}

/**
 * Stream chat completion from Ollama
 */
export async function* streamChat(
  messages: LLMMessage[],
  options: OllamaOptions
): AsyncGenerator<LLMStreamChunk> {
  const config = getConfig();
  const baseUrl = options.host || config.models.ollama_host;
  
  // Auto-pull model if not available
  const modelAvailable = await hasModel(options.model, baseUrl);
  if (!modelAvailable) {
    console.log(`[ollama] Model ${options.model} not found, pulling...`);
    await pullModel(options.model, baseUrl, (progress) => {
      console.log(`[ollama] Pull progress: ${progress.status}`);
    });
  }
  
  const request: OllamaChatRequest = {
    model: options.model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    stream: true,
    options: {
      temperature: options.temperature ?? config.models.temperature,
      num_predict: options.maxTokens ?? config.models.max_tokens,
      top_p: options.topP
    }
  };
  
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    throw new Error(`Ollama chat failed: ${response.statusText}`);
  }
  
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }
  
  const decoder = new TextDecoder();
  let totalContent = '';
  let promptTokens = 0;
  let completionTokens = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter(Boolean);
    
    for (const line of lines) {
      try {
        const data = JSON.parse(line) as OllamaChatResponse;
        const content = data.message?.content || '';
        totalContent += content;
        
        if (data.prompt_eval_count) {
          promptTokens = data.prompt_eval_count;
        }
        if (data.eval_count) {
          completionTokens = data.eval_count;
        }
        
        yield {
          content,
          done: data.done,
          usage: data.done ? {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens
          } : undefined
        };
      } catch {
        // Ignore parse errors
      }
    }
  }
}

/**
 * Non-streaming chat completion
 */
export async function chat(
  messages: LLMMessage[],
  options: OllamaOptions
): Promise<LLMResponse> {
  let content = '';
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  
  for await (const chunk of streamChat(messages, options)) {
    content += chunk.content;
    if (chunk.usage) {
      usage = chunk.usage;
    }
  }
  
  return {
    content,
    usage,
    model: options.model,
    finishReason: 'stop'
  };
}
