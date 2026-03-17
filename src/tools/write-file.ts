// ============================================================================
// Write File Tool - Write content to files
// ============================================================================

import fs from 'fs/promises';
import path from 'path';
import type { ToolDefinition, ToolContext, ToolResult } from '../../lib/types';
import { getConfig } from '../config';

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: 'Write content to a file. Creates the file if it doesn\'t exist, or overwrites if it does. Automatically creates parent directories as needed.',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file (relative to workspace)',
      required: true
    },
    {
      name: 'content',
      type: 'string',
      description: 'Content to write to the file',
      required: true
    },
    {
      name: 'append',
      type: 'boolean',
      description: 'If true, append to file instead of overwriting (default: false)',
      required: false,
      default: false
    },
    {
      name: 'create_dirs',
      type: 'boolean',
      description: 'If true, create parent directories if they don\'t exist (default: true)',
      required: false,
      default: true
    }
  ],
  
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const config = getConfig();
    const relativePath = args.path as string;
    const content = args.content as string;
    const append = args.append as boolean ?? false;
    const createDirs = args.create_dirs as boolean ?? true;
    
    // Resolve and validate path
    const absolutePath = path.resolve(context.workspaceDir, relativePath);
    
    // Security check: ensure path is within workspace
    if (!absolutePath.startsWith(context.workspaceDir)) {
      return {
        success: false,
        output: '',
        error: 'Access denied: path is outside the workspace directory'
      };
    }
    
    // Check content size
    if (content.length > config.tools.max_file_size) {
      return {
        success: false,
        output: '',
        error: `Content too large (${content.length} bytes). Maximum allowed: ${config.tools.max_file_size} bytes.`
      };
    }
    
    try {
      // Create parent directories if needed
      if (createDirs) {
        const dir = path.dirname(absolutePath);
        await fs.mkdir(dir, { recursive: true });
      }
      
      // Check if file exists for metadata
      let existed = false;
      let previousSize = 0;
      try {
        const stats = await fs.stat(absolutePath);
        existed = true;
        previousSize = stats.size;
      } catch {
        // File doesn't exist
      }
      
      // Write or append content
      if (append) {
        await fs.appendFile(absolutePath, content, 'utf-8');
      } else {
        await fs.writeFile(absolutePath, content, 'utf-8');
      }
      
      // Get new file stats
      const newStats = await fs.stat(absolutePath);
      
      const action = append ? 'Appended to' : (existed ? 'Overwrote' : 'Created');
      const lines = content.split('\n').length;
      
      return {
        success: true,
        output: `${action} ${relativePath} (${lines} lines, ${newStats.size} bytes)`,
        metadata: {
          action: action.toLowerCase(),
          path: relativePath,
          absolutePath,
          lines,
          bytes: newStats.size,
          previousSize: existed ? previousSize : undefined
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: false,
          output: '',
          error: `Parent directory does not exist and create_dirs is false: ${path.dirname(relativePath)}`
        };
      }
      
      if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        return {
          success: false,
          output: '',
          error: `Permission denied: cannot write to ${relativePath}`
        };
      }
      
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};
