// ============================================================================
// Read File Tool - Read file contents
// ============================================================================

import fs from 'fs/promises';
import path from 'path';
import type { ToolDefinition, ToolContext, ToolResult } from '../../lib/types';
import { getConfig } from '../config';

// Binary file extensions that shouldn't be read as text
const BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.webm',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.dll', '.so', '.dylib',
  '.wasm', '.bin'
];

function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.includes(ext);
}

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file. Returns the file content as text. Use this to examine code, configuration files, or any text-based files.',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file (relative to workspace)',
      required: true
    },
    {
      name: 'start_line',
      type: 'number',
      description: 'Starting line number (1-indexed, optional)',
      required: false
    },
    {
      name: 'end_line',
      type: 'number',
      description: 'Ending line number (inclusive, optional)',
      required: false
    }
  ],
  
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const config = getConfig();
    const relativePath = args.path as string;
    const startLine = args.start_line as number | undefined;
    const endLine = args.end_line as number | undefined;
    
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
    
    // Check if file is binary
    if (isBinaryFile(absolutePath)) {
      return {
        success: false,
        output: '',
        error: `Cannot read binary file: ${relativePath}. Use bash tool with appropriate commands for binary files.`
      };
    }
    
    try {
      // Check file exists
      const stats = await fs.stat(absolutePath);
      
      if (stats.isDirectory()) {
        return {
          success: false,
          output: '',
          error: `Path is a directory, not a file. Use list_dir tool instead.`
        };
      }
      
      // Check file size
      if (stats.size > config.tools.max_file_size) {
        return {
          success: false,
          output: '',
          error: `File too large (${stats.size} bytes). Maximum allowed: ${config.tools.max_file_size} bytes. Use start_line and end_line to read a portion.`
        };
      }
      
      // Read file content
      const content = await fs.readFile(absolutePath, 'utf-8');
      
      // Handle line range if specified
      if (startLine !== undefined || endLine !== undefined) {
        const lines = content.split('\n');
        const start = Math.max(1, startLine || 1) - 1;
        const end = Math.min(lines.length, endLine || lines.length);
        
        const selectedLines = lines.slice(start, end);
        const numberedLines = selectedLines.map((line, i) => `${start + i + 1}: ${line}`);
        
        return {
          success: true,
          output: numberedLines.join('\n'),
          metadata: {
            totalLines: lines.length,
            startLine: start + 1,
            endLine: end,
            fileSize: stats.size
          }
        };
      }
      
      // Return full content with line numbers for larger files
      const lines = content.split('\n');
      let output = content;
      
      if (lines.length > 50) {
        // Add line numbers for larger files
        output = lines.map((line, i) => `${i + 1}: ${line}`).join('\n');
      }
      
      return {
        success: true,
        output,
        metadata: {
          totalLines: lines.length,
          fileSize: stats.size
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: false,
          output: '',
          error: `File not found: ${relativePath}`
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
