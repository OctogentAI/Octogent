// ============================================================================
// Agent Orchestrator — coordinates up to 8 parallel worker agents
// ============================================================================

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { Task, TaskStatus, Session } from '../types.js';
import { createWorkerPool, getWorkerPool } from '../workers/pool.js';
import { createSession, createTask, getTask, getSession } from '../db/sessions.js';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config.js';

export interface SubTaskSpec {
  prompt: string;
  priority?: number;
  agentConfig?: string;
  dependsOn?: string[];   // Task IDs that must complete first
}

export interface OrchestratorResult {
  sessionId: string;
  tasks: Array<{ id: string; status: TaskStatus; result?: string; error?: string }>;
  succeeded: number;
  failed: number;
  totalDurationMs: number;
}

/**
 * High-level orchestrator for running multi-task parallel workloads.
 * Supports a DAG of tasks (via dependsOn) and runs up to 8 concurrently.
 */
export class AgentOrchestrator extends EventEmitter {
  private workspaceDir: string;

  constructor(workspaceDir: string) {
    super();
    this.workspaceDir = workspaceDir;
  }

  /**
   * Run a single task and wait for it to complete.
   */
  async runTask(prompt: string, opts: { title?: string; agentConfig?: string } = {}): Promise<{
    taskId: string;
    sessionId: string;
    success: boolean;
    result?: string;
    error?: string;
  }> {
    const pool = await this.getPool();
    const session = createSession({ title: opts.title || prompt.slice(0, 80) });
    const task = createTask({
      sessionId: session.id,
      prompt,
      priority: 5,
    });

    pool.queueTask(task.id, this.workspaceDir);

    return new Promise((resolve) => {
      const onComplete = ({ taskId, result }: { taskId: string; result: string }) => {
        if (taskId !== task.id) return;
        cleanup();
        resolve({ taskId, sessionId: session.id, success: true, result });
      };

      const onFailed = ({ taskId, error }: { taskId: string; error: string }) => {
        if (taskId !== task.id) return;
        cleanup();
        resolve({ taskId, sessionId: session.id, success: false, error });
      };

      const cleanup = () => {
        pool.removeListener('task:completed', onComplete);
        pool.removeListener('task:failed', onFailed);
      };

      pool.on('task:completed', onComplete);
      pool.on('task:failed', onFailed);
    });
  }

  /**
   * Run multiple tasks in parallel (up to max_slots concurrent),
   * respecting dependsOn relationships.
   */
  async runParallel(subtasks: SubTaskSpec[]): Promise<OrchestratorResult> {
    const config = getConfig();
    const maxConcurrent = config.workers.max_slots;
    const pool = await this.getPool();
    const startTime = Date.now();

    // Create a session to group all sub-tasks
    const session = createSession({ title: `Parallel run (${subtasks.length} tasks)` });

    // Create all task records
    const taskRecords = subtasks.map((spec) =>
      createTask({
        sessionId: session.id,
        prompt: spec.prompt,
        priority: spec.priority ?? 5,
      })
    );

    // Build dependency map: taskIndex -> array of task ids it depends on
    const depMap = new Map<string, string[]>();
    subtasks.forEach((spec, i) => {
      if (spec.dependsOn && spec.dependsOn.length > 0) {
        depMap.set(taskRecords[i].id, spec.dependsOn);
      }
    });

    const completed = new Map<string, { success: boolean; result?: string; error?: string }>();
    const running = new Set<string>();
    const pending = new Set(taskRecords.map((t) => t.id));

    return new Promise((resolve) => {
      const schedule = () => {
        for (const taskId of pending) {
          if (running.size >= maxConcurrent) break;

          const deps = depMap.get(taskId) ?? [];
          const depsmet = deps.every((d) => completed.has(d) && completed.get(d)!.success);
          if (!depsmet) continue;

          pending.delete(taskId);
          running.add(taskId);
          pool.queueTask(taskId, this.workspaceDir);
        }

        // Check if we're done
        if (pending.size === 0 && running.size === 0) {
          pool.removeListener('task:completed', onComplete);
          pool.removeListener('task:failed', onFailed);

          resolve({
            sessionId: session.id,
            tasks: taskRecords.map((t) => ({
              id: t.id,
              status: (completed.get(t.id)?.success ? 'completed' : 'failed') as TaskStatus,
              result: completed.get(t.id)?.result,
              error: completed.get(t.id)?.error,
            })),
            succeeded: Array.from(completed.values()).filter((c) => c.success).length,
            failed: Array.from(completed.values()).filter((c) => !c.success).length,
            totalDurationMs: Date.now() - startTime,
          });
        }
      };

      const onComplete = ({ taskId, result }: { taskId: string; result: string }) => {
        if (!running.has(taskId)) return;
        running.delete(taskId);
        completed.set(taskId, { success: true, result });
        logger.info('orchestrator', `Task ${taskId} completed`);
        schedule();
      };

      const onFailed = ({ taskId, error }: { taskId: string; error: string }) => {
        if (!running.has(taskId)) return;
        running.delete(taskId);
        completed.set(taskId, { success: false, error });
        logger.warn('orchestrator', `Task ${taskId} failed: ${error}`);
        // Cancel dependent tasks
        for (const [id, deps] of depMap.entries()) {
          if (deps.includes(taskId) && pending.has(id)) {
            pending.delete(id);
            completed.set(id, { success: false, error: `Dependency ${taskId} failed` });
          }
        }
        schedule();
      };

      pool.on('task:completed', onComplete);
      pool.on('task:failed', onFailed);

      // Start initial scheduling
      schedule();
    });
  }

  /**
   * Cancel a running task by id.
   */
  cancelTask(taskId: string): boolean {
    const pool = getWorkerPool();
    if (!pool) return false;
    return pool.cancelTask(taskId);
  }

  /**
   * Get the status of all running workers.
   */
  getStatus() {
    const pool = getWorkerPool();
    if (!pool) return { slots: [], queueLength: 0 };
    return pool.getStatus();
  }

  private async getPool() {
    const existing = getWorkerPool();
    if (existing) return existing;
    return createWorkerPool(this.workspaceDir);
  }
}

// Singleton
let orchestratorInstance: AgentOrchestrator | null = null;

export function getOrchestrator(workspaceDir?: string): AgentOrchestrator {
  if (!orchestratorInstance) {
    if (!workspaceDir) throw new Error('workspaceDir required to create orchestrator');
    orchestratorInstance = new AgentOrchestrator(workspaceDir);
  }
  return orchestratorInstance;
}
