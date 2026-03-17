// ============================================================================
// Octogent - Patch Tool for Surgical File Edits
// ============================================================================

import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import * as Diff from 'diff';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { logger } from '../utils/logger.js';
import { ToolExecutionError } from '../utils/errors.js';

interface PatchArgs {
  path: string;
  old_string: string;
  new_string: string;
  occurrence?: number;
  dry_run?: boolean;
}

export const patchTool: ToolDefinition = {
  name: 'patch',
  description: `Make surgical text replacements in a file. This is the preferred method for editing existing files as it allows for precise, targeted changes without rewriting the entire file.

Best practices:
- Include enough context in old_string to make it unique
- Keep changes focused and minimal
- Use dry_run first to preview changes`,
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file to edit',
      required: true,
    },
    {
      name: 'old_string',
      type: 'string',
      description: 'Exact text to find and replace (must match exactly including whitespace)',
      required: true,
    },
    {
      name: 'new_string',
      type: 'string',
      description: 'Text to replace with',
      required: true,
    },
    {
      name: 'occurrence',
      type: 'number',
      description: 'Which occurrence to replace (1-indexed). Default replaces first occurrence only. Use 0 to replace all.',
      required: false,
      default: 1,
    },
    {
      name: 'dry_run',
      type: 'boolean',
      description: 'Preview changes without writing to file',
      required: false,
      default: false,
    },
  ],
  execute: async (args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
    const {
      path: filePath,
      old_string,
      new_string,
      occurrence = 1,
      dry_run = false,
    } = args as PatchArgs;

    const fullPath = path.resolve(context.workspaceDir, filePath);

    // Validate path is within workspace
    if (!fullPath.startsWith(context.workspaceDir)) {
      return {
        success: false,
        output: '',
        error: 'File path must be within workspace',
      };
    }

    logger.debug(`Patch: ${filePath}`, { dry_run });

    try {
      const content = await readFile(fullPath, 'utf-8');

      // Count occurrences
      const occurrences: number[] = [];
      let searchIndex = 0;
      while (true) {
        const index = content.indexOf(old_string, searchIndex);
        if (index === -1) break;
        occurrences.push(index);
        searchIndex = index + 1;
      }

      if (occurrences.length === 0) {
        return {
          success: false,
          output: '',
          error: `String not found in file: "${truncate(old_string, 100)}"`,
          metadata: { suggestion: 'Check for exact whitespace/indentation match' },
        };
      }

      let newContent: string;
      let replacementCount: number;

      if (occurrence === 0) {
        // Replace all occurrences
        newContent = content.split(old_string).join(new_string);
        replacementCount = occurrences.length;
      } else if (occurrence > 0 && occurrence <= occurrences.length) {
        // Replace specific occurrence
        const targetIndex = occurrences[occurrence - 1];
        newContent = 
          content.slice(0, targetIndex) +
          new_string +
          content.slice(targetIndex + old_string.length);
        replacementCount = 1;
      } else {
        return {
          success: false,
          output: '',
          error: `Occurrence ${occurrence} not found. File has ${occurrences.length} occurrence(s).`,
        };
      }

      // Generate diff for output
      const diff = Diff.createTwoFilesPatch(
        filePath,
        filePath,
        content,
        newContent,
        'original',
        'modified'
      );

      if (dry_run) {
        return {
          success: true,
          output: `[DRY RUN] Would make ${replacementCount} replacement(s):\n\n${diff}`,
          metadata: {
            dry_run: true,
            replacements: replacementCount,
            totalOccurrences: occurrences.length,
          },
        };
      }

      // Write the file
      await writeFile(fullPath, newContent, 'utf-8');

      return {
        success: true,
        output: `Made ${replacementCount} replacement(s) in ${filePath}:\n\n${diff}`,
        metadata: {
          replacements: replacementCount,
          totalOccurrences: occurrences.length,
          bytesWritten: newContent.length,
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: false,
          output: '',
          error: `File not found: ${filePath}`,
        };
      }

      throw new ToolExecutionError(
        'patch',
        `Failed to patch file: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  },
};

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export default patchTool;
