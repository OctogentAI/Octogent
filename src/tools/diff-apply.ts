// ============================================================================
// Tool: diff_apply — apply a unified diff patch to files in the workspace
// ============================================================================

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';

const execFileAsync = promisify(execFile);

export interface DiffApplyArgs {
  patch: string;
  dry_run?: boolean;
  strip?: number;
}

async function executeDiffApply(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const { patch, dry_run = false, strip = 1 } = args as DiffApplyArgs;

  if (!patch || typeof patch !== 'string') {
    return { success: false, output: '', error: 'patch is required' };
  }

  // Write patch to temp file
  const tmpFile = path.join(tmpdir(), `octogent-patch-${Date.now()}.diff`);
  fs.writeFileSync(tmpFile, patch, 'utf-8');

  const patchArgs = [
    `--strip=${strip}`,
    '--reject-file=/dev/null',
    '--batch',
  ];

  if (dry_run) {
    patchArgs.push('--dry-run');
  }

  patchArgs.push(`--input=${tmpFile}`);

  try {
    const { stdout, stderr } = await execFileAsync('patch', patchArgs, {
      cwd: context.workspaceDir,
      timeout: 30_000,
    });

    fs.unlinkSync(tmpFile);

    const output = [
      dry_run ? '[Dry run — no files were modified]' : '[Patch applied successfully]',
      stdout.trim(),
      stderr.trim(),
    ]
      .filter(Boolean)
      .join('\n');

    return { success: true, output };
  } catch (err: unknown) {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    const e = err as Error & { stdout?: string; stderr?: string };
    const details = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n');
    return {
      success: false,
      output: '',
      error: `patch failed:\n${details}`,
    };
  }
}

export const diffApplyTool: ToolDefinition = {
  name: 'diff_apply',
  description:
    'Apply a unified diff (patch) to files in the workspace. ' +
    'Supports dry-run mode to preview changes without modifying files.',
  parameters: [
    {
      name: 'patch',
      type: 'string',
      description: 'The unified diff content to apply.',
      required: true,
    },
    {
      name: 'dry_run',
      type: 'boolean',
      description: 'If true, preview the patch without modifying files. Default: false.',
      required: false,
      default: false,
    },
    {
      name: 'strip',
      type: 'number',
      description: 'Number of leading path components to strip (patch -p). Default: 1.',
      required: false,
      default: 1,
    },
  ],
  execute: executeDiffApply,
};
