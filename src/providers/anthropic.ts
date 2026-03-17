// ============================================================================
// Octogent - Anthropic Claude Provider
// ============================================================================

import { 
  BaseLLMProvider, 
  type ProviderCapabilities, 
  type ChatCompletionOptions,
  type StreamCallbacks,
  type ToolDefinition,
  registerProvider 
} from './base.js';
import type { LLMConfig, LLMMessage, LLMResponse, LLMStreamChunk } from '../types.js';
import { LLMError, LLMConnectionError, LLMRateLimitError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string }>;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
  };
  content_block?: {
    type: string;
    text?: string;
    id?: string;
    name?: string;
  };
  message?: AnthropicResponse;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

const CLAUDE_MODELS: Record<string, { contextLength: number; costInput: number; costOutput: number }> = {
  'claude-sonnet-4-20250514': { contextLength: 200000, costInput: 3.00, costOutput: 15.00 },
  'claude-3-5-sonnet-20241022': { contextLength: 200000, costInput: 3.00, costOutput: 15.00 },
  'claude-3-5-haiku-20241022': { contextLength: 200000, costInput: 0.80, costOutput: 4.00 },
  'claude-3-opus-20240229': { contextLength: 200000, costInput: 15.00, costOutput: 75.00 },
  'claude-3-sonnet-20240229': { contextLength: 200000, costInput: 3.00, costOutput: 15.00 },
  'claude-3-haiku-20240307': { contextLength: 200000, costInput: 0.25, costOutput: 1.25 },
};

export class AnthropicProvider extends BaseLLMProvider {
  private apiKey: string;
  private baseUrl = 'https://api.anthropic.com/v1';
  private apiVersion = '2023-06-01';

  constructor(config: LLMConfig) {
    super(config, 'anthropic');
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
  }

  getCapabilities(): ProviderCapabilities {
    const modelInfo = CLAUDE_MODELS[this.config.model] || {
      contextLength: 200000,
      costInput: 3.00,
      costOutput: 15.00,
    };

    return {
      streaming: true,
      functionCalling: true,
      vision: true,
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
      // Anthropic doesn't have a models endpoint, so we just check auth
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
        signal: AbortSignal.timeout(5000),
      });
      // 400 means auth worked but request was bad (fine for health check)
      return response.ok || response.status === 400;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    return Object.keys(CLAUDE_MODELS);
  }

  async chat(options: ChatCompletionOptions): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new LLMError(
        'ANTHROPIC_API_KEY not configured',
        this.name,
        this.config.model
      );
    }

    const { temperature, maxTokens } = this.mergeConfig(options);
    const startTime = Date.now();
    const { systemPrompt, messages } = this.separateSystemPrompt(options.messages);

    try {
      const body: Record<string, unknown> = {
        model: this.config.model,
        max_tokens: maxTokens,
        messages: this.formatAnthropicMessages(messages),
        temperature,
        top_p: options.topP ?? 1,
        stop_sequences: options.stopSequences,
      };

      if (systemPrompt) {
        body.system = systemPrompt;
      }

      if (options.tools && options.tools.length > 0) {
        body.tools = this.formatTools(options.tools);
      }

      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: options.abortSignal,
      });

      await this.handleErrorResponse(response);

      const data = await response.json() as AnthropicResponse;
      const duration = Date.now() - startTime;

      const textContent = data.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');

      logger.llmResponse(
        this.name,
        this.config.model,
        data.usage.output_tokens,
        duration
      );

      return {
        content: textContent,
        usage: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        },
        model: data.model,
        finishReason: data.stop_reason,
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
        'ANTHROPIC_API_KEY not configured',
        this.name,
        this.config.model
      );
    }

    const { temperature, maxTokens } = this.mergeConfig(options);
    const startTime = Date.now();
    const { systemPrompt, messages } = this.separateSystemPrompt(options.messages);
    
    let fullContent = '';
    let finishReason = 'stop';
    let inputTokens = 0;
    let outputTokens = 0;
    let currentToolCall: { name: string; arguments: string } | null = null;

    try {
      const body: Record<string, unknown> = {
        model: this.config.model,
        max_tokens: maxTokens,
        messages: this.formatAnthropicMessages(messages),
        temperature,
        top_p: options.topP ?? 1,
        stop_sequences: options.stopSequences,
        stream: true,
      };

      if (systemPrompt) {
        body.system = systemPrompt;
      }

      if (options.tools && options.tools.length > 0) {
        body.tools = this.formatTools(options.tools);
      }

      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
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
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(trimmed.slice(6)) as AnthropicStreamEvent;

            switch (event.type) {
              case 'content_block_start':
                if (event.content_block?.type === 'tool_use') {
                  currentToolCall = { name: event.content_block.name || '', arguments: '' };
                }
                break;

              case 'content_block_delta':
                if (event.delta?.type === 'text_delta' && event.delta.text) {
                  fullContent += event.delta.text;

                  const streamChunk: LLMStreamChunk = {
                    content: event.delta.text,
                    done: false,
                  };

                  callbacks.onChunk?.(streamChunk);
                } else if (event.delta?.type === 'input_json_delta' && currentToolCall) {
                  currentToolCall.arguments += event.delta.partial_json || '';
                }
                break;

              case 'content_block_stop':
                if (currentToolCall) {
                  callbacks.onToolCall?.(currentToolCall);
                  currentToolCall = null;
                }
                break;

              case 'message_delta':
                if (event.usage) {
                  outputTokens = event.usage.output_tokens || 0;
                }
                break;

              case 'message_start':
                if (event.message?.usage) {
                  inputTokens = event.message.usage.input_tokens;
                }
                break;

              case 'message_stop':
                finishReason = 'stop';
                break;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      const duration = Date.now() - startTime;

      const result: LLMResponse = {
        content: fullContent,
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        model: this.config.model,
        finishReason,
      };

      logger.llmResponse(this.name, this.config.model, outputTokens, duration);
      callbacks.onComplete?.(result);

      return result;
    } catch (error) {
      const wrappedError = error instanceof Error ? error : new Error(String(error));
      callbacks.onError?.(wrappedError);

      if (error instanceof LLMError) throw error;
      throw new LLMConnectionError(this.name, this.config.model, wrappedError);
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': this.apiVersion,
    };
  }

  private separateSystemPrompt(messages: LLMMessage[]): {
    systemPrompt: string | null;
    messages: LLMMessage[];
  } {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const otherMessages = messages.filter((m) => m.role !== 'system');

    return {
      systemPrompt: systemMessages.length > 0 
        ? systemMessages.map((m) => m.content).join('\n\n')
        : null,
      messages: otherMessages,
    };
  }

  private formatAnthropicMessages(messages: LLMMessage[]): AnthropicMessage[] {
    return messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    }));
  }

  private formatTools(tools: ToolDefinition[]): unknown[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  private async handleErrorResponse(response: Response): Promise<void> {
    if (response.ok) return;

    const errorText = await response.text();
    let errorData: { error?: { message?: string; type?: string } } = {};

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

    throw new LLMError(
      `Anthropic request failed: ${errorData.error?.message || errorText}`,
      this.name,
      this.config.model,
      { statusCode: response.status }
    );
  }
}

// Register the provider
registerProvider('anthropic', (config) => new AnthropicProvider(config));

export default AnthropicProvider;
