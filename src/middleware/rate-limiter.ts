// ============================================================================
// Rate Limiter — token-bucket rate limiting for LLM provider calls
// ============================================================================

export interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute?: number;
  burstMultiplier?: number;  // Allow short bursts above RPM (default 1.5×)
}

interface BucketState {
  tokens: number;
  lastRefill: number;
}

/**
 * Token-bucket rate limiter.
 * Supports both requests-per-minute and tokens-per-minute limits.
 */
export class RateLimiter {
  private requestBucket: BucketState;
  private tokenBucket: BucketState | null = null;
  private requestsPerMinute: number;
  private tokensPerMinute: number | null;
  private maxBurst: number;
  private waitQueue: Array<() => void> = [];

  constructor(config: RateLimitConfig) {
    this.requestsPerMinute = config.requestsPerMinute;
    this.tokensPerMinute = config.tokensPerMinute ?? null;
    this.maxBurst = Math.ceil(config.requestsPerMinute * (config.burstMultiplier ?? 1.5));

    this.requestBucket = {
      tokens: this.maxBurst,
      lastRefill: Date.now(),
    };

    if (this.tokensPerMinute !== null) {
      this.tokenBucket = {
        tokens: this.tokensPerMinute,
        lastRefill: Date.now(),
      };
    }
  }

  /**
   * Wait until a request can proceed, then consume a token.
   * Optionally consume tokenCount from the token bucket.
   */
  async acquire(tokenCount = 0): Promise<void> {
    // Refill buckets
    this.refill();

    // Check if we can proceed immediately
    const canProceed = this.requestBucket.tokens >= 1 &&
      (this.tokenBucket === null || this.tokenBucket.tokens >= tokenCount);

    if (canProceed) {
      this.requestBucket.tokens -= 1;
      if (this.tokenBucket && tokenCount > 0) {
        this.tokenBucket.tokens -= tokenCount;
      }
      return;
    }

    // Wait for the next available slot
    const msPerRequest = (60 * 1000) / this.requestsPerMinute;
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), msPerRequest);
    });

    // Retry (recursively, but shouldn't be deep)
    return this.acquire(tokenCount);
  }

  /**
   * Check if a request can proceed without waiting.
   */
  canProceed(tokenCount = 0): boolean {
    this.refill();
    return (
      this.requestBucket.tokens >= 1 &&
      (this.tokenBucket === null || this.tokenBucket.tokens >= tokenCount)
    );
  }

  /**
   * Remaining capacity
   */
  status(): {
    requestTokens: number;
    llmTokens: number | null;
    requestsPerMinute: number;
    tokensPerMinute: number | null;
  } {
    this.refill();
    return {
      requestTokens: Math.floor(this.requestBucket.tokens),
      llmTokens: this.tokenBucket ? Math.floor(this.tokenBucket.tokens) : null,
      requestsPerMinute: this.requestsPerMinute,
      tokensPerMinute: this.tokensPerMinute,
    };
  }

  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.requestBucket.lastRefill;
    const refillRate = this.requestsPerMinute / 60_000; // tokens per ms

    // Refill request bucket
    this.requestBucket.tokens = Math.min(
      this.maxBurst,
      this.requestBucket.tokens + elapsedMs * refillRate
    );
    this.requestBucket.lastRefill = now;

    // Refill token bucket
    if (this.tokenBucket && this.tokensPerMinute !== null) {
      const tokenElapsed = now - this.tokenBucket.lastRefill;
      const tokenRefillRate = this.tokensPerMinute / 60_000;
      this.tokenBucket.tokens = Math.min(
        this.tokensPerMinute,
        this.tokenBucket.tokens + tokenElapsed * tokenRefillRate
      );
      this.tokenBucket.lastRefill = now;
    }
  }
}

// ── Per-provider rate limiters ─────────────────────────────────────────────

const limiters = new Map<string, RateLimiter>();

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  anthropic: { requestsPerMinute: 50,  tokensPerMinute: 400_000 },
  openai:    { requestsPerMinute: 60,  tokensPerMinute: 500_000 },
  groq:      { requestsPerMinute: 30,  tokensPerMinute: 14_400  },
  ollama:    { requestsPerMinute: 120, tokensPerMinute: undefined },
};

export function getLimiter(provider: string): RateLimiter {
  if (!limiters.has(provider)) {
    const config = DEFAULT_LIMITS[provider] ?? { requestsPerMinute: 60 };
    limiters.set(provider, new RateLimiter(config));
  }
  return limiters.get(provider)!;
}

export function setLimiter(provider: string, config: RateLimitConfig): void {
  limiters.set(provider, new RateLimiter(config));
}
