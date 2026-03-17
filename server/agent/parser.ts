// ============================================================================
// Tool Call Parser - Parse XML-formatted tool calls from LLM output
// ============================================================================

export interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
  raw: string;
  startIndex: number;
  endIndex: number;
}

export interface ParsedCompletion {
  result: string;
  raw: string;
}

/**
 * Parse tool calls from LLM output
 * 
 * Expected format:
 * <tool_call>
 *   <name>tool_name</name>
 *   <args>{"param": "value"}</args>
 * </tool_call>
 */
export function parseToolCalls(content: string): ParsedToolCall[] {
  const toolCalls: ParsedToolCall[] = [];
  
  // Regex to match tool_call blocks
  const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  let match: RegExpExecArray | null;
  
  while ((match = toolCallRegex.exec(content)) !== null) {
    const raw = match[0];
    const inner = match[1];
    const startIndex = match.index;
    const endIndex = startIndex + raw.length;
    
    try {
      // Extract name
      const nameMatch = inner.match(/<name>([\s\S]*?)<\/name>/i);
      if (!nameMatch) {
        console.warn('[parser] Tool call missing <name> tag:', raw);
        continue;
      }
      const name = nameMatch[1].trim();
      
      // Extract args
      const argsMatch = inner.match(/<args>([\s\S]*?)<\/args>/i);
      let args: Record<string, unknown> = {};
      
      if (argsMatch) {
        const argsStr = argsMatch[1].trim();
        try {
          args = JSON.parse(argsStr);
        } catch (e) {
          console.warn('[parser] Failed to parse tool args as JSON:', argsStr);
          // Try to fix common JSON issues
          args = tryFixJson(argsStr);
        }
      }
      
      toolCalls.push({
        name,
        args,
        raw,
        startIndex,
        endIndex
      });
    } catch (error) {
      console.error('[parser] Error parsing tool call:', error);
    }
  }
  
  return toolCalls;
}

/**
 * Parse TASK_COMPLETE marker from LLM output
 * 
 * Expected format:
 * <TASK_COMPLETE>result summary</TASK_COMPLETE>
 */
export function parseCompletion(content: string): ParsedCompletion | null {
  const match = content.match(/<TASK_COMPLETE>([\s\S]*?)<\/TASK_COMPLETE>/i);
  
  if (!match) {
    return null;
  }
  
  return {
    result: match[1].trim(),
    raw: match[0]
  };
}

/**
 * Check if the output contains a thinking block
 */
export function parseThinking(content: string): { thinking: string; rest: string } | null {
  const match = content.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  
  if (!match) {
    return null;
  }
  
  const thinking = match[1].trim();
  const rest = content.replace(match[0], '').trim();
  
  return { thinking, rest };
}

/**
 * Extract text content (non-tool-call content) from LLM output
 */
export function extractTextContent(content: string): string {
  let text = content;
  
  // Remove tool calls
  text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
  
  // Remove TASK_COMPLETE
  text = text.replace(/<TASK_COMPLETE>[\s\S]*?<\/TASK_COMPLETE>/gi, '');
  
  // Remove thinking blocks
  text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  
  // Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  
  return text;
}

/**
 * Try to fix common JSON formatting issues
 */
function tryFixJson(str: string): Record<string, unknown> {
  // Remove any leading/trailing whitespace
  let fixed = str.trim();
  
  // Try to handle unquoted keys
  fixed = fixed.replace(/(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  
  // Try to handle single quotes
  fixed = fixed.replace(/'/g, '"');
  
  // Try to handle trailing commas
  fixed = fixed.replace(/,\s*([\}\]])/g, '$1');
  
  try {
    return JSON.parse(fixed);
  } catch {
    // If still failing, try to extract key-value pairs manually
    const result: Record<string, unknown> = {};
    
    // Simple key: "value" pattern
    const kvRegex = /"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*:\s*"([^"]*)"/g;
    let kvMatch: RegExpExecArray | null;
    
    while ((kvMatch = kvRegex.exec(str)) !== null) {
      result[kvMatch[1]] = kvMatch[2];
    }
    
    // Also try to extract numbers and booleans
    const numRegex = /"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*:\s*(-?\d+\.?\d*)/g;
    while ((kvMatch = numRegex.exec(str)) !== null) {
      if (!(kvMatch[1] in result)) {
        result[kvMatch[1]] = parseFloat(kvMatch[2]);
      }
    }
    
    const boolRegex = /"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*:\s*(true|false)/gi;
    while ((kvMatch = boolRegex.exec(str)) !== null) {
      if (!(kvMatch[1] in result)) {
        result[kvMatch[1]] = kvMatch[2].toLowerCase() === 'true';
      }
    }
    
    return result;
  }
}

/**
 * Validate that tool calls are properly formatted
 */
export function validateToolCall(toolCall: ParsedToolCall): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!toolCall.name) {
    errors.push('Tool name is required');
  } else if (!/^[a-z_][a-z0-9_]*$/i.test(toolCall.name)) {
    errors.push('Tool name contains invalid characters');
  }
  
  if (toolCall.args === null || typeof toolCall.args !== 'object') {
    errors.push('Tool args must be an object');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Format tool result for insertion into conversation
 */
export function formatToolResult(
  toolName: string,
  args: Record<string, unknown>,
  result: { success: boolean; output: string; error?: string }
): string {
  let formatted = `<tool_result>\n`;
  formatted += `  <name>${toolName}</name>\n`;
  formatted += `  <status>${result.success ? 'success' : 'error'}</status>\n`;
  
  if (result.success) {
    formatted += `  <output>${escapeXml(result.output)}</output>\n`;
  } else {
    formatted += `  <error>${escapeXml(result.error || 'Unknown error')}</error>\n`;
  }
  
  formatted += `</tool_result>`;
  
  return formatted;
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
