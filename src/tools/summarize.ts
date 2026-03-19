// ============================================================================
// Tool: summarize — condense long text or files into a compact summary
// ============================================================================

import fs from 'fs';
import path from 'path';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { simpleCompletion } from '../agent/loop.js';

export interface SummarizeArgs {
  text?: string;
  file?: string;
  style?: 'bullet' | 'paragraph' | 'tldr' | 'technical';
  max_words?: number;
  focus?: string;
}

const MAX_INPUT_CHARS = 80_000;

async function executeSummarize(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const {
    text,
    file,
    style = 'bullet',
    max_words = 200,
    focus,
  } = args as SummarizeArgs;

  let content = text || '';

  // Load from file if provided
  if (file) {
    const absPath = path.isAbsolute(file)
      ? file
      : path.join(context.workspaceDir, file);

    if (!fs.existsSync(absPath)) {
      return { success: false, output: '', error: `File not found: ${absPath}` };
    }

    const stat = fs.statSync(absPath);
    if (stat.size > 10 * 1024 * 1024) {
      return { success: false, output: '', error: 'File is too large to summarize (max 10 MB).' };
    }

    content = fs.readFileSync(absPath, 'utf-8');
  }

  if (!content) {
    return { success: false, output: '', error: 'Provide either text or file.' };
  }

  // Truncate if necessary
  if (content.length > MAX_INPUT_CHARS) {
    content = content.slice(0, MAX_INPUT_CHARS) + '\n\n[... content truncated ...]';
  }

  const styleInstructions: Record<string, string> = {
    bullet: 'Write a bullet-point summary highlighting the key points.',
    paragraph: 'Write a concise paragraph summary.',
    tldr: 'Write a single-sentence TL;DR.',
    technical: 'Write a technical summary suitable for a developer audience. Include relevant details about APIs, data structures, or algorithms.',
  };

  const systemPrompt = `You are a precise summarization assistant.
${styleInstructions[style] || styleInstructions.bullet}
Limit your summary to approximately ${max_words} words.
${focus ? `Focus specifically on: ${focus}` : ''}
Output ONLY the summary, no preamble.`;

  const { content: summary, error } = await simpleCompletion(content, systemPrompt);

  if (error) {
    return { success: false, output: '', error };
  }

  return {
    success: true,
    output: summary,
    metadata: { style, max_words, charCount: content.length },
  };
}

export const summarizeTool: ToolDefinition = {
  name: 'summarize',
  description:
    'Condense a long text string or file into a concise summary. ' +
    'Supports bullet points, paragraphs, TL;DR, or technical style.',
  parameters: [
    {
      name: 'text',
      type: 'string',
      description: 'Raw text to summarize. Mutually exclusive with file.',
      required: false,
    },
    {
      name: 'file',
      type: 'string',
      description: 'Path to file to summarize (relative to workspace). Mutually exclusive with text.',
      required: false,
    },
    {
      name: 'style',
      type: 'string',
      description: 'Summary style: "bullet" | "paragraph" | "tldr" | "technical". Default: "bullet".',
      required: false,
      default: 'bullet',
    },
    {
      name: 'max_words',
      type: 'number',
      description: 'Approximate maximum word count. Default: 200.',
      required: false,
      default: 200,
    },
    {
      name: 'focus',
      type: 'string',
      description: 'Optional topic to focus the summary on.',
      required: false,
    },
  ],
  execute: executeSummarize,
};
