// ============================================================================
// Octogent - OpenAI Compatible Provider
// ============================================================================

import { 
  BaseLLMProvider, 
  type ProviderCapabilities, 
  type ChatCompletionOptions,
  type StreamCallbacks,
  type ToolDefinition,
  registerProvider 
} from './base.js';
import type { LLMConfig, LLMResponse, LLMStreamChunk } from '../types.js';
import { LLMError, LLMConnectionError, LLMRateLimitError, LLMContextLengthError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface OpenAIMessage {
  role: string;
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

const MODEL_CONTEXT_LENGTHS: Record<string, number> = {
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
  'o1': 200000,
  'o1-mini': 128000,
  'o1-preview': 128000,
};

export class OpenAIProvider extends BaseLLMProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: LLMConfig, name: string = 'openai') {
    super(config, name);
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseUrl = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
  }

  getCapabilities(): ProviderCapabilities {
    const contextLength = MODEL_CONTEXT_LENGTHS[this.config.model] || 8192;

    return {
      streaming: true,
      functionCalling: true,
      vision: this.config.model.includes('gpt-4') || this.config.model.includes('o1'),
      maxContextLength: contextLength,
      costPerMillionTokens: {
        input: this.config.model.includes('gpt-4o') ? 2.50 : 0.50,
        output: this.config.model.includes('gpt-4o') ? 10.00 : 1.50,
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
      return data.data.map((m) => m.id).filter((id) => id.startsWith('gpt-'));
    } catch (error) {
      throw new LLMConnectionError(this.name, this.config.model, error as Error);
    }
  }

  async chat(options: ChatCompletionOptions): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new LLMError(
        'OPENAI_API_KEY not configured',
        this.name,
        this.config.model
      );
    }

    const { temperature, maxTokens } = this.mergeConfig(options);
    const startTime = Date.now();

    try {
      const body: Record<string, unknown> = {
        model: this.config.model,
        messages: this.formatMessages(options.messages),
        temperature,
        max_tokens: maxTokens,
        top_p: options.topP ?? 1,
        stream: false,
        stop: options.stopSequences,
      };

      if (options.tools && options.tools.length > 0) {
        body.tools = this.formatTools(options.tools);
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      });

      await this.handleErrorResponse(response);

      const data = await response.json() as OpenAIResponse;
      const duration = Date.now() - startTime;

      logger.llmResponse(
        this.name,
        this.config.model,
        data.usage.completion_tokens,
        duration
      );

      return {
        content: data.choices[0].message.content || '',
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
        'OPENAI_API_KEY not configured',
        this.name,
        this.config.model
      );
    }

    const { temperature, maxTokens } = this.mergeConfig(options);
    const startTime = Date.now();
    let fullContent = '';
    let finishReason = 'stop';
    let toolCallBuffer: Map<number, { name: string; arguments: string }> = new Map();

    try {
      const body: Record<string, unknown> = {
        model: this.config.model,
        messages: this.formatMessages(options.messages),
        temperature,
        max_tokens: maxTokens,
        top_p: options.topP ?? 1,
        stream: true,
        stop: options.stopSequences,
      };

      if (options.tools && options.tools.length > 0) {
        body.tools = this.formatTools(options.tools);
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      });

      await this.handleErrorResponse(response);

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
            const chunk = JSON.parse(trimmed.slice(6)) as OpenAIStreamChunk;
            const delta = chunk.choices[0]?.delta;

            if (delta?.content) {
              fullContent += delta.content;

              const streamChunk: LLMStreamChunk = {
                content: delta.content,
                done: false,
              };

              callbacks.onChunk?.(streamChunk);
            }

            // Handle tool calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (!toolCallBuffer.has(tc.index)) {
                  toolCallBuffer.set(tc.index, { name: '', arguments: '' });
                }
                const call = toolCallBuffer.get(tc.index)!;
                
                if (tc.function?.name) {
                  call.name = tc.function.name;
                }
                if (tc.function?.arguments) {
                  call.arguments += tc.function.arguments;
                }
              }
            }

            if (chunk.choices[0]?.finish_reason) {
              finishReason = chunk.choices[0].finish_reason;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      // Emit any completed tool calls
      for (const [, call] of toolCallBuffer) {
        if (call.name) {
          callbacks.onToolCall?.(call);
        }
      }

      const duration = Date.now() - startTime;
      const estimatedTokens = this.estimateTokenCount(fullContent);

      const result: LLMResponse = {
        content: fullContent,
        usage: {
          promptTokens: 0,
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

  private formatTools(tools: ToolDefinition[]): unknown[] {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  private async handleErrorResponse(response: Response): Promise<void> {
    if (response.ok) return;

    const errorText = await response.text();
    let errorData: { error?: { message?: string; code?: string } } = {};

    try {
      errorData = JSON.parse(errorText);
    } catch {
      // Not JSON
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw new LLMRateLimitError(
        this.name,
        this.config.model,
        retryAfter ? parseInt(retryAfter) : undefined
      );
    }

    if (response.status === 400 && errorData.error?.code === 'context_length_exceeded') {
      const match = errorData.error.message?.match(/maximum context length is (\d+) tokens.*you requested (\d+)/);
      if (match) {
        throw new LLMContextLengthError(
          this.name,
          this.config.model,
          parseInt(match[1]),
          parseInt(match[2])
        );
      }
    }

    throw new LLMError(
      `OpenAI request failed: ${errorData.error?.message || errorText}`,
      this.name,
      this.config.model,
      { statusCode: response.status }
    );
  }
}

// Register the provider
registerProvider('openai', (config) => new OpenAIProvider(config, 'openai'));

export default OpenAIProvider;
