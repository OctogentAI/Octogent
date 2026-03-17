// ============================================================================
// Configuration Loader
// ============================================================================

import fs from 'fs';
import path from 'path';
import os from 'os';

// ============================================================================
// Types
// ============================================================================

export interface LLMConfig {
  provider: 'ollama' | 'groq' | 'openai' | 'anthropic';
  model: string;
  baseUrl?: string;
  apiKey?: string;
  temperature: number;
  maxTokens: number;
}

export interface WorkersConfig {
  max: number;
  idleTimeout: number;
  taskTimeout: number;
  maxIterations: number;
  contextLimit: number;
}

export interface ToolsConfig {
  enabled: string[];
  disabled: string[];
  bashTimeout: number;
  maxFileSize: number;
  searchUrl?: string;
}

export interface SkillsConfig {
  directory: string;
  autoload: boolean;
}

export interface MemoryConfig {
  backend: 'file' | 'sqlite' | 'redis';
  directory: string;
  maxEntries: number;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  file?: string;
  console: boolean;
  timestamps: boolean;
}

export interface SecurityConfig {
  sandboxEnabled: boolean;
  allowedPaths: string[];
  blockedPaths: string[];
  maxFileSize: number;
}

export interface APIConfig {
  enabled: boolean;
  port: number;
  host: string;
  corsOrigins: string[];
  authEnabled: boolean;
  apiKey?: string;
}

export interface CronJob {
  name: string;
  schedule: string;
  task: string;
  enabled: boolean;
}

export interface OctogentConfig {
  llm: LLMConfig;
  workers: WorkersConfig;
  tools: ToolsConfig;
  skills: SkillsConfig;
  memory: MemoryConfig;
  logging: LoggingConfig;
  security: SecurityConfig;
  api: APIConfig;
  workspace: string;
  cron: CronJob[];
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ============================================================================
// Default Configuration
// ============================================================================

const OCTOGENT_HOME = process.env.OCTOGENT_HOME || path.join(os.homedir(), '.octogent');
const CONFIG_PATHS = [
  process.env.OCTOGENT_CONFIG,
  path.join(process.cwd(), 'octogent.config.json'),
  path.join(OCTOGENT_HOME, 'config.json'),
].filter(Boolean) as string[];

const DEFAULT_CONFIG: OctogentConfig = {
  llm: {
    provider: 'ollama',
    model: 'llama3.2:8b',
    baseUrl: 'http://localhost:11434',
    temperature: 0.7,
    maxTokens: 4096,
  },
  workers: {
    max: 8,
    idleTimeout: 300000,
    taskTimeout: 600000,
    maxIterations: 50,
    contextLimit: 8000,
  },
  tools: {
    enabled: [
      'bash',
      'read_file',
      'write_file',
      'list_dir',
      'web_search',
      'web_fetch',
      'memory_save',
      'memory_read',
      'spawn_agent',
      'check_task',
    ],
    disabled: [],
    bashTimeout: 30000,
    maxFileSize: 10485760,
  },
  skills: {
    directory: path.join(OCTOGENT_HOME, 'skills'),
    autoload: true,
  },
  memory: {
    backend: 'file',
    directory: path.join(OCTOGENT_HOME, 'memory'),
    maxEntries: 1000,
  },
  logging: {
    level: 'info',
    file: path.join(OCTOGENT_HOME, 'octogent.log'),
    console: true,
    timestamps: true,
  },
  security: {
    sandboxEnabled: true,
    allowedPaths: ['.'],
    blockedPaths: ['/etc', '/var', '/usr', '/bin', '/sbin', '/root'],
    maxFileSize: 104857600,
  },
  api: {
    enabled: true,
    port: 8888,
    host: '127.0.0.1',
    corsOrigins: ['http://localhost:3000'],
    authEnabled: false,
  },
  workspace: process.cwd(),
  cron: [],
};

// ============================================================================
// Configuration State
// ============================================================================

let cachedConfig: OctogentConfig | null = null;
let configPath: string | null = null;

// ============================================================================
// Helper Functions
// ============================================================================

function deepMerge<T>(target: T, source: DeepPartial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = (target as Record<string, unknown>)[key];

    if (sourceValue !== undefined) {
      if (
        typeof sourceValue === 'object' &&
        sourceValue !== null &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === 'object' &&
        targetValue !== null &&
        !Array.isArray(targetValue)
      ) {
        (result as Record<string, unknown>)[key] = deepMerge(
          targetValue,
          sourceValue as DeepPartial<typeof targetValue>
        );
      } else {
        (result as Record<string, unknown>)[key] = sourceValue;
      }
    }
  }

  return result;
}

function findConfigFile(): string | null {
  for (const configPath of CONFIG_PATHS) {
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

function applyEnvironmentOverrides(config: OctogentConfig): void {
  // LLM settings
  if (process.env.OCTOGENT_MODEL) {
    config.llm.model = process.env.OCTOGENT_MODEL;
  }
  if (process.env.OLLAMA_HOST) {
    config.llm.baseUrl = process.env.OLLAMA_HOST;
  }
  if (process.env.GROQ_API_KEY) {
    config.llm.provider = 'groq';
    config.llm.apiKey = process.env.GROQ_API_KEY;
  }
  if (process.env.OPENAI_API_KEY) {
    config.llm.provider = 'openai';
    config.llm.apiKey = process.env.OPENAI_API_KEY;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    config.llm.provider = 'anthropic';
    config.llm.apiKey = process.env.ANTHROPIC_API_KEY;
  }

  // Worker settings
  if (process.env.OCTOGENT_THREADS) {
    config.workers.max = parseInt(process.env.OCTOGENT_THREADS, 10);
  }

  // API settings
  if (process.env.OCTOGENT_PORT) {
    config.api.port = parseInt(process.env.OCTOGENT_PORT, 10);
  }
  if (process.env.OCTOGENT_HOST) {
    config.api.host = process.env.OCTOGENT_HOST;
  }
  if (process.env.OCTOGENT_API_KEY) {
    config.api.authEnabled = true;
    config.api.apiKey = process.env.OCTOGENT_API_KEY;
  }

  // Workspace
  if (process.env.OCTOGENT_WORKSPACE) {
    config.workspace = process.env.OCTOGENT_WORKSPACE;
  }

  // Logging
  if (process.env.OCTOGENT_LOG_LEVEL) {
    config.logging.level = process.env.OCTOGENT_LOG_LEVEL as LoggingConfig['level'];
  }
  if (process.env.DEBUG === 'true') {
    config.logging.level = 'debug';
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Load configuration from file and environment
 */
export async function loadConfigFile(): Promise<OctogentConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  let fileConfig: DeepPartial<OctogentConfig> = {};

  configPath = findConfigFile();
  if (configPath) {
    try {
      const content = await fs.promises.readFile(configPath, 'utf-8');
      fileConfig = JSON.parse(content);
      console.log(`[config] Loaded configuration from ${configPath}`);
    } catch (error) {
      console.error(`[config] Failed to load config from ${configPath}:`, error);
    }
  }

  // Merge with defaults
  cachedConfig = deepMerge(DEFAULT_CONFIG, fileConfig);

  // Apply environment overrides
  applyEnvironmentOverrides(cachedConfig);

  // Ensure directories exist
  ensureDirectories(cachedConfig);

  return cachedConfig;
}

/**
 * Synchronous config loading (for backwards compatibility)
 */
export function loadConfig(): OctogentConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  let fileConfig: DeepPartial<OctogentConfig> = {};

  configPath = findConfigFile();
  if (configPath) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      fileConfig = JSON.parse(content);
    } catch (error) {
      console.error(`[config] Failed to load config:`, error);
    }
  }

  cachedConfig = deepMerge(DEFAULT_CONFIG, fileConfig);
  applyEnvironmentOverrides(cachedConfig);

  return cachedConfig;
}

/**
 * Get current configuration
 */
export function getConfig(): OctogentConfig {
  return cachedConfig || loadConfig();
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: OctogentConfig): Promise<void> {
  const savePath = configPath || path.join(process.cwd(), 'octogent.config.json');

  try {
    await fs.promises.writeFile(savePath, JSON.stringify(config, null, 2));
    cachedConfig = config;
    configPath = savePath;
    console.log(`[config] Configuration saved to ${savePath}`);
  } catch (error) {
    console.error(`[config] Failed to save config:`, error);
    throw error;
  }
}

/**
 * Update configuration
 */
export async function updateConfig(
  updates: DeepPartial<OctogentConfig>
): Promise<OctogentConfig> {
  const current = getConfig();
  const updated = deepMerge(current, updates);
  await saveConfig(updated);
  return updated;
}

/**
 * Reload configuration from disk
 */
export function reloadConfig(): OctogentConfig {
  cachedConfig = null;
  configPath = null;
  return loadConfig();
}

/**
 * Ensure required directories exist
 */
function ensureDirectories(config: OctogentConfig): void {
  const dirs = [
    OCTOGENT_HOME,
    config.skills.directory,
    config.memory.directory,
    path.dirname(config.logging.file || ''),
  ].filter(Boolean);

  for (const dir of dirs) {
    if (dir && !fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        // Ignore errors
      }
    }
  }
}

/**
 * Validate configuration
 */
export function validateConfig(
  config: DeepPartial<OctogentConfig>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.llm) {
    if (
      config.llm.provider &&
      !['ollama', 'groq', 'openai', 'anthropic'].includes(config.llm.provider)
    ) {
      errors.push('llm.provider must be one of: ollama, groq, openai, anthropic');
    }
    if (config.llm.temperature !== undefined) {
      if (config.llm.temperature < 0 || config.llm.temperature > 2) {
        errors.push('llm.temperature must be between 0 and 2');
      }
    }
    if (config.llm.maxTokens !== undefined && config.llm.maxTokens < 1) {
      errors.push('llm.maxTokens must be at least 1');
    }
  }

  if (config.workers) {
    if (config.workers.max !== undefined) {
      if (config.workers.max < 1 || config.workers.max > 32) {
        errors.push('workers.max must be between 1 and 32');
      }
    }
  }

  if (config.api) {
    if (config.api.port !== undefined) {
      if (config.api.port < 1 || config.api.port > 65535) {
        errors.push('api.port must be between 1 and 65535');
      }
    }
  }

  if (config.logging) {
    if (
      config.logging.level &&
      !['debug', 'info', 'warn', 'error'].includes(config.logging.level)
    ) {
      errors.push('logging.level must be one of: debug, info, warn, error');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get config file path
 */
export function getConfigPath(): string | null {
  return configPath;
}

/**
 * Get Octogent home directory
 */
export function getOctogentHome(): string {
  return OCTOGENT_HOME;
}
