// ============================================================================
// Worker Pool - Manage 8 concurrent worker threads
// ============================================================================

import { Worker } from 'worker_threads';
import path from 'path';
import { EventEmitter } from 'events';
import type { WorkerSlot, WorkerStatus, WorkerMessage, Task } from '../../lib/types';
import { getConfig } from '../config';
import { getQueuedTasks, updateTask } from '../db/sessions';
import { setTaskQueue } from '../tools/spawn-agent';

export interface WorkerPoolEvents {
  'task:started': { taskId: string; slotId: number };
  'task:completed': { taskId: string; slotId: number; result: string };
  'task:failed': { taskId: string; slotId: number; error: string };
  'task:cancelled': { taskId: string; slotId: number };
  'worker:ready': { slotId: number };
  'worker:busy': { slotId: number; taskId: string };
  'worker:error': { slotId: number; error: string };
  'llm:chunk': { taskId: string; chunk: string };
  'tool:call': { taskId: string; name: string; args: Record<string, unknown> };
  'tool:result': { taskId: string; name: string; success: boolean; output: string };
}

export class WorkerPool extends EventEmitter {
  private slots: Map<number, { worker: Worker; slot: WorkerSlot }> = new Map();
  private taskQueue: Array<{ taskId: string; workspaceDir: string }> = [];
  private workspaceDir: string;
  private isShuttingDown = false;
  
  constructor(workspaceDir: string) {
    super();
    this.workspaceDir = workspaceDir;
    
    // Set up task queue for spawn_agent tool
    setTaskQueue((task) => {
      this.queueTask(task.taskId, this.workspaceDir);
    });
  }
  
  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    const config = getConfig();
    const maxSlots = config.workers.max_slots;
    
    console.log(`[pool] Initializing ${maxSlots} worker slots...`);
    
    // Create worker threads
    for (let i = 0; i < maxSlots; i++) {
      await this.createWorker(i);
    }
    
    // Load any queued tasks from database
    await this.loadQueuedTasks();
    
    console.log(`[pool] Worker pool ready with ${this.slots.size} slots`);
  }
  
  /**
   * Create a worker for a specific slot
   */
  private async createWorker(slotId: number): Promise<void> {
    const workerPath = path.join(__dirname, 'worker.ts');
    
    const worker = new Worker(workerPath, {
      workerData: { slotId }
    });
    
    const slot: WorkerSlot = {
      id: slotId,
      status: 'idle',
      iterations: 0
    };
    
    this.slots.set(slotId, { worker, slot });
    
    // Handle messages from worker
    worker.on('message', (message: WorkerMessage) => {
      this.handleWorkerMessage(slotId, message);
    });
    
    // Handle worker errors
    worker.on('error', (error) => {
      console.error(`[pool] Worker ${slotId} error:`, error);
      this.emit('worker:error', { slotId, error: error.message });
      
      // Restart worker
      if (!this.isShuttingDown) {
        this.restartWorker(slotId);
      }
    });
    
    // Handle worker exit
    worker.on('exit', (code) => {
      console.log(`[pool] Worker ${slotId} exited with code ${code}`);
      
      // Restart worker if not shutting down
      if (!this.isShuttingDown && code !== 0) {
        this.restartWorker(slotId);
      }
    });
  }
  
  /**
   * Restart a crashed worker
   */
  private async restartWorker(slotId: number): Promise<void> {
    console.log(`[pool] Restarting worker ${slotId}...`);
    
    const existing = this.slots.get(slotId);
    if (existing) {
      // Mark any running task as failed
      if (existing.slot.task_id) {
        updateTask(existing.slot.task_id, {
          status: 'failed',
          error: 'Worker crashed',
          completed_at: new Date().toISOString()
        });
        
        this.emit('task:failed', {
          taskId: existing.slot.task_id,
          slotId,
          error: 'Worker crashed'
        });
      }
      
      // Terminate old worker
      try {
        await existing.worker.terminate();
      } catch {
        // Ignore termination errors
      }
    }
    
    // Create new worker
    await this.createWorker(slotId);
    
    // Process queue
    this.processQueue();
  }
  
  /**
   * Handle messages from workers
   */
  private handleWorkerMessage(slotId: number, message: WorkerMessage): void {
    const slotData = this.slots.get(slotId);
    if (!slotData) return;
    
    const { slot } = slotData;
    
    switch (message.type) {
      case 'task_update': {
        const payload = message.payload as Record<string, unknown>;
        
        if (payload.status === 'ready') {
          slot.status = 'idle';
          this.emit('worker:ready', { slotId });
          this.processQueue();
        } else if (payload.status === 'running') {
          slot.status = 'busy';
          slot.started_at = new Date().toISOString();
          this.emit('worker:busy', { slotId, taskId: message.taskId! });
        } else if (payload.status === 'cancelled') {
          slot.status = 'idle';
          slot.task_id = undefined;
          this.emit('task:cancelled', { taskId: message.taskId!, slotId });
          this.processQueue();
        }
        
        if (payload.iteration !== undefined) {
          slot.iterations = payload.iteration as number;
          slot.last_activity = new Date().toISOString();
        }
        break;
      }
      
      case 'task_complete': {
        const payload = message.payload as { result: string; iterations: number; toolCalls: number };
        
        slot.status = 'idle';
        slot.task_id = undefined;
        slot.iterations = 0;
        
        this.emit('task:completed', {
          taskId: message.taskId!,
          slotId,
          result: payload.result
        });
        
        this.processQueue();
        break;
      }
      
      case 'task_failed': {
        const payload = message.payload as { error: string };
        
        slot.status = 'idle';
        slot.task_id = undefined;
        slot.iterations = 0;
        
        this.emit('task:failed', {
          taskId: message.taskId!,
          slotId,
          error: payload.error
        });
        
        this.processQueue();
        break;
      }
      
      case 'llm_chunk': {
        const payload = message.payload as { chunk: string };
        this.emit('llm:chunk', {
          taskId: message.taskId!,
          chunk: payload.chunk
        });
        break;
      }
      
      case 'tool_call': {
        const payload = message.payload as { name: string; args: Record<string, unknown> };
        this.emit('tool:call', {
          taskId: message.taskId!,
          name: payload.name,
          args: payload.args
        });
        break;
      }
      
      case 'tool_result': {
        const payload = message.payload as { name: string; success: boolean; output: string };
        this.emit('tool:result', {
          taskId: message.taskId!,
          name: payload.name,
          success: payload.success,
          output: payload.output
        });
        break;
      }
    }
  }
  
  /**
   * Load queued tasks from database
   */
  private async loadQueuedTasks(): Promise<void> {
    const tasks = getQueuedTasks(50);
    
    for (const task of tasks) {
      this.taskQueue.push({
        taskId: task.id,
        workspaceDir: this.workspaceDir
      });
    }
    
    console.log(`[pool] Loaded ${tasks.length} queued tasks`);
    this.processQueue();
  }
  
  /**
   * Queue a task for execution
   */
  queueTask(taskId: string, workspaceDir?: string): void {
    this.taskQueue.push({
      taskId,
      workspaceDir: workspaceDir || this.workspaceDir
    });
    
    this.processQueue();
  }
  
  /**
   * Process the task queue
   */
  private processQueue(): void {
    if (this.isShuttingDown || this.taskQueue.length === 0) {
      return;
    }
    
    // Find an idle slot
    for (const [slotId, slotData] of this.slots) {
      if (slotData.slot.status === 'idle') {
        const task = this.taskQueue.shift();
        if (!task) break;
        
        // Assign task to slot
        slotData.slot.status = 'busy';
        slotData.slot.task_id = task.taskId;
        slotData.slot.started_at = new Date().toISOString();
        
        // Send task to worker
        slotData.worker.postMessage({
          type: 'start_task',
          taskId: task.taskId,
          payload: {
            taskId: task.taskId,
            workspaceDir: task.workspaceDir
          }
        });
        
        this.emit('task:started', { taskId: task.taskId, slotId });
      }
    }
  }
  
  /**
   * Cancel a specific task
   */
  cancelTask(taskId: string): boolean {
    // Check if task is in queue
    const queueIndex = this.taskQueue.findIndex(t => t.taskId === taskId);
    if (queueIndex !== -1) {
      this.taskQueue.splice(queueIndex, 1);
      updateTask(taskId, { status: 'cancelled', completed_at: new Date().toISOString() });
      return true;
    }
    
    // Check if task is running
    for (const [slotId, slotData] of this.slots) {
      if (slotData.slot.task_id === taskId) {
        slotData.worker.postMessage({
          type: 'cancel_task',
          taskId
        });
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get status of all slots
   */
  getStatus(): { slots: WorkerSlot[]; queueLength: number } {
    const slots = Array.from(this.slots.values()).map(s => s.slot);
    return {
      slots,
      queueLength: this.taskQueue.length
    };
  }
  
  /**
   * Get a specific slot
   */
  getSlot(slotId: number): WorkerSlot | undefined {
    return this.slots.get(slotId)?.slot;
  }
  
  /**
   * Shutdown the pool gracefully
   */
  async shutdown(): Promise<void> {
    console.log('[pool] Shutting down worker pool...');
    this.isShuttingDown = true;
    
    // Clear queue
    this.taskQueue = [];
    
    // Send shutdown to all workers
    const shutdownPromises: Promise<void>[] = [];
    
    for (const [slotId, slotData] of this.slots) {
      shutdownPromises.push(
        new Promise<void>((resolve) => {
          slotData.worker.postMessage({ type: 'shutdown' });
          
          // Wait for worker to exit or timeout
          const timeout = setTimeout(() => {
            slotData.worker.terminate();
            resolve();
          }, 5000);
          
          slotData.worker.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        })
      );
    }
    
    await Promise.all(shutdownPromises);
    console.log('[pool] Worker pool shutdown complete');
  }
}

// Singleton instance
let poolInstance: WorkerPool | null = null;

export function getWorkerPool(): WorkerPool | null {
  return poolInstance;
}

export async function createWorkerPool(workspaceDir: string): Promise<WorkerPool> {
  if (poolInstance) {
    return poolInstance;
  }
  
  poolInstance = new WorkerPool(workspaceDir);
  await poolInstance.initialize();
  
  return poolInstance;
}
