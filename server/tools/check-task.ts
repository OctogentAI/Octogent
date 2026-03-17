// ============================================================================
// Check Task Tool - Monitor status of spawned tasks
// ============================================================================

import type { ToolDefinition, ToolContext, ToolResult } from '../../lib/types';
import { getTask, getMessagesForSession } from '../db/sessions';

export const checkTaskTool: ToolDefinition = {
  name: 'check_task',
  description: 'Check the status of a spawned sub-task. Use this to monitor progress and retrieve results of tasks created with spawn_agent.',
  parameters: [
    {
      name: 'task_id',
      type: 'string',
      description: 'The ID of the task to check',
      required: true
    },
    {
      name: 'include_messages',
      type: 'boolean',
      description: 'If true, include the task\'s message history (default: false)',
      required: false,
      default: false
    }
  ],
  
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const taskId = args.task_id as string;
    const includeMessages = args.include_messages as boolean ?? false;
    
    if (!taskId.trim()) {
      return {
        success: false,
        output: '',
        error: 'Task ID cannot be empty'
      };
    }
    
    try {
      const task = getTask(taskId);
      
      if (!task) {
        return {
          success: false,
          output: '',
          error: `Task not found: ${taskId}`
        };
      }
      
      // Build status output
      let output = `## Task Status: ${task.status.toUpperCase()}\n\n`;
      output += `**Task ID:** ${task.id}\n`;
      output += `**Session ID:** ${task.session_id}\n`;
      output += `**Created:** ${task.created_at}\n`;
      
      if (task.started_at) {
        output += `**Started:** ${task.started_at}\n`;
      }
      
      if (task.completed_at) {
        output += `**Completed:** ${task.completed_at}\n`;
      }
      
      output += `**Iterations:** ${task.iterations}\n`;
      output += `**Priority:** ${task.priority}\n`;
      
      if (task.worker_slot !== undefined && task.worker_slot !== null) {
        output += `**Worker Slot:** ${task.worker_slot}\n`;
      }
      
      output += `\n**Original Prompt:**\n${task.prompt}\n`;
      
      // Include result if completed
      if (task.status === 'completed' && task.result) {
        output += `\n**Result:**\n${task.result}\n`;
      }
      
      // Include error if failed
      if (task.status === 'failed' && task.error) {
        output += `\n**Error:**\n${task.error}\n`;
      }
      
      // Include messages if requested
      if (includeMessages) {
        const messages = getMessagesForSession(task.session_id);
        
        if (messages.length > 0) {
          output += `\n---\n\n## Message History (${messages.length} messages)\n\n`;
          
          for (const msg of messages) {
            const role = msg.role.toUpperCase();
            const content = msg.content.substring(0, 500) + (msg.content.length > 500 ? '...' : '');
            output += `### [${role}] ${msg.created_at}\n${content}\n\n`;
          }
        }
      }
      
      return {
        success: true,
        output,
        metadata: {
          taskId: task.id,
          sessionId: task.session_id,
          status: task.status,
          iterations: task.iterations,
          hasResult: !!task.result,
          hasError: !!task.error
        }
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to check task: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};
