// ============================================================================
// Octogent - Structured Logging Utility
// ============================================================================

import pino from 'pino';
import { config } from '../config.js';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  sessionId?: string;
  taskId?: string;
  workerId?: number;
  tool?: string;
  provider?: string;
  [key: string]: unknown;
}

const pinoInstance = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : undefined,
  base: {
    service: 'octogent',
    version: '1.0.0',
  },
});

class Logger {
  private context: LogContext = {};

  constructor(context?: LogContext) {
    if (context) {
      this.context = context;
    }
  }

  child(context: LogContext): Logger {
    return new Logger({ ...this.context, ...context });
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const logData = { ...this.context, ...data };
    pinoInstance[level](logData, message);
  }

  trace(message: string, data?: Record<string, unknown>): void {
    this.log('trace', message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  fatal(message: string, data?: Record<string, unknown>): void {
    this.log('fatal', message, data);
  }

  // Specialized logging methods
  toolCall(toolName: string, args: Record<string, unknown>): void {
    this.info(`Tool call: ${toolName}`, { tool: toolName, args });
  }

  toolResult(toolName: string, success: boolean, duration: number): void {
    this.info(`Tool result: ${toolName}`, { tool: toolName, success, durationMs: duration });
  }

  llmRequest(provider: string, model: string, tokenCount: number): void {
    this.debug(`LLM request: ${provider}/${model}`, { provider, model, tokenCount });
  }

  llmResponse(provider: string, model: string, tokenCount: number, duration: number): void {
    this.debug(`LLM response: ${provider}/${model}`, { 
      provider, 
      model, 
      tokenCount, 
      durationMs: duration 
    });
  }

  taskStart(taskId: string, prompt: string): void {
    this.info(`Task started: ${taskId}`, { taskId, promptLength: prompt.length });
  }

  taskComplete(taskId: string, iterations: number, duration: number): void {
    this.info(`Task completed: ${taskId}`, { taskId, iterations, durationMs: duration });
  }

  taskFailed(taskId: string, error: string): void {
    this.error(`Task failed: ${taskId}`, { taskId, error });
  }

  agentSpawn(parentTaskId: string, childTaskId: string): void {
    this.info(`Agent spawned`, { parentTaskId, childTaskId });
  }
}

// Default logger instance
export const logger = new Logger();

// Create a child logger with context
export function createLogger(context: LogContext): Logger {
  return logger.child(context);
}

// Export for direct pino access if needed
export { pinoInstance as pino };
