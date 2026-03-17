// ============================================================================
// Octogent - Grep Tool for Content Search
// ============================================================================

import { readFile } from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { logger } from '../utils/logger.js';
import { ToolExecutionError, ToolTimeoutError } from '../utils/errors.js';

interface GrepArgs {
  pattern: string;
  path?: string;
  file_pattern?: string;
  ignore_case?: boolean;
  max_results?: number;
  context_lines?: number;
  whole_word?: boolean;
}

interface Match {
  file: string;
  line: number;
  content: string;
  context?: string[];
}

export const grepTool: ToolDefinition = {
  name: 'grep',
  description: `Search for text patterns in files using regular expressions.

Examples:
- Search for "TODO" in all TypeScript files
- Find function definitions with "async function"
- Search for imports of a specific module`,
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'Regular expression pattern to search for',
      required: true,
    },
    {
      name: 'path',
      type: 'string',
      description: 'Directory or file to search in (defaults to workspace root)',
      required: false,
    },
    {
      name: 'file_pattern',
      type: 'string',
      description: 'Glob pattern to filter files (e.g., "**/*.ts")',
      required: false,
      default: '**/*',
    },
    {
      name: 'ignore_case',
      type: 'boolean',
      description: 'Case-insensitive search',
      required: false,
      default: false,
    },
    {
      name: 'max_results',
      type: 'number',
      description: 'Maximum number of matches to return',
      required: false,
      default: 50,
    },
    {
      name: 'context_lines',
      type: 'number',
      description: 'Number of context lines before and after match',
      required: false,
      default: 0,
    },
    {
      name: 'whole_word',
      type: 'boolean',
      description: 'Match whole words only',
      required: false,
      default: false,
    },
  ],
  execute: async (args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
    const {
      pattern,
      path: searchPath,
      file_pattern = '**/*',
      ignore_case = false,
      max_results = 50,
      context_lines = 0,
      whole_word = false,
    } = args as GrepArgs;

    const searchDir = searchPath 
      ? path.resolve(context.workspaceDir, searchPath)
      : context.workspaceDir;

    // Validate the search directory is within workspace
    if (!searchDir.startsWith(context.workspaceDir)) {
      return {
        success: false,
        output: '',
        error: 'Search path must be within workspace',
      };
    }

    logger.debug(`Grep search: ${pattern} in ${searchDir}`);

    try {
      // Build regex
      let regexPattern = pattern;
      if (whole_word) {
        regexPattern = `\\b${pattern}\\b`;
      }
      const regex = new RegExp(regexPattern, ignore_case ? 'gi' : 'g');

      // Find files to search
      const files = await glob(file_pattern, {
        cwd: searchDir,
        nodir: true,
        ignore: ['node_modules/**', '.git/**', 'dist/**', '*.min.js', '*.map'],
        absolute: false,
      });

      const matches: Match[] = [];
      let filesSearched = 0;
      const maxFilesToSearch = 1000;

      for (const file of files) {
        if (filesSearched >= maxFilesToSearch) break;
        if (matches.length >= max_results) break;

        const fullPath = path.join(searchDir, file);
        
        try {
          const content = await readFile(fullPath, 'utf-8');
          
          // Skip binary files
          if (content.includes('\0')) continue;
          
          filesSearched++;
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= max_results) break;

            const line = lines[i];
            if (regex.test(line)) {
              const match: Match = {
                file,
                line: i + 1,
                content: line.trim(),
              };

              if (context_lines > 0) {
                const start = Math.max(0, i - context_lines);
                const end = Math.min(lines.length, i + context_lines + 1);
                match.context = lines.slice(start, end).map((l, idx) => {
                  const lineNum = start + idx + 1;
                  const prefix = lineNum === i + 1 ? '>' : ' ';
                  return `${prefix}${lineNum}: ${l}`;
                });
              }

              matches.push(match);
            }
            
            // Reset regex lastIndex for global search
            regex.lastIndex = 0;
          }
        } catch {
          // Skip files that can't be read
        }
      }

      if (matches.length === 0) {
        return {
          success: true,
          output: `No matches found for pattern: ${pattern}`,
          metadata: { filesSearched, matches: 0 },
        };
      }

      let output: string;
      if (context_lines > 0) {
        output = matches.map((m) => 
          `${m.file}:\n${m.context?.join('\n') || m.content}\n`
        ).join('\n');
      } else {
        output = matches.map((m) => 
          `${m.file}:${m.line}: ${m.content}`
        ).join('\n');
      }

      return {
        success: true,
        output,
        metadata: {
          filesSearched,
          matches: matches.length,
          truncated: matches.length >= max_results,
        },
      };
    } catch (error) {
      throw new ToolExecutionError(
        'grep',
        `Search failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  },
};

export default grepTool;
