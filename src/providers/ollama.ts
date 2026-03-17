// ============================================================================
// Octogent - Ollama Provider
// ============================================================================

import { 
  BaseLLMProvider, 
  type ProviderCapabilities, 
  type ChatCompletionOptions,
  type StreamCallbacks,
  registerProvider 
} from './base.js';
import type { LLMConfig, LLMResponse, LLMStreamChunk } from '../types.js';
import { LLMError, LLMConnectionError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface OllamaResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaStreamChunk {
  model: string;
  message?: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export class OllamaProvider extends BaseLLMProvider {
  private baseUrl: string;

  constructor(config: LLMConfig) {
    super(config, 'ollama');
    this.baseUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
  }

  getCapabilities(): ProviderCapabilities {
    return {
      streaming: true,
      functionCalling: false, // Ollama doesn't natively support function calling
      vision: true, // Some models support vision
      maxContextLength: 128000, // Varies by model
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }
      const data = await response.json() as { models: OllamaModel[] };
      return data.models.map((m) => m.name);
    } catch (error) {
      throw new LLMConnectionError(this.name, this.config.model, error as Error);
    }
  }

  async chat(options: ChatCompletionOptions): Promise<LLMResponse> {
    const { temperature, maxTokens } = this.mergeConfig(options);
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: this.formatMessages(options.messages),
          stream: false,
          options: {
            temperature,
            num_predict: maxTokens,
            top_p: options.topP ?? 1,
          },
        }),
        signal: options.abortSignal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new LLMError(
          `Ollama request failed: ${error}`,
          this.name,
          this.config.model,
          { statusCode: response.status }
        );
      }

      const data = await response.json() as OllamaResponse;
      const duration = Date.now() - startTime;

      logger.llmResponse(
        this.name,
        this.config.model,
        data.eval_count || 0,
        duration
      );

      return {
        content: data.message.content,
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
        model: data.model,
        finishReason: 'stop',
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
    const { temperature, maxTokens } = this.mergeConfig(options);
    const startTime = Date.now();
    let fullContent = '';
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: this.formatMessages(options.messages),
          stream: true,
          options: {
            temperature,
            num_predict: maxTokens,
            top_p: options.topP ?? 1,
          },
        }),
        signal: options.abortSignal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new LLMError(
          `Ollama stream request failed: ${error}`,
          this.name,
          this.config.model,
          { statusCode: response.status }
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new LLMError(
          'No response body',
          this.name,
          this.config.model
        );
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
          if (!line.trim()) continue;

          try {
            const chunk = JSON.parse(line) as OllamaStreamChunk;

            if (chunk.message?.content) {
              fullContent += chunk.message.content;
              
              const streamChunk: LLMStreamChunk = {
                content: chunk.message.content,
                done: chunk.done,
              };
              
              callbacks.onChunk?.(streamChunk);
            }

            if (chunk.done) {
              promptTokens = chunk.prompt_eval_count || 0;
              completionTokens = chunk.eval_count || 0;
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }

      const duration = Date.now() - startTime;
      const result: LLMResponse = {
        content: fullContent,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        model: this.config.model,
        finishReason: 'stop',
      };

      logger.llmResponse(this.name, this.config.model, completionTokens, duration);
      callbacks.onComplete?.(result);

      return result;
    } catch (error) {
      const wrappedError = error instanceof Error ? error : new Error(String(error));
      callbacks.onError?.(wrappedError);
      
      if (error instanceof LLMError) throw error;
      throw new LLMConnectionError(this.name, this.config.model, wrappedError);
    }
  }

  // Pull a model from Ollama library
  async pullModel(modelName: string, onProgress?: (progress: number) => void): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true }),
    });

    if (!response.ok) {
      throw new LLMError(
        `Failed to pull model: ${modelName}`,
        this.name,
        modelName,
        { statusCode: response.status }
      );
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.completed && data.total && onProgress) {
            onProgress(data.completed / data.total);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

// Register the provider
registerProvider('ollama', (config) => new OllamaProvider(config));

export default OllamaProvider;
