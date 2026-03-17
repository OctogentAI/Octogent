// ============================================================================
// Octogent - Custom Error Classes
// ============================================================================

export class OctogentError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  public readonly recoverable: boolean;

  constructor(
    message: string,
    code: string,
    options?: {
      details?: Record<string, unknown>;
      recoverable?: boolean;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'OctogentError';
    this.code = code;
    this.details = options?.details;
    this.recoverable = options?.recoverable ?? false;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      recoverable: this.recoverable,
      stack: this.stack,
    };
  }
}

// Configuration Errors
export class ConfigurationError extends OctogentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', { details, recoverable: false });
    this.name = 'ConfigurationError';
  }
}

// LLM Provider Errors
export class LLMError extends OctogentError {
  public readonly provider: string;
  public readonly model: string;
  public readonly statusCode?: number;

  constructor(
    message: string,
    provider: string,
    model: string,
    options?: {
      statusCode?: number;
      details?: Record<string, unknown>;
      recoverable?: boolean;
      cause?: Error;
    }
  ) {
    super(message, 'LLM_ERROR', options);
    this.name = 'LLMError';
    this.provider = provider;
    this.model = model;
    this.statusCode = options?.statusCode;
  }
}

export class LLMConnectionError extends LLMError {
  constructor(provider: string, model: string, cause?: Error) {
    super(
      `Failed to connect to ${provider}`,
      provider,
      model,
      { recoverable: true, cause }
    );
    this.name = 'LLMConnectionError';
  }
}

export class LLMRateLimitError extends LLMError {
  public readonly retryAfter?: number;

  constructor(provider: string, model: string, retryAfter?: number) {
    super(
      `Rate limited by ${provider}`,
      provider,
      model,
      { recoverable: true, details: { retryAfter } }
    );
    this.name = 'LLMRateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class LLMContextLengthError extends LLMError {
  public readonly maxTokens: number;
  public readonly requestedTokens: number;

  constructor(
    provider: string,
    model: string,
    maxTokens: number,
    requestedTokens: number
  ) {
    super(
      `Context length exceeded for ${model}`,
      provider,
      model,
      { 
        recoverable: true, 
        details: { maxTokens, requestedTokens } 
      }
    );
    this.name = 'LLMContextLengthError';
    this.maxTokens = maxTokens;
    this.requestedTokens = requestedTokens;
  }
}

// Tool Errors
export class ToolError extends OctogentError {
  public readonly toolName: string;

  constructor(
    message: string,
    toolName: string,
    options?: {
      details?: Record<string, unknown>;
      recoverable?: boolean;
      cause?: Error;
    }
  ) {
    super(message, 'TOOL_ERROR', options);
    this.name = 'ToolError';
    this.toolName = toolName;
  }
}

export class ToolNotFoundError extends ToolError {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, toolName, { recoverable: false });
    this.name = 'ToolNotFoundError';
  }
}

export class ToolExecutionError extends ToolError {
  constructor(toolName: string, message: string, cause?: Error) {
    super(message, toolName, { recoverable: true, cause });
    this.name = 'ToolExecutionError';
  }
}

export class ToolTimeoutError extends ToolError {
  public readonly timeoutMs: number;

  constructor(toolName: string, timeoutMs: number) {
    super(
      `Tool ${toolName} timed out after ${timeoutMs}ms`,
      toolName,
      { recoverable: true, details: { timeoutMs } }
    );
    this.name = 'ToolTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

// Task Errors
export class TaskError extends OctogentError {
  public readonly taskId: string;

  constructor(
    message: string,
    taskId: string,
    options?: {
      details?: Record<string, unknown>;
      recoverable?: boolean;
      cause?: Error;
    }
  ) {
    super(message, 'TASK_ERROR', options);
    this.name = 'TaskError';
    this.taskId = taskId;
  }
}

export class TaskCancelledError extends TaskError {
  constructor(taskId: string) {
    super(`Task was cancelled: ${taskId}`, taskId, { recoverable: false });
    this.name = 'TaskCancelledError';
  }
}

export class TaskMaxIterationsError extends TaskError {
  public readonly maxIterations: number;

  constructor(taskId: string, maxIterations: number) {
    super(
      `Task exceeded maximum iterations: ${maxIterations}`,
      taskId,
      { recoverable: false, details: { maxIterations } }
    );
    this.name = 'TaskMaxIterationsError';
    this.maxIterations = maxIterations;
  }
}

// Session Errors
export class SessionError extends OctogentError {
  public readonly sessionId: string;

  constructor(
    message: string,
    sessionId: string,
    options?: {
      details?: Record<string, unknown>;
      recoverable?: boolean;
      cause?: Error;
    }
  ) {
    super(message, 'SESSION_ERROR', options);
    this.name = 'SessionError';
    this.sessionId = sessionId;
  }
}

export class SessionNotFoundError extends SessionError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, sessionId, { recoverable: false });
    this.name = 'SessionNotFoundError';
  }
}

// Worker Errors
export class WorkerError extends OctogentError {
  public readonly workerId: number;

  constructor(
    message: string,
    workerId: number,
    options?: {
      details?: Record<string, unknown>;
      recoverable?: boolean;
      cause?: Error;
    }
  ) {
    super(message, 'WORKER_ERROR', options);
    this.name = 'WorkerError';
    this.workerId = workerId;
  }
}

export class NoAvailableWorkersError extends OctogentError {
  constructor() {
    super('No available workers', 'NO_WORKERS', { recoverable: true });
    this.name = 'NoAvailableWorkersError';
  }
}

// Validation Errors
export class ValidationError extends OctogentError {
  public readonly field?: string;

  constructor(message: string, field?: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', { details, recoverable: false });
    this.name = 'ValidationError';
    this.field = field;
  }
}

// Helper function to wrap unknown errors
export function wrapError(error: unknown, context?: string): OctogentError {
  if (error instanceof OctogentError) {
    return error;
  }

  if (error instanceof Error) {
    return new OctogentError(
      context ? `${context}: ${error.message}` : error.message,
      'UNKNOWN_ERROR',
      { cause: error, recoverable: false }
    );
  }

  return new OctogentError(
    context ? `${context}: ${String(error)}` : String(error),
    'UNKNOWN_ERROR',
    { recoverable: false }
  );
}
