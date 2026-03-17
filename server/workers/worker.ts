// ============================================================================
// Worker Thread - Individual agent execution worker
// ============================================================================

import { parentPort, workerData } from 'worker_threads';
import path from 'path';
import type { Task, WorkerMessage } from '../../lib/types';
import { initializeSchema } from '../db/schema';
import { getTask, updateTask } from '../db/sessions';
import { runAgentLoop } from '../agent/loop';

// Initialize database in worker thread
initializeSchema();

// Worker state
interface WorkerState {
  slotId: number;
  currentTask: Task | null;
  abortController: AbortController | null;
}

const state: WorkerState = {
  slotId: workerData?.slotId ?? 0,
  currentTask: null,
  abortController: null
};

// Send message to parent
function sendToParent(message: WorkerMessage): void {
  parentPort?.postMessage(message);
}

// Handle messages from parent
parentPort?.on('message', async (message: WorkerMessage) => {
  switch (message.type) {
    case 'start_task':
      await handleStartTask(message.payload as { taskId: string; workspaceDir: string });
      break;
      
    case 'cancel_task':
      handleCancelTask(message.taskId);
      break;
      
    case 'shutdown':
      handleShutdown();
      break;
  }
});

/**
 * Handle starting a new task
 */
async function handleStartTask(payload: { taskId: string; workspaceDir: string }): Promise<void> {
  const { taskId, workspaceDir } = payload;
  
  // Get task from database
  const task = getTask(taskId);
  
  if (!task) {
    sendToParent({
      type: 'task_failed',
      taskId,
      payload: { error: 'Task not found' }
    });
    return;
  }
  
  // Update state
  state.currentTask = task;
  state.abortController = new AbortController();
  
  // Notify parent that task started
  sendToParent({
    type: 'task_update',
    taskId,
    payload: { status: 'running', slotId: state.slotId }
  });
  
  try {
    // Run the agent loop
    const result = await runAgentLoop({
      task,
      workspaceDir,
      abortSignal: state.abortController.signal,
      
      onChunk: (chunk) => {
        sendToParent({
          type: 'llm_chunk',
          taskId,
          payload: { chunk }
        });
      },
      
      onToolCall: (toolCall) => {
        sendToParent({
          type: 'tool_call',
          taskId,
          payload: toolCall
        });
      },
      
      onToolResult: (result) => {
        sendToParent({
          type: 'tool_result',
          taskId,
          payload: result
        });
      },
      
      onIteration: (iteration, content) => {
        sendToParent({
          type: 'task_update',
          taskId,
          payload: { iteration, contentLength: content.length }
        });
      }
    });
    
    // Send completion result
    if (result.success) {
      sendToParent({
        type: 'task_complete',
        taskId,
        payload: {
          result: result.result,
          iterations: result.iterations,
          toolCalls: result.toolCalls
        }
      });
    } else {
      sendToParent({
        type: 'task_failed',
        taskId,
        payload: {
          error: result.error,
          iterations: result.iterations,
          toolCalls: result.toolCalls
        }
      });
    }
  } catch (error) {
    // Handle unexpected errors
    sendToParent({
      type: 'task_failed',
      taskId,
      payload: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
  } finally {
    // Clear state
    state.currentTask = null;
    state.abortController = null;
  }
}

/**
 * Handle cancelling the current task
 */
function handleCancelTask(taskId?: string): void {
  if (state.currentTask && (!taskId || state.currentTask.id === taskId)) {
    state.abortController?.abort();
    
    // Update task status
    updateTask(state.currentTask.id, {
      status: 'cancelled',
      completed_at: new Date().toISOString()
    });
    
    sendToParent({
      type: 'task_update',
      taskId: state.currentTask.id,
      payload: { status: 'cancelled' }
    });
  }
}

/**
 * Handle shutdown request
 */
function handleShutdown(): void {
  // Cancel current task if any
  if (state.currentTask) {
    handleCancelTask(state.currentTask.id);
  }
  
  // Exit gracefully
  process.exit(0);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(`[worker ${state.slotId}] Uncaught exception:`, error);
  
  if (state.currentTask) {
    sendToParent({
      type: 'task_failed',
      taskId: state.currentTask.id,
      payload: { error: `Worker crashed: ${error.message}` }
    });
  }
  
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[worker ${state.slotId}] Unhandled rejection:`, reason);
});

// Signal ready
sendToParent({
  type: 'task_update',
  payload: { status: 'ready', slotId: state.slotId }
});

console.log(`[worker ${state.slotId}] Ready`);
