// ============================================================================
// LLM Model Router with Automatic Fallback
// ============================================================================

import type { LLMMessage, LLMStreamChunk, LLMResponse, LLMConfig } from '../../lib/types';
import { getConfig } from '../config';
import * as ollama from './ollama';
import * as groq from './groq';

export interface RouterOptions {
  model?: string; // Override default model
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  skipFallback?: boolean; // Don't use fallback on error
}

type Provider = 'ollama' | 'groq';

interface ParsedModel {
  provider: Provider;
  model: string;
}

/**
 * Parse model string into provider and model name
 * Format: "provider/model" e.g., "ollama/llama3:8b" or "groq/llama-3.1-8b-instant"
 */
function parseModel(modelString: string): ParsedModel {
  const [provider, ...modelParts] = modelString.split('/');
  const model = modelParts.join('/');
  
  if (!['ollama', 'groq'].includes(provider)) {
    throw new Error(`Unknown provider: ${provider}. Use "ollama/..." or "groq/..."`);
  }
  
  return {
    provider: provider as Provider,
    model
  };
}

/**
 * Get all available models across providers
 */
export async function getAvailableModels(): Promise<{
  ollama: string[];
  groq: string[];
  available: boolean;
}> {
  const result = {
    ollama: [] as string[],
    groq: [] as string[],
    available: false
  };
  
  // Check Ollama
  try {
    if (await ollama.isOllamaAvailable()) {
      result.ollama = await ollama.listModels();
    }
  } catch (error) {
    console.warn('[router] Failed to list Ollama models:', error);
  }
  
  // Check Groq
  try {
    if (await groq.isGroqAvailable()) {
      result.groq = groq.GROQ_MODELS;
    }
  } catch (error) {
    console.warn('[router] Failed to check Groq:', error);
  }
  
  result.available = result.ollama.length > 0 || result.groq.length > 0;
  
  return result;
}

/**
 * Check if a specific provider is available
 */
export async function isProviderAvailable(provider: Provider): Promise<boolean> {
  switch (provider) {
    case 'ollama':
      return ollama.isOllamaAvailable();
    case 'groq':
      return groq.isGroqAvailable();
    default:
      return false;
  }
}

/**
 * Get the next available model from fallback list
 */
async function getNextAvailableModel(
  tried: string[]
): Promise<ParsedModel | null> {
  const config = getConfig();
  const allModels = [config.models.primary, ...config.models.fallbacks];
  
  for (const modelString of allModels) {
    if (tried.includes(modelString)) continue;
    
    const parsed = parseModel(modelString);
    const available = await isProviderAvailable(parsed.provider);
    
    if (available) {
      return parsed;
    }
  }
  
  return null;
}

/**
 * Stream chat completion with automatic fallback
 */
export async function* streamChat(
  messages: LLMMessage[],
  options: RouterOptions = {}
): AsyncGenerator<LLMStreamChunk> {
  const config = getConfig();
  const modelString = options.model || config.models.primary;
  const triedModels: string[] = [];
  
  let currentModel = parseModel(modelString);
  
  while (true) {
    triedModels.push(`${currentModel.provider}/${currentModel.model}`);
    
    try {
      console.log(`[router] Using ${currentModel.provider}/${currentModel.model}`);
      
      if (currentModel.provider === 'ollama') {
        yield* ollama.streamChat(messages, {
          model: currentModel.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topP: options.topP
        });
      } else if (currentModel.provider === 'groq') {
        yield* groq.streamChat(messages, {
          model: currentModel.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topP: options.topP
        });
      }
      
      return; // Success, exit loop
    } catch (error) {
      console.error(`[router] Error with ${currentModel.provider}/${currentModel.model}:`, error);
      
      if (options.skipFallback) {
        throw error;
      }
      
      // Try to get next available model
      const nextModel = await getNextAvailableModel(triedModels);
      
      if (!nextModel) {
        throw new Error(
          `All models failed. Tried: ${triedModels.join(', ')}. Last error: ${error}`
        );
      }
      
      console.log(`[router] Falling back to ${nextModel.provider}/${nextModel.model}`);
      currentModel = nextModel;
    }
  }
}

/**
 * Non-streaming chat completion with automatic fallback
 */
export async function chat(
  messages: LLMMessage[],
  options: RouterOptions = {}
): Promise<LLMResponse> {
  const config = getConfig();
  const modelString = options.model || config.models.primary;
  const triedModels: string[] = [];
  
  let currentModel = parseModel(modelString);
  
  while (true) {
    triedModels.push(`${currentModel.provider}/${currentModel.model}`);
    
    try {
      console.log(`[router] Using ${currentModel.provider}/${currentModel.model}`);
      
      if (currentModel.provider === 'ollama') {
        return await ollama.chat(messages, {
          model: currentModel.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topP: options.topP
        });
      } else if (currentModel.provider === 'groq') {
        return await groq.chat(messages, {
          model: currentModel.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topP: options.topP
        });
      }
      
      throw new Error(`Unknown provider: ${currentModel.provider}`);
    } catch (error) {
      console.error(`[router] Error with ${currentModel.provider}/${currentModel.model}:`, error);
      
      if (options.skipFallback) {
        throw error;
      }
      
      // Try to get next available model
      const nextModel = await getNextAvailableModel(triedModels);
      
      if (!nextModel) {
        throw new Error(
          `All models failed. Tried: ${triedModels.join(', ')}. Last error: ${error}`
        );
      }
      
      console.log(`[router] Falling back to ${nextModel.provider}/${nextModel.model}`);
      currentModel = nextModel;
    }
  }
}

/**
 * Create a configured LLM instance
 */
export function createLLM(config: LLMConfig) {
  return {
    stream: (messages: LLMMessage[]) => streamChat(messages, {
      model: `${config.provider}/${config.model}`,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      skipFallback: true
    }),
    
    chat: (messages: LLMMessage[]) => chat(messages, {
      model: `${config.provider}/${config.model}`,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      skipFallback: true
    })
  };
}

/**
 * Get router status
 */
export async function getStatus(): Promise<{
  primaryModel: string;
  fallbackModels: string[];
  ollamaAvailable: boolean;
  groqAvailable: boolean;
  groqRateLimit?: {
    requestsRemaining: number;
    tokensRemaining: number;
    resetsIn: number;
  };
}> {
  const config = getConfig();
  
  const [ollamaAvailable, groqAvailable] = await Promise.all([
    ollama.isOllamaAvailable(),
    groq.isGroqAvailable()
  ]);
  
  return {
    primaryModel: config.models.primary,
    fallbackModels: config.models.fallbacks,
    ollamaAvailable,
    groqAvailable,
    groqRateLimit: groqAvailable ? groq.getRateLimitStatus() : undefined
  };
}
