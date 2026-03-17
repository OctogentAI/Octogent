// ============================================================================
// Spawn Agent Tool - Create sub-tasks for parallel execution
// ============================================================================

import type { ToolDefinition, ToolContext, ToolResult } from '../../lib/types';
import { createTask, createSession } from '../db/sessions';

// This will be set by the worker pool when available
let taskQueue: ((task: { sessionId: string; taskId: string; prompt: string; parentTaskId: string }) => void) | null = null;

export function setTaskQueue(queue: typeof taskQueue): void {
  taskQueue = queue;
}

export const spawnAgentTool: ToolDefinition = {
  name: 'spawn_agent',
  description: 'Spawn a sub-agent to handle a separate task in parallel. Use this to delegate work that can be done independently while you continue with other tasks. The sub-agent will have its own context and tools.',
  parameters: [
    {
      name: 'task',
      type: 'string',
      description: 'A clear description of what the sub-agent should accomplish',
      required: true
    },
    {
      name: 'context',
      type: 'string',
      description: 'Additional context or information the sub-agent needs (optional)',
      required: false
    },
    {
      name: 'priority',
      type: 'number',
      description: 'Task priority (higher = more important, default: 0)',
      required: false,
      default: 0
    },
    {
      name: 'wait',
      type: 'boolean',
      description: 'If true, wait for the sub-task to complete and return its result. If false, return immediately with the task ID. (default: false)',
      required: false,
      default: false
    }
  ],
  
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const taskDescription = args.task as string;
    const additionalContext = args.context as string | undefined;
    const priority = args.priority as number ?? 0;
    const wait = args.wait as boolean ?? false;
    
    if (!taskDescription.trim()) {
      return {
        success: false,
        output: '',
        error: 'Task description cannot be empty'
      };
    }
    
    // Build the full prompt
    let prompt = taskDescription;
    if (additionalContext) {
      prompt = `${taskDescription}\n\nAdditional Context:\n${additionalContext}`;
    }
    
    try {
      // Create a new session for the sub-task (or reuse parent session)
      const session = createSession({
        title: `Sub-task: ${taskDescription.substring(0, 50)}...`,
        metadata: {
          parentTaskId: context.taskId,
          parentSessionId: context.sessionId
        }
      });
      
      // Create the task
      const task = createTask({
        sessionId: session.id,
        prompt,
        parentTaskId: context.taskId,
        priority,
        metadata: {
          spawnedBy: context.taskId,
          spawnedAt: new Date().toISOString()
        }
      });
      
      // Queue the task for execution
      if (taskQueue) {
        taskQueue({
          sessionId: session.id,
          taskId: task.id,
          prompt,
          parentTaskId: context.taskId
        });
      }
      
      if (wait) {
        // Wait for task completion
        // This would require polling or a callback mechanism
        // For now, we just return the task ID with a note
        return {
          success: true,
          output: `Sub-task spawned and queued (ID: ${task.id}). Use check_task tool to monitor progress.\n\nNote: Synchronous waiting is not yet implemented. Use check_task to poll for results.`,
          metadata: {
            taskId: task.id,
            sessionId: session.id,
            status: 'queued',
            waitRequested: true
          }
        };
      }
      
      return {
        success: true,
        output: `Sub-task spawned successfully!\n\nTask ID: ${task.id}\nSession ID: ${session.id}\nStatus: queued\n\nUse check_task with task_id="${task.id}" to monitor progress.`,
        metadata: {
          taskId: task.id,
          sessionId: session.id,
          status: 'queued'
        }
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to spawn sub-agent: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};
