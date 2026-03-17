// ============================================================================
// Groq LLM Client (Free-tier fallback)
// ============================================================================

import type { LLMMessage, LLMStreamChunk, LLMResponse } from '../../lib/types';
import { getConfig } from '../config';

export interface GroqOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  apiKey?: string;
}

interface GroqChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream: boolean;
}

interface GroqChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GroqStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

// Available Groq models (free tier)
export const GROQ_MODELS = [
  'llama-3.1-8b-instant',
  'llama-3.1-70b-versatile',
  'llama-3.2-1b-preview',
  'llama-3.2-3b-preview',
  'llama-3.2-11b-vision-preview',
  'llama-3.2-90b-vision-preview',
  'mixtral-8x7b-32768',
  'gemma2-9b-it'
];

// Rate limit tracking (free tier: 30 requests/minute, 6000 tokens/minute)
let requestCount = 0;
let tokenCount = 0;
let windowStart = Date.now();
const RATE_LIMIT_REQUESTS = 30;
const RATE_LIMIT_TOKENS = 6000;
const RATE_LIMIT_WINDOW = 60000; // 1 minute

function resetRateLimitIfNeeded(): void {
  const now = Date.now();
  if (now - windowStart > RATE_LIMIT_WINDOW) {
    requestCount = 0;
    tokenCount = 0;
    windowStart = now;
  }
}

function checkRateLimit(estimatedTokens: number = 0): { allowed: boolean; waitMs: number } {
  resetRateLimitIfNeeded();
  
  if (requestCount >= RATE_LIMIT_REQUESTS) {
    const waitMs = RATE_LIMIT_WINDOW - (Date.now() - windowStart);
    return { allowed: false, waitMs };
  }
  
  if (tokenCount + estimatedTokens > RATE_LIMIT_TOKENS) {
    const waitMs = RATE_LIMIT_WINDOW - (Date.now() - windowStart);
    return { allowed: false, waitMs };
  }
  
  return { allowed: true, waitMs: 0 };
}

function updateRateLimit(tokens: number): void {
  requestCount++;
  tokenCount += tokens;
}

/**
 * Check if Groq API is available
 */
export async function isGroqAvailable(apiKey?: string): Promise<boolean> {
  const config = getConfig();
  const key = apiKey || config.models.groq_api_key || process.env.GROQ_API_KEY;
  
  if (!key) {
    return false;
  }
  
  try {
    const response = await fetch(`${GROQ_API_BASE}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`
      },
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get API key
 */
function getApiKey(options?: GroqOptions): string {
  const config = getConfig();
  const key = options?.apiKey || config.models.groq_api_key || process.env.GROQ_API_KEY;
  
  if (!key) {
    throw new Error('Groq API key not configured. Set GROQ_API_KEY environment variable.');
  }
  
  return key;
}

/**
 * Estimate tokens in messages (rough approximation)
 */
function estimateTokens(messages: LLMMessage[]): number {
  return messages.reduce((total, m) => total + Math.ceil(m.content.length / 4), 0);
}

/**
 * Wait for rate limit to reset
 */
async function waitForRateLimit(waitMs: number): Promise<void> {
  console.log(`[groq] Rate limit reached, waiting ${Math.ceil(waitMs / 1000)}s...`);
  await new Promise(resolve => setTimeout(resolve, waitMs));
}

/**
 * Stream chat completion from Groq
 */
export async function* streamChat(
  messages: LLMMessage[],
  options: GroqOptions
): AsyncGenerator<LLMStreamChunk> {
  const apiKey = getApiKey(options);
  const config = getConfig();
  
  // Check rate limit
  const estimated = estimateTokens(messages);
  const { allowed, waitMs } = checkRateLimit(estimated);
  if (!allowed) {
    await waitForRateLimit(waitMs);
  }
  
  const request: GroqChatRequest = {
    model: options.model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: options.temperature ?? config.models.temperature,
    max_tokens: options.maxTokens ?? config.models.max_tokens,
    top_p: options.topP,
    stream: true
  };
  
  const response = await fetch(`${GROQ_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq chat failed: ${response.status} ${error}`);
  }
  
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }
  
  const decoder = new TextDecoder();
  let buffer = '';
  let totalContent = '';
  let promptTokens = 0;
  let completionTokens = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      
      const data = trimmed.slice(6);
      if (data === '[DONE]') {
        updateRateLimit(promptTokens + completionTokens);
        yield {
          content: '',
          done: true,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens
          }
        };
        return;
      }
      
      try {
        const chunk = JSON.parse(data) as GroqStreamChunk;
        const content = chunk.choices[0]?.delta?.content || '';
        totalContent += content;
        
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens;
          completionTokens = chunk.usage.completion_tokens;
        }
        
        yield {
          content,
          done: false
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
  options: GroqOptions
): Promise<LLMResponse> {
  const apiKey = getApiKey(options);
  const config = getConfig();
  
  // Check rate limit
  const estimated = estimateTokens(messages);
  const { allowed, waitMs } = checkRateLimit(estimated);
  if (!allowed) {
    await waitForRateLimit(waitMs);
  }
  
  const request: GroqChatRequest = {
    model: options.model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: options.temperature ?? config.models.temperature,
    max_tokens: options.maxTokens ?? config.models.max_tokens,
    top_p: options.topP,
    stream: false
  };
  
  const response = await fetch(`${GROQ_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq chat failed: ${response.status} ${error}`);
  }
  
  const data = await response.json() as GroqChatResponse;
  
  updateRateLimit(data.usage.total_tokens);
  
  return {
    content: data.choices[0]?.message?.content || '',
    usage: {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens
    },
    model: data.model,
    finishReason: data.choices[0]?.finish_reason || 'stop'
  };
}

/**
 * Get rate limit status
 */
export function getRateLimitStatus(): {
  requestsRemaining: number;
  tokensRemaining: number;
  resetsIn: number;
} {
  resetRateLimitIfNeeded();
  
  return {
    requestsRemaining: Math.max(0, RATE_LIMIT_REQUESTS - requestCount),
    tokensRemaining: Math.max(0, RATE_LIMIT_TOKENS - tokenCount),
    resetsIn: Math.max(0, RATE_LIMIT_WINDOW - (Date.now() - windowStart))
  };
}
