// ============================================================================
// List Directory Tool - List directory contents
// ============================================================================

import fs from 'fs/promises';
import path from 'path';
import type { ToolDefinition, ToolContext, ToolResult } from '../../lib/types';

interface FileEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size?: number;
  modified?: string;
}

export const listDirTool: ToolDefinition = {
  name: 'list_dir',
  description: 'List the contents of a directory. Shows files, directories, and their basic information.',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the directory (relative to workspace, default: workspace root)',
      required: false,
      default: '.'
    },
    {
      name: 'recursive',
      type: 'boolean',
      description: 'If true, list contents recursively (default: false)',
      required: false,
      default: false
    },
    {
      name: 'show_hidden',
      type: 'boolean',
      description: 'If true, include hidden files (starting with dot) (default: false)',
      required: false,
      default: false
    },
    {
      name: 'max_depth',
      type: 'number',
      description: 'Maximum recursion depth (only used if recursive is true, default: 3)',
      required: false,
      default: 3
    }
  ],
  
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const relativePath = (args.path as string) || '.';
    const recursive = args.recursive as boolean ?? false;
    const showHidden = args.show_hidden as boolean ?? false;
    const maxDepth = args.max_depth as number ?? 3;
    
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
    
    try {
      // Check if path exists and is a directory
      const stats = await fs.stat(absolutePath);
      
      if (!stats.isDirectory()) {
        return {
          success: false,
          output: '',
          error: `Path is not a directory: ${relativePath}`
        };
      }
      
      // List contents
      const entries: FileEntry[] = [];
      
      async function listDir(dirPath: string, currentDepth: number): Promise<void> {
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const item of items) {
          // Skip hidden files unless requested
          if (!showHidden && item.name.startsWith('.')) {
            continue;
          }
          
          const itemPath = path.join(dirPath, item.name);
          const relPath = path.relative(context.workspaceDir, itemPath);
          
          let type: FileEntry['type'] = 'other';
          let size: number | undefined;
          let modified: string | undefined;
          
          if (item.isFile()) {
            type = 'file';
            try {
              const itemStats = await fs.stat(itemPath);
              size = itemStats.size;
              modified = itemStats.mtime.toISOString();
            } catch {
              // Ignore stat errors
            }
          } else if (item.isDirectory()) {
            type = 'directory';
          } else if (item.isSymbolicLink()) {
            type = 'symlink';
          }
          
          entries.push({
            name: relPath,
            type,
            size,
            modified
          });
          
          // Recurse into directories
          if (recursive && type === 'directory' && currentDepth < maxDepth) {
            await listDir(itemPath, currentDepth + 1);
          }
        }
      }
      
      await listDir(absolutePath, 0);
      
      // Sort entries: directories first, then files
      entries.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });
      
      // Format output
      if (entries.length === 0) {
        return {
          success: true,
          output: `Directory is empty: ${relativePath}`,
          metadata: { count: 0 }
        };
      }
      
      const lines = entries.map(entry => {
        const typeIcon = entry.type === 'directory' ? '[DIR]' : 
                         entry.type === 'symlink' ? '[LNK]' : 
                         '[FILE]';
        const sizeStr = entry.size !== undefined ? ` (${formatSize(entry.size)})` : '';
        return `${typeIcon} ${entry.name}${sizeStr}`;
      });
      
      const dirCount = entries.filter(e => e.type === 'directory').length;
      const fileCount = entries.filter(e => e.type === 'file').length;
      
      return {
        success: true,
        output: lines.join('\n') + `\n\nTotal: ${dirCount} directories, ${fileCount} files`,
        metadata: {
          path: relativePath,
          directories: dirCount,
          files: fileCount,
          total: entries.length
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: false,
          output: '',
          error: `Directory not found: ${relativePath}`
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
