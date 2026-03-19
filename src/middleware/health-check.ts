// ============================================================================
// Health Check — system + provider liveness checks
// ============================================================================

import os from 'os';
import { getWorkerPool } from '../workers/pool.js';
import { getConfig } from '../config.js';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface SystemHealth {
  status: HealthStatus;
  timestamp: string;
  version: string;
  uptimeSeconds: number;
  components: ComponentHealth[];
  system: {
    platform: string;
    arch: string;
    nodeVersion: string;
    cpuCount: number;
    memoryUsedMB: number;
    memoryTotalMB: number;
    loadAverage: number[];
  };
}

const startTime = Date.now();

/**
 * Check health of a single HTTP endpoint.
 */
async function checkEndpoint(
  name: string,
  url: string,
  timeoutMs = 3000
): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Date.now() - start;

    if (response.ok) {
      return { name, status: 'healthy', latencyMs };
    }
    return {
      name,
      status: 'degraded',
      latencyMs,
      message: `HTTP ${response.status}`,
    };
  } catch (err: unknown) {
    const e = err as Error;
    return {
      name,
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: e.message,
    };
  }
}

/**
 * Check worker pool health.
 */
function checkWorkerPool(): ComponentHealth {
  const pool = getWorkerPool();

  if (!pool) {
    return {
      name: 'worker_pool',
      status: 'unhealthy',
      message: 'Worker pool not initialized',
    };
  }

  const { slots, queueLength } = pool.getStatus();
  const busySlots = slots.filter((s) => s.status === 'busy').length;
  const errorSlots = slots.filter((s) => s.status === 'error').length;

  if (errorSlots > 0) {
    return {
      name: 'worker_pool',
      status: 'degraded',
      message: `${errorSlots} worker(s) in error state`,
      metadata: { slots: slots.length, busy: busySlots, errors: errorSlots, queued: queueLength },
    };
  }

  return {
    name: 'worker_pool',
    status: 'healthy',
    metadata: { slots: slots.length, busy: busySlots, queued: queueLength },
  };
}

/**
 * Run a full health check and return a structured report.
 */
export async function runHealthCheck(): Promise<SystemHealth> {
  const config = getConfig();
  const components: ComponentHealth[] = [];

  // Check Ollama if configured
  if (config.models.ollama_host) {
    const ollamaCheck = await checkEndpoint(
      'ollama',
      `${config.models.ollama_host}/api/tags`
    );
    components.push(ollamaCheck);
  }

  // Check worker pool
  components.push(checkWorkerPool());

  // Check SearXNG if configured
  if (config.tools.searxng_url) {
    const searxCheck = await checkEndpoint('searxng', config.tools.searxng_url);
    components.push(searxCheck);
  }

  // Determine overall status
  const hasUnhealthy = components.some((c) => c.status === 'unhealthy');
  const hasDegraded = components.some((c) => c.status === 'degraded');

  const overallStatus: HealthStatus = hasUnhealthy
    ? 'unhealthy'
    : hasDegraded
    ? 'degraded'
    : 'healthy';

  const memUsed = process.memoryUsage();
  const totalMemMB = Math.round(os.totalmem() / 1024 / 1024);
  const usedMemMB = Math.round(memUsed.heapUsed / 1024 / 1024);

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '1.0.0',
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    components,
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpuCount: os.cpus().length,
      memoryUsedMB: usedMemMB,
      memoryTotalMB: totalMemMB,
      loadAverage: os.loadavg(),
    },
  };
}

/**
 * Format a health check report as a human-readable string.
 */
export function formatHealthReport(health: SystemHealth): string {
  const statusIcon = { healthy: 'OK', degraded: 'DEGRADED', unhealthy: 'DOWN' };
  const lines = [
    `Octogent Health Check — ${health.timestamp}`,
    `Overall: ${statusIcon[health.status]}`,
    `Uptime: ${health.uptimeSeconds}s | Node: ${health.system.nodeVersion} | Memory: ${health.system.memoryUsedMB}/${health.system.memoryTotalMB} MB`,
    '',
    'Components:',
    ...health.components.map(
      (c) =>
        `  [${statusIcon[c.status].padEnd(8)}] ${c.name}${c.latencyMs !== undefined ? ` (${c.latencyMs}ms)` : ''}${c.message ? ` — ${c.message}` : ''}`
    ),
  ];
  return lines.join('\n');
}
