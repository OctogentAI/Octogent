// ============================================================================
// Octogent - Groq Provider (Fast Inference)
// ============================================================================

import { 
  BaseLLMProvider, 
  type ProviderCapabilities, 
  type ChatCompletionOptions,
  type StreamCallbacks,
  registerProvider 
} from './base.js';
import type { LLMConfig, LLMResponse, LLMStreamChunk } from '../types.js';
import { LLMError, LLMConnectionError, LLMRateLimitError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface GroqMessage {
  role: string;
  content: string;
}

interface GroqResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
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
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

const GROQ_MODELS: Record<string, { contextLength: number; costInput: number; costOutput: number }> = {
  'llama-3.3-70b-versatile': { contextLength: 128000, costInput: 0.59, costOutput: 0.79 },
  'llama-3.1-70b-versatile': { contextLength: 128000, costInput: 0.59, costOutput: 0.79 },
  'llama-3.1-8b-instant': { contextLength: 128000, costInput: 0.05, costOutput: 0.08 },
  'llama3-70b-8192': { contextLength: 8192, costInput: 0.59, costOutput: 0.79 },
  'llama3-8b-8192': { contextLength: 8192, costInput: 0.05, costOutput: 0.08 },
  'mixtral-8x7b-32768': { contextLength: 32768, costInput: 0.24, costOutput: 0.24 },
  'gemma2-9b-it': { contextLength: 8192, costInput: 0.20, costOutput: 0.20 },
};

export class GroqProvider extends BaseLLMProvider {
  private apiKey: string;
  private baseUrl = 'https://api.groq.com/openai/v1';

  constructor(config: LLMConfig) {
    super(config, 'groq');
    this.apiKey = process.env.GROQ_API_KEY || '';
    
    if (!this.apiKey) {
      logger.warn('GROQ_API_KEY not set - Groq provider will not be available');
    }
  }

  getCapabilities(): ProviderCapabilities {
    const modelInfo = GROQ_MODELS[this.config.model] || {
      contextLength: 8192,
      costInput: 0.10,
      costOutput: 0.10,
    };

    return {
      streaming: true,
      functionCalling: true,
      vision: false,
      maxContextLength: modelInfo.contextLength,
      costPerMillionTokens: {
        input: modelInfo.costInput,
        output: modelInfo.costOutput,
      },
    };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    if (!this.apiKey) return [];

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }

      const data = await response.json() as { data: Array<{ id: string }> };
      return data.data.map((m) => m.id);
    } catch (error) {
      throw new LLMConnectionError(this.name, this.config.model, error as Error);
    }
  }

  async chat(options: ChatCompletionOptions): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new LLMError(
        'GROQ_API_KEY not configured',
        this.name,
        this.config.model
      );
    }

    const { temperature, maxTokens } = this.mergeConfig(options);
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: this.formatMessages(options.messages) as GroqMessage[],
          temperature,
          max_tokens: maxTokens,
          top_p: options.topP ?? 1,
          stream: false,
          stop: options.stopSequences,
        }),
        signal: options.abortSignal,
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        throw new LLMRateLimitError(
          this.name,
          this.config.model,
          retryAfter ? parseInt(retryAfter) : undefined
        );
      }

      if (!response.ok) {
        const error = await response.text();
        throw new LLMError(
          `Groq request failed: ${error}`,
          this.name,
          this.config.model,
          { statusCode: response.status }
        );
      }

      const data = await response.json() as GroqResponse;
      const duration = Date.now() - startTime;

      logger.llmResponse(
        this.name,
        this.config.model,
        data.usage.completion_tokens,
        duration
      );

      return {
        content: data.choices[0].message.content,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        model: data.model,
        finishReason: data.choices[0].finish_reason,
      };
    } catch (error) {
      if (error instanceof LLMError) throw error;
      throw new LLMConnectionError(this.name, this.config.model, error as Error);
    }
  }

  async chatStream(
    options: ChatCompletionOptions,
    callbacks: StreamCallbacks
  ): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new LLMError(
        'GROQ_API_KEY not configured',
        this.name,
        this.config.model
      );
    }

    const { temperature, maxTokens } = this.mergeConfig(options);
    const startTime = Date.now();
    let fullContent = '';
    let finishReason = 'stop';

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: this.formatMessages(options.messages) as GroqMessage[],
          temperature,
          max_tokens: maxTokens,
          top_p: options.topP ?? 1,
          stream: true,
          stop: options.stopSequences,
        }),
        signal: options.abortSignal,
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        throw new LLMRateLimitError(
          this.name,
          this.config.model,
          retryAfter ? parseInt(retryAfter) : undefined
        );
      }

      if (!response.ok) {
        const error = await response.text();
        throw new LLMError(
          `Groq stream request failed: ${error}`,
          this.name,
          this.config.model,
          { statusCode: response.status }
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new LLMError('No response body', this.name, this.config.model);
      }

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
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const chunk = JSON.parse(trimmed.slice(6)) as GroqStreamChunk;
            const delta = chunk.choices[0]?.delta;

            if (delta?.content) {
              fullContent += delta.content;

              const streamChunk: LLMStreamChunk = {
                content: delta.content,
                done: false,
              };

              callbacks.onChunk?.(streamChunk);
            }

            if (chunk.choices[0]?.finish_reason) {
              finishReason = chunk.choices[0].finish_reason;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      const duration = Date.now() - startTime;
      const estimatedTokens = this.estimateTokenCount(fullContent);

      const result: LLMResponse = {
        content: fullContent,
        usage: {
          promptTokens: 0, // Groq doesn't provide this in stream
          completionTokens: estimatedTokens,
          totalTokens: estimatedTokens,
        },
        model: this.config.model,
        finishReason,
      };

      logger.llmResponse(this.name, this.config.model, estimatedTokens, duration);
      callbacks.onComplete?.(result);

      return result;
    } catch (error) {
      const wrappedError = error instanceof Error ? error : new Error(String(error));
      callbacks.onError?.(wrappedError);

      if (error instanceof LLMError) throw error;
      throw new LLMConnectionError(this.name, this.config.model, wrappedError);
    }
  }
}

// Register the provider
registerProvider('groq', (config) => new GroqProvider(config));

export default GroqProvider;
