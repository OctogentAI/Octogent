// ============================================================================
// Tests: middleware/rate-limiter.ts
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter, getLimiter, setLimiter } from '../../src/middleware/rate-limiter';

describe('RateLimiter', () => {
  it('allows immediate acquisition when bucket is full', async () => {
    const limiter = new RateLimiter({ requestsPerMinute: 60 });
    const start = Date.now();
    await limiter.acquire();
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('canProceed returns true when bucket has tokens', () => {
    const limiter = new RateLimiter({ requestsPerMinute: 60 });
    expect(limiter.canProceed()).toBe(true);
  });

  it('status returns correct rpm', () => {
    const limiter = new RateLimiter({ requestsPerMinute: 30, tokensPerMinute: 10_000 });
    const status = limiter.status();
    expect(status.requestsPerMinute).toBe(30);
    expect(status.tokensPerMinute).toBe(10_000);
  });

  it('reports llmTokens as null when not configured', () => {
    const limiter = new RateLimiter({ requestsPerMinute: 10 });
    expect(limiter.status().llmTokens).toBeNull();
  });
});

describe('getLimiter / setLimiter', () => {
  it('returns a default limiter for anthropic', () => {
    const limiter = getLimiter('anthropic');
    expect(limiter).toBeInstanceOf(RateLimiter);
  });

  it('allows custom limiter to be set', () => {
    setLimiter('test-provider', { requestsPerMinute: 5 });
    const limiter = getLimiter('test-provider');
    expect(limiter.status().requestsPerMinute).toBe(5);
  });
});
