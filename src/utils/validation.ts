// ============================================================================
// Octogent - Input Validation Utilities
// ============================================================================

import { z } from 'zod';
import { ValidationError } from './errors.js';

// Common schemas
export const sessionIdSchema = z.string().uuid();
export const taskIdSchema = z.string().uuid();
export const toolNameSchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/);

// Task creation schema
export const createTaskSchema = z.object({
  prompt: z.string().min(1).max(100000),
  priority: z.number().int().min(0).max(100).optional().default(50),
  agent_config: z.string().optional(),
  metadata: z.record(z.unknown()).optional().default({}),
});

// Configuration schemas
export const modelsConfigSchema = z.object({
  primary: z.string().regex(/^[a-z]+\/[a-z0-9.:_-]+$/i),
  fallbacks: z.array(z.string()).default([]),
  ollama_host: z.string().url().default('http://localhost:11434'),
  groq_api_key: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().int().min(1).max(128000).default(4096),
});

export const workersConfigSchema = z.object({
  max_slots: z.number().int().min(1).max(32).default(4),
  max_iterations: z.number().int().min(1).max(1000).default(100),
  thinking_mode: z.boolean().default(false),
  context_limit: z.number().int().min(1000).max(200000).default(32000),
  prune_threshold: z.number().min(0).max(1).default(0.8),
});

export const gatewayConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(8080),
  host: z.string().default('127.0.0.1'),
  cors_origins: z.array(z.string()).default(['*']),
});

export const toolsConfigSchema = z.object({
  enabled: z.array(z.string()).default(['*']),
  disabled: z.array(z.string()).default([]),
  bash_timeout: z.number().int().min(1000).max(600000).default(30000),
  max_file_size: z.number().int().min(1024).max(104857600).default(10485760),
  searxng_url: z.string().url().optional(),
});

export const cronJobSchema = z.object({
  id: z.string().min(1),
  schedule: z.string().regex(/^(\S+\s+){4}\S+$/), // Basic cron validation
  prompt: z.string().min(1),
  enabled: z.boolean().default(true),
});

export const systemConfigSchema = z.object({
  models: modelsConfigSchema,
  workers: workersConfigSchema,
  gateway: gatewayConfigSchema,
  tools: toolsConfigSchema,
  cron: z.array(cronJobSchema).default([]),
});

// Agent config schema
export const agentConfigSchema = z.object({
  name: z.string().min(1).max(64),
  persona: z.string().max(10000).default(''),
  skills: z.array(z.string()).default([]),
  tools: z.array(z.string()).default(['*']),
  system_prompt_additions: z.string().max(50000).optional(),
});

// Tool parameter schemas
export const bashToolSchema = z.object({
  command: z.string().min(1).max(10000),
  timeout: z.number().int().min(100).max(600000).optional(),
  cwd: z.string().max(1000).optional(),
});

export const readFileToolSchema = z.object({
  path: z.string().min(1).max(4096),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100000).optional(),
});

export const writeFileToolSchema = z.object({
  path: z.string().min(1).max(4096),
  content: z.string().max(10485760),
  create_dirs: z.boolean().optional().default(true),
});

export const listDirToolSchema = z.object({
  path: z.string().min(1).max(4096),
  recursive: z.boolean().optional().default(false),
  max_depth: z.number().int().min(1).max(10).optional().default(3),
  pattern: z.string().max(256).optional(),
});

export const webSearchToolSchema = z.object({
  query: z.string().min(1).max(1000),
  num_results: z.number().int().min(1).max(20).optional().default(5),
});

export const webFetchToolSchema = z.object({
  url: z.string().url().max(2048),
  extract_content: z.boolean().optional().default(true),
  timeout: z.number().int().min(1000).max(60000).optional().default(15000),
});

export const memoryToolSchema = z.object({
  action: z.enum(['get', 'set', 'delete', 'list']),
  key: z.string().min(1).max(256).optional(),
  value: z.string().max(1048576).optional(),
  scope: z.enum(['session', 'global']).optional().default('session'),
});

export const spawnAgentToolSchema = z.object({
  prompt: z.string().min(1).max(50000),
  agent_config: z.string().optional(),
  wait: z.boolean().optional().default(true),
});

// Validation helper
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  fieldName?: string
): T {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    
    throw new ValidationError(
      `Validation failed${fieldName ? ` for ${fieldName}` : ''}: ${errors[0].message}`,
      errors[0].path || fieldName,
      { errors }
    );
  }
  
  return result.data;
}

// Async validation with custom rules
export async function validateAsync<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  customValidators?: Array<{
    name: string;
    validate: (data: T) => Promise<boolean>;
    message: string;
  }>
): Promise<T> {
  const result = validate(schema, data);
  
  if (customValidators) {
    for (const validator of customValidators) {
      const isValid = await validator.validate(result);
      if (!isValid) {
        throw new ValidationError(validator.message, validator.name);
      }
    }
  }
  
  return result;
}

// Sanitization helpers
export function sanitizePath(path: string): string {
  // Remove null bytes and normalize path separators
  return path
    .replace(/\0/g, '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '/')
    .replace(/\/+$/, '');
}

export function sanitizeCommand(command: string): string {
  // Remove null bytes - further sanitization should be done by the tool
  return command.replace(/\0/g, '');
}

export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
