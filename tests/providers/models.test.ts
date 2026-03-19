// ============================================================================
// Tests: providers/models.ts
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  MODEL_REGISTRY,
  getModel,
  getModelsByProvider,
  getModelsByTag,
  getCheapestModel,
  estimateCost,
} from '../../src/providers/models';

describe('Model Registry', () => {
  it('contains Claude Opus 4.6', () => {
    const model = getModel('claude-opus-4-6-20251001');
    expect(model).toBeDefined();
    expect(model!.displayName).toBe('Claude Opus 4.6');
    expect(model!.provider).toBe('anthropic');
    expect(model!.contextLength).toBeGreaterThanOrEqual(200_000);
  });

  it('contains GPT-5.2 Pro', () => {
    const model = getModel('gpt-5.2-pro');
    expect(model).toBeDefined();
    expect(model!.displayName).toBe('GPT-5.2 Pro');
    expect(model!.provider).toBe('openai');
    expect(model!.contextLength).toBeGreaterThanOrEqual(500_000);
  });

  it('getModelsByProvider returns only anthropic models', () => {
    const models = getModelsByProvider('anthropic');
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === 'anthropic')).toBe(true);
  });

  it('getModelsByTag works', () => {
    const flagship = getModelsByTag('flagship');
    expect(flagship.length).toBeGreaterThan(0);
    expect(flagship.every((m) => m.tags.includes('flagship'))).toBe(true);
  });

  it('getCheapestModel returns the cheapest model above context threshold', () => {
    const cheap = getCheapestModel(8000);
    expect(cheap).toBeDefined();
    expect(cheap!.contextLength).toBeGreaterThanOrEqual(8000);
  });

  it('estimateCost calculates correctly', () => {
    // gpt-5.2-pro: $15/M input, $60/M output
    const cost = estimateCost('gpt-5.2-pro', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(75.00, 1);
  });

  it('all models have required fields', () => {
    for (const model of MODEL_REGISTRY) {
      expect(model.id).toBeTruthy();
      expect(model.provider).toBeTruthy();
      expect(model.displayName).toBeTruthy();
      expect(model.contextLength).toBeGreaterThan(0);
      expect(typeof model.supportsStreaming).toBe('boolean');
    }
  });
});
