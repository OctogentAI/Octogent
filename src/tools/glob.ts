// ============================================================================
// Octogent - Glob Tool for File Pattern Matching
// ============================================================================

import { glob } from 'glob';
import { stat } from 'fs/promises';
import path from 'path';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { logger } from '../utils/logger.js';
import { ToolExecutionError, ToolTimeoutError } from '../utils/errors.js';

interface GlobArgs {
  pattern: string;
  cwd?: string;
  ignore?: string[];
  max_results?: number;
  include_stats?: boolean;
}

interface FileInfo {
  path: string;
  size?: number;
  modified?: string;
  isDirectory?: boolean;
}

export const globTool: ToolDefinition = {
  name: 'glob',
  description: `Find files matching a glob pattern. Useful for discovering files in a codebase.

Examples:
- "**/*.ts" - Find all TypeScript files
- "src/**/*.{js,ts}" - Find JS/TS files in src
- "**/test*.ts" - Find test files
- "!**/node_modules/**" - Exclude node_modules`,
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'Glob pattern to match files (e.g., "**/*.ts", "src/**/*.{js,jsx}")',
      required: true,
    },
    {
      name: 'cwd',
      type: 'string',
      description: 'Working directory to search from (defaults to workspace root)',
      required: false,
    },
    {
      name: 'ignore',
      type: 'array',
      description: 'Patterns to ignore (e.g., ["node_modules/**", "dist/**"])',
      required: false,
    },
    {
      name: 'max_results',
      type: 'number',
      description: 'Maximum number of results to return (default: 100)',
      required: false,
      default: 100,
    },
    {
      name: 'include_stats',
      type: 'boolean',
      description: 'Include file size and modification time',
      required: false,
      default: false,
    },
  ],
  execute: async (args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
    const {
      pattern,
      cwd,
      ignore = ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
      max_results = 100,
      include_stats = false,
    } = args as GlobArgs;

    const searchDir = cwd ? path.resolve(context.workspaceDir, cwd) : context.workspaceDir;

    // Validate the search directory is within workspace
    if (!searchDir.startsWith(context.workspaceDir)) {
      return {
        success: false,
        output: '',
        error: 'Search directory must be within workspace',
      };
    }

    logger.debug(`Glob search: ${pattern} in ${searchDir}`);

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new ToolTimeoutError('glob', 30000)), 30000);
      });

      const searchPromise = glob(pattern, {
        cwd: searchDir,
        ignore: ignore as string[],
        nodir: true,
        absolute: false,
        signal: context.abortSignal,
      });

      const files = await Promise.race([searchPromise, timeoutPromise]);
      const limitedFiles = files.slice(0, max_results);

      let results: FileInfo[];

      if (include_stats) {
        results = await Promise.all(
          limitedFiles.map(async (file) => {
            const fullPath = path.join(searchDir, file);
            try {
              const stats = await stat(fullPath);
              return {
                path: file,
                size: stats.size,
                modified: stats.mtime.toISOString(),
                isDirectory: stats.isDirectory(),
              };
            } catch {
              return { path: file };
            }
          })
        );
      } else {
        results = limitedFiles.map((file) => ({ path: file }));
      }

      const output = include_stats
        ? results.map((r) => 
            `${r.path}${r.size !== undefined ? ` (${formatSize(r.size)})` : ''}`
          ).join('\n')
        : results.map((r) => r.path).join('\n');

      return {
        success: true,
        output: output || 'No files found matching the pattern.',
        metadata: {
          totalFound: files.length,
          returned: limitedFiles.length,
          truncated: files.length > max_results,
        },
      };
    } catch (error) {
      if (error instanceof ToolTimeoutError) {
        return {
          success: false,
          output: '',
          error: 'Search timed out after 30 seconds',
        };
      }

      throw new ToolExecutionError(
        'glob',
        `Failed to search files: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default globTool;
