// ============================================================================
// Octogent - Git Tool for Version Control Operations
// ============================================================================

import { spawn } from 'child_process';
import path from 'path';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { logger } from '../utils/logger.js';
import { ToolExecutionError, ToolTimeoutError } from '../utils/errors.js';

interface GitArgs {
  command: 'status' | 'diff' | 'log' | 'branch' | 'add' | 'commit' | 'show' | 'blame';
  args?: string[];
  timeout?: number;
}

const ALLOWED_COMMANDS = new Set([
  'status', 'diff', 'log', 'branch', 'add', 'commit', 'show', 'blame',
  'stash', 'fetch', 'pull', 'push', 'checkout', 'reset', 'revert',
]);

// Commands that should never be allowed for safety
const DANGEROUS_ARGS = new Set([
  '--force', '-f', '--hard', '--delete', '-D',
]);

export const gitTool: ToolDefinition = {
  name: 'git',
  description: `Execute git commands for version control operations.

Safe commands available:
- status: Show working tree status
- diff: Show file changes
- log: Show commit history
- branch: List or show branches
- add: Stage files for commit
- commit: Create a commit
- show: Show commit details
- blame: Show line-by-line authorship

Note: Destructive operations like force push are restricted.`,
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'Git command to execute',
      required: true,
    },
    {
      name: 'args',
      type: 'array',
      description: 'Additional arguments for the command',
      required: false,
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Command timeout in milliseconds',
      required: false,
      default: 30000,
    },
  ],
  execute: async (args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
    const {
      command,
      args: gitArgs = [],
      timeout = 30000,
    } = args as GitArgs;

    // Validate command
    if (!ALLOWED_COMMANDS.has(command)) {
      return {
        success: false,
        output: '',
        error: `Git command not allowed: ${command}. Allowed commands: ${Array.from(ALLOWED_COMMANDS).join(', ')}`,
      };
    }

    // Check for dangerous arguments
    const argsArray = gitArgs as string[];
    for (const arg of argsArray) {
      if (DANGEROUS_ARGS.has(arg)) {
        return {
          success: false,
          output: '',
          error: `Dangerous argument not allowed: ${arg}`,
        };
      }
    }

    logger.debug(`Git: ${command} ${argsArray.join(' ')}`);

    try {
      const result = await executeGit(
        [command, ...argsArray],
        context.workspaceDir,
        timeout,
        context.abortSignal
      );

      return {
        success: result.exitCode === 0,
        output: result.stdout || result.stderr || '(no output)',
        error: result.exitCode !== 0 ? result.stderr : undefined,
        metadata: {
          exitCode: result.exitCode,
          command: `git ${command} ${argsArray.join(' ')}`.trim(),
        },
      };
    } catch (error) {
      if (error instanceof ToolTimeoutError) {
        return {
          success: false,
          output: '',
          error: `Git command timed out after ${timeout}ms`,
        };
      }

      throw new ToolExecutionError(
        'git',
        `Git command failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  },
};

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function executeGit(
  args: string[],
  cwd: string,
  timeout: number,
  abortSignal?: AbortSignal
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0', // Disable interactive prompts
      },
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      reject(new ToolTimeoutError('git', timeout));
    }, timeout);

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        killed = true;
        proc.kill('SIGTERM');
        clearTimeout(timeoutId);
        reject(new Error('Git command aborted'));
      }, { once: true });
    }

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      // Limit output size
      if (stdout.length > 1000000) {
        proc.kill('SIGTERM');
        killed = true;
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      if (!killed) {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? 1,
        });
      }
    });

    proc.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

// Helper functions for common git operations
export async function getGitStatus(workspaceDir: string): Promise<string> {
  const result = await executeGit(['status', '--short'], workspaceDir, 10000);
  return result.stdout;
}

export async function getGitDiff(workspaceDir: string, staged = false): Promise<string> {
  const args = staged ? ['diff', '--staged'] : ['diff'];
  const result = await executeGit(args, workspaceDir, 30000);
  return result.stdout;
}

export async function getGitLog(workspaceDir: string, count = 10): Promise<string> {
  const result = await executeGit(
    ['log', `--oneline`, `-${count}`],
    workspaceDir,
    10000
  );
  return result.stdout;
}

export async function isGitRepository(dir: string): Promise<boolean> {
  try {
    const result = await executeGit(['rev-parse', '--git-dir'], dir, 5000);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export default gitTool;
