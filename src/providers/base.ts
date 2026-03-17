// ============================================================================
// Octogent - Base LLM Provider Interface
// ============================================================================

import type { LLMConfig, LLMMessage, LLMResponse, LLMStreamChunk } from '../types.js';

export interface ProviderCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  maxContextLength: number;
  costPerMillionTokens?: {
    input: number;
    output: number;
  };
}

export interface ChatCompletionOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  tools?: ToolDefinition[];
  abortSignal?: AbortSignal;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface StreamCallbacks {
  onChunk?: (chunk: LLMStreamChunk) => void;
  onToolCall?: (toolCall: { name: string; arguments: string }) => void;
  onComplete?: (response: LLMResponse) => void;
  onError?: (error: Error) => void;
}

export abstract class BaseLLMProvider {
  protected config: LLMConfig;
  protected name: string;

  constructor(config: LLMConfig, name: string) {
    this.config = config;
    this.name = name;
  }

  abstract getCapabilities(): ProviderCapabilities;

  abstract chat(options: ChatCompletionOptions): Promise<LLMResponse>;

  abstract chatStream(
    options: ChatCompletionOptions,
    callbacks: StreamCallbacks
  ): Promise<LLMResponse>;

  abstract isAvailable(): Promise<boolean>;

  abstract listModels(): Promise<string[]>;

  getName(): string {
    return this.name;
  }

  getModel(): string {
    return this.config.model;
  }

  protected formatMessages(messages: LLMMessage[]): unknown[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  protected estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  protected mergeConfig(options: ChatCompletionOptions): {
    temperature: number;
    maxTokens: number;
    topP: number;
  } {
    return {
      temperature: options.temperature ?? this.config.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? this.config.maxTokens ?? 4096,
      topP: options.topP ?? 1,
    };
  }
}

// Provider factory type
export type ProviderFactory = (config: LLMConfig) => BaseLLMProvider;

// Registry of provider factories
const providerRegistry = new Map<string, ProviderFactory>();

export function registerProvider(name: string, factory: ProviderFactory): void {
  providerRegistry.set(name.toLowerCase(), factory);
}

export function getProvider(name: string, config: LLMConfig): BaseLLMProvider | null {
  const factory = providerRegistry.get(name.toLowerCase());
  if (!factory) return null;
  return factory(config);
}

export function getAvailableProviders(): string[] {
  return Array.from(providerRegistry.keys());
}
