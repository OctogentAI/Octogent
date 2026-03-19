// ============================================================================
// Tool: code_search — ripgrep-powered semantic search over the workspace
// ============================================================================

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';

const execFileAsync = promisify(execFile);

export interface CodeSearchArgs {
  pattern: string;
  glob?: string;
  case_sensitive?: boolean;
  context_lines?: number;
  max_results?: number;
  path?: string;
}

async function executeCodeSearch(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const {
    pattern,
    glob,
    case_sensitive = false,
    context_lines = 2,
    max_results = 50,
    path: searchPath = '.',
  } = args as CodeSearchArgs;

  if (!pattern || typeof pattern !== 'string') {
    return { success: false, output: '', error: 'pattern is required' };
  }

  const absPath = path.isAbsolute(searchPath)
    ? searchPath
    : path.join(context.workspaceDir, searchPath);

  // Build rg arguments
  const rgArgs: string[] = [
    '--line-number',
    '--no-heading',
    '--with-filename',
    `--context=${context_lines}`,
    `--max-count=${max_results}`,
  ];

  if (!case_sensitive) rgArgs.push('--ignore-case');
  if (glob) rgArgs.push('--glob', glob);

  rgArgs.push(pattern, absPath);

  try {
    const { stdout, stderr } = await execFileAsync('rg', rgArgs, {
      timeout: 15_000,
      maxBuffer: 1024 * 1024 * 5, // 5 MB
    });

    if (stderr) {
      return { success: false, output: '', error: stderr };
    }

    const lines = stdout.split('\n').filter(Boolean);
    const truncated = lines.length >= max_results;
    const output = [
      `Found ${lines.length} match${lines.length === 1 ? '' : 'es'}${truncated ? ' (results may be truncated)' : ''}:`,
      '',
      stdout.trim(),
    ].join('\n');

    return { success: true, output };
  } catch (err: unknown) {
    // rg exits with code 1 when no matches found — not an error
    const e = err as NodeJS.ErrnoException & { code?: number | string };
    if (e.code === 1) {
      return { success: true, output: 'No matches found.' };
    }
    if (e.code === 'ENOENT') {
      // rg not installed — fall back to basic grep
      return fallbackGrep(pattern, absPath, case_sensitive);
    }
    return {
      success: false,
      output: '',
      error: `Search failed: ${e.message ?? String(err)}`,
    };
  }
}

async function fallbackGrep(
  pattern: string,
  searchPath: string,
  caseSensitive: boolean
): Promise<ToolResult> {
  const grepArgs = ['-r', '-n', '--include=*.{ts,js,py,go,rs,java,cs,cpp,c,h}'];
  if (!caseSensitive) grepArgs.push('-i');
  grepArgs.push(pattern, searchPath);

  try {
    const { stdout } = await execFileAsync('grep', grepArgs, {
      timeout: 15_000,
      maxBuffer: 1024 * 1024 * 5,
    });
    return { success: true, output: stdout.trim() || 'No matches found.' };
  } catch {
    return {
      success: false,
      output: '',
      error: 'Neither ripgrep (rg) nor grep are available in PATH.',
    };
  }
}

export const codeSearchTool: ToolDefinition = {
  name: 'code_search',
  description:
    'Search for patterns inside source files in the workspace using ripgrep. ' +
    'Returns matching lines with file paths and line numbers.',
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'Regex or literal pattern to search for.',
      required: true,
    },
    {
      name: 'glob',
      type: 'string',
      description: 'Optional glob to restrict file types, e.g. "**/*.ts".',
      required: false,
    },
    {
      name: 'case_sensitive',
      type: 'boolean',
      description: 'Whether the search is case-sensitive. Default: false.',
      required: false,
      default: false,
    },
    {
      name: 'context_lines',
      type: 'number',
      description: 'Number of context lines to show around each match. Default: 2.',
      required: false,
      default: 2,
    },
    {
      name: 'max_results',
      type: 'number',
      description: 'Maximum number of result lines. Default: 50.',
      required: false,
      default: 50,
    },
    {
      name: 'path',
      type: 'string',
      description: 'Subdirectory to search within (relative to workspace). Default: ".".',
      required: false,
      default: '.',
    },
  ],
  execute: executeCodeSearch,
};
