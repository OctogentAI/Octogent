// ============================================================================
// Configuration Loader
// ============================================================================

import fs from 'fs';
import path from 'path';
import type { SystemConfig, DeepPartial } from '../lib/types';

const CONFIG_PATH = process.env.CONFIG_PATH || path.join(process.cwd(), 'octogent.config.json');

// Default configuration
const DEFAULT_CONFIG: SystemConfig = {
  models: {
    primary: 'ollama/llama3:8b',
    fallbacks: ['groq/llama-3.1-8b-instant'],
    ollama_host: 'http://localhost:11434',
    temperature: 0.7,
    max_tokens: 4096
  },
  workers: {
    max_slots: 8,
    max_iterations: 50,
    thinking_mode: true,
    context_limit: 8000,
    prune_threshold: 6000
  },
  gateway: {
    port: 18789,
    host: '127.0.0.1',
    cors_origins: ['http://localhost:3000']
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
      'check_task'
    ],
    disabled: [],
    bash_timeout: 30000,
    max_file_size: 1048576,
    searxng_url: 'http://localhost:8080'
  },
  cron: []
};

let cachedConfig: SystemConfig | null = null;

/**
 * Deep merge two objects
 */
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
        (result as Record<string, unknown>)[key] = deepMerge(targetValue, sourceValue as DeepPartial<typeof targetValue>);
      } else {
        (result as Record<string, unknown>)[key] = sourceValue;
      }
    }
  }
  
  return result;
}

/**
 * Load configuration from file
 */
export function loadConfig(): SystemConfig {
  if (cachedConfig) {
    return cachedConfig;
  }
  
  let fileConfig: DeepPartial<SystemConfig> = {};
  
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      fileConfig = JSON.parse(content);
    }
  } catch (error) {
    console.error(`[config] Failed to load config from ${CONFIG_PATH}:`, error);
  }
  
  // Merge with defaults
  cachedConfig = deepMerge(DEFAULT_CONFIG, fileConfig);
  
  // Override with environment variables
  if (process.env.OLLAMA_HOST) {
    cachedConfig.models.ollama_host = process.env.OLLAMA_HOST;
  }
  if (process.env.GROQ_API_KEY) {
    cachedConfig.models.groq_api_key = process.env.GROQ_API_KEY;
  }
  if (process.env.GATEWAY_PORT) {
    cachedConfig.gateway.port = parseInt(process.env.GATEWAY_PORT, 10);
  }
  if (process.env.GATEWAY_HOST) {
    cachedConfig.gateway.host = process.env.GATEWAY_HOST;
  }
  if (process.env.SEARXNG_URL) {
    cachedConfig.tools.searxng_url = process.env.SEARXNG_URL;
  }
  if (process.env.MAX_WORKERS) {
    cachedConfig.workers.max_slots = parseInt(process.env.MAX_WORKERS, 10);
  }
  
  return cachedConfig;
}

/**
 * Save configuration to file
 */
export function saveConfig(config: SystemConfig): void {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    cachedConfig = config;
  } catch (error) {
    console.error(`[config] Failed to save config to ${CONFIG_PATH}:`, error);
    throw error;
  }
}

/**
 * Update specific configuration values
 */
export function updateConfig(updates: DeepPartial<SystemConfig>): SystemConfig {
  const current = loadConfig();
  const updated = deepMerge(current, updates);
  saveConfig(updated);
  return updated;
}

/**
 * Reload configuration from disk
 */
export function reloadConfig(): SystemConfig {
  cachedConfig = null;
  return loadConfig();
}

/**
 * Get current configuration (without reloading)
 */
export function getConfig(): SystemConfig {
  return cachedConfig || loadConfig();
}

/**
 * Validate configuration
 */
export function validateConfig(config: DeepPartial<SystemConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Validate models
  if (config.models) {
    if (config.models.primary && !config.models.primary.includes('/')) {
      errors.push('models.primary must be in format "provider/model"');
    }
    if (config.models.temperature !== undefined) {
      if (config.models.temperature < 0 || config.models.temperature > 2) {
        errors.push('models.temperature must be between 0 and 2');
      }
    }
    if (config.models.max_tokens !== undefined && config.models.max_tokens < 1) {
      errors.push('models.max_tokens must be at least 1');
    }
  }
  
  // Validate workers
  if (config.workers) {
    if (config.workers.max_slots !== undefined) {
      if (config.workers.max_slots < 1 || config.workers.max_slots > 32) {
        errors.push('workers.max_slots must be between 1 and 32');
      }
    }
    if (config.workers.max_iterations !== undefined && config.workers.max_iterations < 1) {
      errors.push('workers.max_iterations must be at least 1');
    }
  }
  
  // Validate gateway
  if (config.gateway) {
    if (config.gateway.port !== undefined) {
      if (config.gateway.port < 1 || config.gateway.port > 65535) {
        errors.push('gateway.port must be between 1 and 65535');
      }
    }
  }
  
  // Validate tools
  if (config.tools) {
    if (config.tools.bash_timeout !== undefined && config.tools.bash_timeout < 1000) {
      errors.push('tools.bash_timeout must be at least 1000ms');
    }
    if (config.tools.max_file_size !== undefined && config.tools.max_file_size < 1024) {
      errors.push('tools.max_file_size must be at least 1024 bytes');
    }
  }
  
  return { valid: errors.length === 0, errors };
}
