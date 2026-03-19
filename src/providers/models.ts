// ============================================================================
// Octogent - Model Registry
// Central catalogue of all supported models across all providers.
// ============================================================================

export interface ModelInfo {
  id: string;
  provider: 'anthropic' | 'openai' | 'groq' | 'ollama';
  displayName: string;
  contextLength: number;
  costPer1MInput: number;   // USD
  costPer1MOutput: number;  // USD
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsFunctions: boolean;
  isReasoning: boolean;     // o-series / extended thinking
  maxOutputTokens: number;
  tags: string[];
}

export const MODEL_REGISTRY: ModelInfo[] = [
  // ── Anthropic ──────────────────────────────────────────────────────────────
  {
    id: 'claude-opus-4-6-20251001',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.6',
    contextLength: 400_000,
    costPer1MInput: 30.00,
    costPer1MOutput: 150.00,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    isReasoning: false,
    maxOutputTokens: 32_768,
    tags: ['flagship', 'claude-4', 'high-capability'],
  },
  {
    id: 'claude-opus-4-5-20250901',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.5',
    contextLength: 400_000,
    costPer1MInput: 25.00,
    costPer1MOutput: 125.00,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    isReasoning: false,
    maxOutputTokens: 32_768,
    tags: ['claude-4', 'high-capability'],
  },
  {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4',
    contextLength: 200_000,
    costPer1MInput: 3.00,
    costPer1MOutput: 15.00,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    isReasoning: false,
    maxOutputTokens: 16_384,
    tags: ['claude-4', 'balanced'],
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    displayName: 'Claude 3.5 Sonnet',
    contextLength: 200_000,
    costPer1MInput: 3.00,
    costPer1MOutput: 15.00,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    isReasoning: false,
    maxOutputTokens: 8_192,
    tags: ['claude-3.5', 'recommended'],
  },
  {
    id: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    displayName: 'Claude 3.5 Haiku',
    contextLength: 200_000,
    costPer1MInput: 0.80,
    costPer1MOutput: 4.00,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    isReasoning: false,
    maxOutputTokens: 8_192,
    tags: ['claude-3.5', 'fast', 'cheap'],
  },
  {
    id: 'claude-3-opus-20240229',
    provider: 'anthropic',
    displayName: 'Claude 3 Opus',
    contextLength: 200_000,
    costPer1MInput: 15.00,
    costPer1MOutput: 75.00,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    isReasoning: false,
    maxOutputTokens: 4_096,
    tags: ['claude-3'],
  },

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  {
    id: 'gpt-5.2-pro',
    provider: 'openai',
    displayName: 'GPT-5.2 Pro',
    contextLength: 1_000_000,
    costPer1MInput: 15.00,
    costPer1MOutput: 60.00,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    isReasoning: false,
    maxOutputTokens: 65_536,
    tags: ['gpt-5', 'flagship', 'high-capability'],
  },
  {
    id: 'gpt-5.2',
    provider: 'openai',
    displayName: 'GPT-5.2',
    contextLength: 500_000,
    costPer1MInput: 10.00,
    costPer1MOutput: 40.00,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    isReasoning: false,
    maxOutputTokens: 32_768,
    tags: ['gpt-5'],
  },
  {
    id: 'gpt-5-mini',
    provider: 'openai',
    displayName: 'GPT-5 Mini',
    contextLength: 256_000,
    costPer1MInput: 2.00,
    costPer1MOutput: 8.00,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    isReasoning: false,
    maxOutputTokens: 16_384,
    tags: ['gpt-5', 'fast', 'cheap'],
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    contextLength: 128_000,
    costPer1MInput: 2.50,
    costPer1MOutput: 10.00,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    isReasoning: false,
    maxOutputTokens: 16_384,
    tags: ['gpt-4o', 'recommended'],
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o Mini',
    contextLength: 128_000,
    costPer1MInput: 0.15,
    costPer1MOutput: 0.60,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
    isReasoning: false,
    maxOutputTokens: 16_384,
    tags: ['gpt-4o', 'fast', 'cheap'],
  },
  {
    id: 'o3',
    provider: 'openai',
    displayName: 'o3',
    contextLength: 200_000,
    costPer1MInput: 20.00,
    costPer1MOutput: 80.00,
    supportsVision: false,
    supportsStreaming: false,
    supportsFunctions: true,
    isReasoning: true,
    maxOutputTokens: 100_000,
    tags: ['reasoning', 'o-series'],
  },
  {
    id: 'o3-mini',
    provider: 'openai',
    displayName: 'o3-mini',
    contextLength: 128_000,
    costPer1MInput: 1.10,
    costPer1MOutput: 4.40,
    supportsVision: false,
    supportsStreaming: false,
    supportsFunctions: true,
    isReasoning: true,
    maxOutputTokens: 65_536,
    tags: ['reasoning', 'o-series', 'fast'],
  },
  {
    id: 'o1',
    provider: 'openai',
    displayName: 'o1',
    contextLength: 200_000,
    costPer1MInput: 15.00,
    costPer1MOutput: 60.00,
    supportsVision: false,
    supportsStreaming: false,
    supportsFunctions: false,
    isReasoning: true,
    maxOutputTokens: 100_000,
    tags: ['reasoning', 'o-series'],
  },

  // ── Groq ──────────────────────────────────────────────────────────────────
  {
    id: 'llama-3.3-70b-versatile',
    provider: 'groq',
    displayName: 'Llama 3.3 70B Versatile',
    contextLength: 128_000,
    costPer1MInput: 0.59,
    costPer1MOutput: 0.79,
    supportsVision: false,
    supportsStreaming: true,
    supportsFunctions: true,
    isReasoning: false,
    maxOutputTokens: 32_768,
    tags: ['llama', 'groq', 'fast'],
  },
  {
    id: 'llama-3.1-8b-instant',
    provider: 'groq',
    displayName: 'Llama 3.1 8B Instant',
    contextLength: 128_000,
    costPer1MInput: 0.05,
    costPer1MOutput: 0.08,
    supportsVision: false,
    supportsStreaming: true,
    supportsFunctions: true,
    isReasoning: false,
    maxOutputTokens: 8_192,
    tags: ['llama', 'groq', 'fast', 'cheap'],
  },
  {
    id: 'mixtral-8x7b-32768',
    provider: 'groq',
    displayName: 'Mixtral 8x7B',
    contextLength: 32_768,
    costPer1MInput: 0.24,
    costPer1MOutput: 0.24,
    supportsVision: false,
    supportsStreaming: true,
    supportsFunctions: false,
    isReasoning: false,
    maxOutputTokens: 32_768,
    tags: ['groq', 'mixture-of-experts'],
  },
];

// ── Lookup helpers ─────────────────────────────────────────────────────────

/** Look up a model by id */
export function getModel(id: string): ModelInfo | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

/** Get all models for a given provider */
export function getModelsByProvider(provider: ModelInfo['provider']): ModelInfo[] {
  return MODEL_REGISTRY.filter((m) => m.provider === provider);
}

/** Get models matching any of the given tags */
export function getModelsByTag(...tags: string[]): ModelInfo[] {
  return MODEL_REGISTRY.filter((m) =>
    tags.some((t) => m.tags.includes(t))
  );
}

/** Get the cheapest model that satisfies minimum context length */
export function getCheapestModel(minContextLength: number): ModelInfo | undefined {
  return MODEL_REGISTRY
    .filter((m) => m.contextLength >= minContextLength)
    .sort((a, b) => a.costPer1MInput - b.costPer1MInput)[0];
}

/** Get the best model for a task based on a score function */
export function getBestModel(
  scoreFn: (m: ModelInfo) => number
): ModelInfo | undefined {
  return MODEL_REGISTRY.slice().sort((a, b) => scoreFn(b) - scoreFn(a))[0];
}

/** Estimate cost of a request */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = getModel(modelId);
  if (!model) return 0;
  return (
    (inputTokens / 1_000_000) * model.costPer1MInput +
    (outputTokens / 1_000_000) * model.costPer1MOutput
  );
}

export default MODEL_REGISTRY;
