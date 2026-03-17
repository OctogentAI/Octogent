// ============================================================================
// Agent Loop - Main autonomous execution loop
// ============================================================================

import type { LLMMessage, Task, ToolCall, ToolContext } from '../../lib/types';
import { getConfig } from '../config';
import { streamChat } from '../llm/router';
import { executeTool } from '../tools/registry';
import { createMessage, updateTask, updateToolCall, createToolCall } from '../db/sessions';
import { buildSystemPrompt, pruneHistory, estimateTokens } from './prompt-builder';
import { parseToolCalls, parseCompletion, parseThinking, formatToolResult, extractTextContent } from './parser';

export interface AgentLoopOptions {
  task: Task;
  workspaceDir: string;
  agentConfigPath?: string;
  onChunk?: (chunk: string) => void;
  onToolCall?: (toolCall: { name: string; args: Record<string, unknown>; status: string }) => void;
  onToolResult?: (result: { name: string; success: boolean; output: string }) => void;
  onThinking?: (thinking: string) => void;
  onIteration?: (iteration: number, content: string) => void;
  abortSignal?: AbortSignal;
}

export interface AgentLoopResult {
  success: boolean;
  result?: string;
  error?: string;
  iterations: number;
  toolCalls: number;
}

/**
 * Run the autonomous agent loop
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const config = getConfig();
  const { task, workspaceDir, agentConfigPath, abortSignal } = options;
  
  // Build system prompt
  const systemPrompt = buildSystemPrompt({
    agentConfigPath,
    taskContext: `Task ID: ${task.id}\nWorkspace: ${workspaceDir}`
  });
  
  // Initialize conversation history
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task.prompt }
  ];
  
  // Track statistics
  let iterations = 0;
  let totalToolCalls = 0;
  
  // Create initial user message in DB
  createMessage({
    sessionId: task.session_id,
    role: 'user',
    content: task.prompt
  });
  
  // Update task status to running
  updateTask(task.id, {
    status: 'running',
    started_at: new Date().toISOString()
  });
  
  try {
    // Main loop
    while (iterations < config.workers.max_iterations) {
      // Check for abort
      if (abortSignal?.aborted) {
        return {
          success: false,
          error: 'Task was cancelled',
          iterations,
          toolCalls: totalToolCalls
        };
      }
      
      iterations++;
      
      // Update task iteration count
      updateTask(task.id, { iterations });
      
      // Prune history if needed
      const { pruned } = pruneHistory(messages, config.workers.context_limit);
      
      // Get LLM response
      let fullResponse = '';
      
      try {
        for await (const chunk of streamChat(pruned)) {
          fullResponse += chunk.content;
          options.onChunk?.(chunk.content);
          
          // Check for abort during streaming
          if (abortSignal?.aborted) {
            return {
              success: false,
              error: 'Task was cancelled during generation',
              iterations,
              toolCalls: totalToolCalls
            };
          }
        }
      } catch (error) {
        console.error('[agent] LLM error:', error);
        return {
          success: false,
          error: `LLM error: ${error instanceof Error ? error.message : String(error)}`,
          iterations,
          toolCalls: totalToolCalls
        };
      }
      
      // Notify iteration complete
      options.onIteration?.(iterations, fullResponse);
      
      // Parse thinking blocks
      const thinking = parseThinking(fullResponse);
      if (thinking) {
        options.onThinking?.(thinking.thinking);
      }
      
      // Check for task completion
      const completion = parseCompletion(fullResponse);
      if (completion) {
        // Save assistant message to DB
        createMessage({
          sessionId: task.session_id,
          role: 'assistant',
          content: fullResponse,
          metadata: { completed: true }
        });
        
        // Update task as completed
        updateTask(task.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          result: completion.result
        });
        
        return {
          success: true,
          result: completion.result,
          iterations,
          toolCalls: totalToolCalls
        };
      }
      
      // Parse tool calls
      const toolCalls = parseToolCalls(fullResponse);
      
      if (toolCalls.length === 0) {
        // No tool calls and no completion - add response and continue
        messages.push({ role: 'assistant', content: fullResponse });
        
        // Save assistant message to DB
        createMessage({
          sessionId: task.session_id,
          role: 'assistant',
          content: fullResponse
        });
        
        // Add a nudge to continue or complete
        messages.push({
          role: 'user',
          content: 'Please continue with the task. Use tools to make progress, or signal completion with <TASK_COMPLETE>result</TASK_COMPLETE> when done.'
        });
        
        continue;
      }
      
      // Save assistant message to DB
      const assistantMessage = createMessage({
        sessionId: task.session_id,
        role: 'assistant',
        content: fullResponse
      });
      
      // Execute tool calls
      const toolResults: string[] = [];
      
      for (const toolCall of toolCalls) {
        totalToolCalls++;
        
        options.onToolCall?.({
          name: toolCall.name,
          args: toolCall.args,
          status: 'running'
        });
        
        // Create tool call record in DB
        const dbToolCall = createToolCall({
          messageId: assistantMessage.id,
          name: toolCall.name,
          args: toolCall.args
        });
        
        // Update status to running
        updateToolCall(dbToolCall.id, { status: 'running' });
        
        // Create tool context
        const toolContext: ToolContext = {
          sessionId: task.session_id,
          taskId: task.id,
          workspaceDir,
          abortSignal
        };
        
        // Execute the tool
        const result = await executeTool(toolCall.name, toolCall.args, toolContext);
        
        // Update tool call record
        updateToolCall(dbToolCall.id, {
          status: result.success ? 'completed' : 'failed',
          result: result.output,
          error: result.error,
          completedAt: new Date().toISOString()
        });
        
        options.onToolResult?.({
          name: toolCall.name,
          success: result.success,
          output: result.output || result.error || ''
        });
        
        // Format result for conversation
        toolResults.push(formatToolResult(toolCall.name, toolCall.args, result));
      }
      
      // Add assistant message and tool results to history
      messages.push({ role: 'assistant', content: fullResponse });
      
      // Add tool results as a tool message
      const toolResultsContent = toolResults.join('\n\n');
      messages.push({ role: 'user', content: `Tool results:\n\n${toolResultsContent}` });
      
      // Save tool results to DB
      createMessage({
        sessionId: task.session_id,
        role: 'tool',
        content: toolResultsContent
      });
    }
    
    // Max iterations reached
    return {
      success: false,
      error: `Maximum iterations (${config.workers.max_iterations}) reached without completion`,
      iterations,
      toolCalls: totalToolCalls
    };
  } catch (error) {
    // Update task as failed
    updateTask(task.id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      iterations,
      toolCalls: totalToolCalls
    };
  }
}

/**
 * Simple one-shot completion (no tool loop)
 */
export async function simpleCompletion(
  prompt: string,
  systemPrompt?: string
): Promise<{ content: string; error?: string }> {
  const messages: LLMMessage[] = [];
  
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  
  messages.push({ role: 'user', content: prompt });
  
  try {
    let content = '';
    for await (const chunk of streamChat(messages)) {
      content += chunk.content;
    }
    return { content };
  } catch (error) {
    return {
      content: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
