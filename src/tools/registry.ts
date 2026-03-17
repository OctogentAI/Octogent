// ============================================================================
// Tool Registry - Central registration and execution of all tools
// ============================================================================

import type { ToolDefinition, ToolContext, ToolResult, ToolParameter } from '../types';
import { getConfig } from '../config';

// Tool implementations
import { bashTool } from './bash';
import { readFileTool } from './read-file';
import { writeFileTool } from './write-file';
import { listDirTool } from './list-dir';
import { webSearchTool } from './web-search';
import { webFetchTool } from './web-fetch';
import { memorySaveTool, memoryReadTool } from './memory';
import { spawnAgentTool } from './spawn-agent';
import { checkTaskTool } from './check-task';

// Registry of all available tools
const tools = new Map<string, ToolDefinition>();

// Register all built-in tools
function registerBuiltinTools(): void {
  tools.set('bash', bashTool);
  tools.set('read_file', readFileTool);
  tools.set('write_file', writeFileTool);
  tools.set('list_dir', listDirTool);
  tools.set('web_search', webSearchTool);
  tools.set('web_fetch', webFetchTool);
  tools.set('memory_save', memorySaveTool);
  tools.set('memory_read', memoryReadTool);
  tools.set('spawn_agent', spawnAgentTool);
  tools.set('check_task', checkTaskTool);
}

// Initialize on module load
registerBuiltinTools();

/**
 * Get a tool by name
 */
export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

/**
 * Get all registered tools
 */
export function getAllTools(): ToolDefinition[] {
  return Array.from(tools.values());
}

/**
 * Get enabled tools based on config
 */
export function getEnabledTools(): ToolDefinition[] {
  const config = getConfig();
  const enabled = config.tools.enabled;
  const disabled = config.tools.disabled;
  
  return getAllTools().filter(tool => {
    if (disabled.includes(tool.name)) return false;
    if (enabled.length > 0 && !enabled.includes(tool.name)) return false;
    return true;
  });
}

/**
 * Execute a tool by name
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const tool = getTool(name);
  
  if (!tool) {
    return {
      success: false,
      output: '',
      error: `Unknown tool: ${name}`
    };
  }
  
  // Check if tool is enabled
  const config = getConfig();
  if (config.tools.disabled.includes(name)) {
    return {
      success: false,
      output: '',
      error: `Tool "${name}" is disabled`
    };
  }
  
  if (config.tools.enabled.length > 0 && !config.tools.enabled.includes(name)) {
    return {
      success: false,
      output: '',
      error: `Tool "${name}" is not in the enabled list`
    };
  }
  
  // Validate required parameters
  for (const param of tool.parameters) {
    if (param.required && !(param.name in args)) {
      return {
        success: false,
        output: '',
        error: `Missing required parameter: ${param.name}`
      };
    }
  }
  
  // Apply default values
  const argsWithDefaults = { ...args };
  for (const param of tool.parameters) {
    if (!(param.name in argsWithDefaults) && param.default !== undefined) {
      argsWithDefaults[param.name] = param.default;
    }
  }
  
  try {
    return await tool.execute(argsWithDefaults, context);
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Generate tool documentation for system prompt
 */
export function generateToolPrompt(): string {
  const enabledTools = getEnabledTools();
  
  if (enabledTools.length === 0) {
    return '';
  }
  
  const toolDocs = enabledTools.map(tool => {
    const params = tool.parameters.map(p => {
      const required = p.required ? ' (required)' : '';
      const defaultVal = p.default !== undefined ? ` [default: ${JSON.stringify(p.default)}]` : '';
      return `    - ${p.name}: ${p.type}${required}${defaultVal} - ${p.description}`;
    }).join('\n');
    
    return `### ${tool.name}
${tool.description}
Parameters:
${params || '    (none)'}`;
  }).join('\n\n');
  
  return `## Available Tools

You can use tools by outputting XML-formatted tool calls. Each tool call should be on its own line.

Format:
<tool_call>
  <name>tool_name</name>
  <args>{"param1": "value1", "param2": "value2"}</args>
</tool_call>

${toolDocs}

## Important Notes:
- Always wait for tool results before proceeding
- You can make multiple tool calls in a single response
- If a tool fails, try to understand the error and adjust your approach
- When your task is complete, output: <TASK_COMPLETE>result summary here</TASK_COMPLETE>`;
}

/**
 * Register a custom tool
 */
export function registerTool(tool: ToolDefinition): void {
  tools.set(tool.name, tool);
}

/**
 * Unregister a tool
 */
export function unregisterTool(name: string): boolean {
  return tools.delete(name);
}

/**
 * Get tool schema for API documentation
 */
export function getToolSchema(name: string): {
  name: string;
  description: string;
  parameters: ToolParameter[];
} | null {
  const tool = getTool(name);
  if (!tool) return null;
  
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  };
}

/**
 * Get all tool schemas
 */
export function getAllToolSchemas(): Array<{
  name: string;
  description: string;
  parameters: ToolParameter[];
}> {
  return getAllTools().map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
}
