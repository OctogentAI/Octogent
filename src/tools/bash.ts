// ============================================================================
// Bash Tool - Execute shell commands
// ============================================================================

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import type { ToolDefinition, ToolContext, ToolResult } from '../../lib/types';
import { getConfig } from '../config';

const execFileAsync = promisify(execFile);

// Dangerous commands that should be blocked
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf ~',
  'rm -rf /*',
  ':(){:|:&};:',
  'mkfs',
  'dd if=/dev/zero',
  'dd if=/dev/random',
  '> /dev/sda',
  'chmod -R 777 /',
  'chown -R'
];

// Commands that are restricted (require explicit workspace path)
const RESTRICTED_PATTERNS = [
  /rm\s+-rf?\s+\//,
  /rm\s+-rf?\s+~/,
  /chmod\s+.*\//,
  /chown\s+.*\//
];

function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  const normalizedCommand = command.toLowerCase().trim();
  
  // Check blocked commands
  for (const blocked of BLOCKED_COMMANDS) {
    if (normalizedCommand.includes(blocked.toLowerCase())) {
      return { safe: false, reason: `Command contains blocked pattern: ${blocked}` };
    }
  }
  
  // Check restricted patterns
  for (const pattern of RESTRICTED_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason: `Command matches restricted pattern` };
    }
  }
  
  return { safe: true };
}

export const bashTool: ToolDefinition = {
  name: 'bash',
  description: 'Execute a shell command in the workspace directory. Use this for file operations, running scripts, git commands, and system tasks.',
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'The shell command to execute',
      required: true
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Timeout in milliseconds (default: from config)',
      required: false
    },
    {
      name: 'cwd',
      type: 'string',
      description: 'Working directory (relative to workspace, default: workspace root)',
      required: false
    }
  ],
  
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const config = getConfig();
    const command = args.command as string;
    const timeout = (args.timeout as number) || config.tools.bash_timeout;
    const relativeCwd = args.cwd as string | undefined;
    
    // Safety check
    const safetyCheck = isCommandSafe(command);
    if (!safetyCheck.safe) {
      return {
        success: false,
        output: '',
        error: `Command blocked: ${safetyCheck.reason}`
      };
    }
    
    // Determine working directory (sandbox to workspace)
    let cwd = context.workspaceDir;
    if (relativeCwd) {
      const resolvedCwd = path.resolve(context.workspaceDir, relativeCwd);
      // Ensure it's within workspace
      if (!resolvedCwd.startsWith(context.workspaceDir)) {
        return {
          success: false,
          output: '',
          error: 'Working directory must be within the workspace'
        };
      }
      cwd = resolvedCwd;
    }
    
    try {
      // Use spawn for better control and output handling
      return await new Promise<ToolResult>((resolve) => {
        const parts = command.split(' ');
        const cmd = parts[0];
        const cmdArgs = parts.slice(1);
        
        // Use shell for complex commands
        const proc = spawn('sh', ['-c', command], {
          cwd,
          timeout,
          env: {
            ...process.env,
            HOME: context.workspaceDir,
            PATH: process.env.PATH
          }
        });
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        proc.on('close', (code) => {
          const output = stdout + (stderr ? `\n[stderr]: ${stderr}` : '');
          
          if (code === 0) {
            resolve({
              success: true,
              output: output.trim() || '(no output)',
              metadata: { exitCode: code }
            });
          } else {
            resolve({
              success: false,
              output: output.trim(),
              error: `Command exited with code ${code}`,
              metadata: { exitCode: code }
            });
          }
        });
        
        proc.on('error', (error) => {
          resolve({
            success: false,
            output: '',
            error: `Failed to execute command: ${error.message}`
          });
        });
        
        // Handle abort signal
        if (context.abortSignal) {
          context.abortSignal.addEventListener('abort', () => {
            proc.kill('SIGTERM');
          });
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('ETIMEDOUT')) {
        return {
          success: false,
          output: '',
          error: `Command timed out after ${timeout}ms`
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
