// ============================================================================
// Octogent - Retry Utilities with Exponential Backoff
// ============================================================================

import { logger } from './logger.js';
import { OctogentError, LLMRateLimitError } from './errors.js';

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryOn?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
  abortSignal?: AbortSignal;
}

const defaultOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export class RetryError extends OctogentError {
  public readonly attempts: number;
  public readonly lastError: Error;

  constructor(message: string, attempts: number, lastError: Error) {
    super(message, 'RETRY_EXHAUSTED', {
      details: { attempts },
      recoverable: false,
      cause: lastError,
    });
    this.name = 'RetryError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);

    if (abortSignal) {
      const abortHandler = () => {
        clearTimeout(timeout);
        reject(new Error('Retry aborted'));
      };

      if (abortSignal.aborted) {
        abortHandler();
        return;
      }

      abortSignal.addEventListener('abort', abortHandler, { once: true });
    }
  });
}

function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number,
  error?: Error
): number {
  // Check if error has a retry-after hint
  if (error instanceof LLMRateLimitError && error.retryAfter) {
    return Math.min(error.retryAfter * 1000, maxDelayMs);
  }

  // Exponential backoff with jitter
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

function shouldRetry(error: Error, options: RetryOptions): boolean {
  // Custom retry predicate
  if (options.retryOn) {
    return options.retryOn(error);
  }

  // Default: retry recoverable errors
  if (error instanceof OctogentError) {
    return error.recoverable;
  }

  // Retry network errors
  if (error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('fetch failed')) {
    return true;
  }

  return false;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = { ...defaultOptions, ...options };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      // Check abort signal before attempt
      if (opts.abortSignal?.aborted) {
        throw new Error('Operation aborted');
      }

      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isLastAttempt = attempt >= opts.maxAttempts;
      const canRetry = !isLastAttempt && shouldRetry(lastError, opts);

      if (!canRetry) {
        throw lastError;
      }

      const delayMs = calculateDelay(
        attempt,
        opts.initialDelayMs,
        opts.maxDelayMs,
        opts.backoffMultiplier,
        lastError
      );

      logger.debug(`Retry attempt ${attempt}/${opts.maxAttempts}`, {
        error: lastError.message,
        delayMs,
      });

      if (opts.onRetry) {
        opts.onRetry(lastError, attempt, delayMs);
      }

      await sleep(delayMs, opts.abortSignal);
    }
  }

  throw new RetryError(
    `Operation failed after ${opts.maxAttempts} attempts`,
    opts.maxAttempts,
    lastError!
  );
}

// Convenience function for LLM retries
export async function retryLLM<T>(
  fn: () => Promise<T>,
  abortSignal?: AbortSignal
): Promise<T> {
  return retry(fn, {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    abortSignal,
    onRetry: (error, attempt, delayMs) => {
      logger.warn(`LLM request failed, retrying in ${delayMs}ms`, {
        attempt,
        error: error.message,
      });
    },
  });
}

// Convenience function for tool retries
export async function retryTool<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 2
): Promise<T> {
  return retry(fn, {
    maxAttempts,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
  });
}

// Circuit breaker pattern
export interface CircuitBreakerOptions {
  failureThreshold: number;
  recoveryTimeMs: number;
  onOpen?: () => void;
  onClose?: () => void;
  onHalfOpen?: () => void;
}

type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      recoveryTimeMs: options.recoveryTimeMs ?? 30000,
      onOpen: options.onOpen,
      onClose: options.onClose,
      onHalfOpen: options.onHalfOpen,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.options.recoveryTimeMs) {
        this.state = 'half-open';
        this.options.onHalfOpen?.();
      } else {
        throw new OctogentError(
          'Circuit breaker is open',
          'CIRCUIT_OPEN',
          { recoverable: true }
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.options.onClose?.();
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = 'open';
      this.options.onOpen?.();
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}
