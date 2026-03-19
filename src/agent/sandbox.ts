// ============================================================================
// Agent Sandbox — isolated filesystem workspace per task
// ============================================================================

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface SandboxOptions {
  baseDir?: string;       // Parent directory for sandbox (defaults to os.tmpdir())
  copyFrom?: string;      // Clone an existing directory into the sandbox
  maxDiskMB?: number;     // Soft disk usage limit in MB (not enforced at OS level)
  taskId?: string;        // Label for the sandbox directory
}

export interface SandboxStats {
  path: string;
  taskId: string;
  created: Date;
  exists: boolean;
  diskUsageMB?: number;
}

/**
 * A temporary isolated directory for one agent task.
 * Created on demand, destroyed when the task finishes.
 */
export class AgentSandbox {
  public readonly sandboxPath: string;
  public readonly taskId: string;
  private readonly maxDiskMB: number;
  private readonly created: Date;

  constructor(opts: SandboxOptions = {}) {
    const base = opts.baseDir ?? path.join(os.tmpdir(), 'octogent-sandboxes');
    const label = opts.taskId ?? `task-${Date.now()}`;
    this.taskId = label;
    this.sandboxPath = path.join(base, label);
    this.maxDiskMB = opts.maxDiskMB ?? 500;
    this.created = new Date();
  }

  /** Create the sandbox directory (and optionally copy source files) */
  async create(): Promise<void> {
    fs.mkdirSync(this.sandboxPath, { recursive: true });
  }

  /** Populate the sandbox by cloning a source directory */
  async cloneFrom(sourceDir: string): Promise<void> {
    await this.create();

    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Source directory does not exist: ${sourceDir}`);
    }

    await execFileAsync('cp', ['-r', `${sourceDir}/.`, this.sandboxPath], {
      timeout: 60_000,
    });
  }

  /** Resolve a relative path against the sandbox root */
  resolve(relativePath: string): string {
    const abs = path.isAbsolute(relativePath)
      ? relativePath
      : path.join(this.sandboxPath, relativePath);

    // Prevent path traversal outside sandbox
    if (!abs.startsWith(this.sandboxPath)) {
      throw new Error(`Path escapes sandbox: ${relativePath}`);
    }

    return abs;
  }

  /** Read a file from the sandbox */
  readFile(relativePath: string, encoding: BufferEncoding = 'utf-8'): string {
    return fs.readFileSync(this.resolve(relativePath), encoding);
  }

  /** Write a file inside the sandbox */
  writeFile(relativePath: string, content: string): void {
    const abs = this.resolve(relativePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  }

  /** List files in the sandbox (relative paths) */
  listFiles(subdir = '.'): string[] {
    const abs = this.resolve(subdir);
    if (!fs.existsSync(abs)) return [];
    return this.walkDir(abs, abs);
  }

  private walkDir(dir: string, root: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.walkDir(full, root));
      } else {
        results.push(path.relative(root, full));
      }
    }
    return results;
  }

  /** Get current disk usage in MB */
  async diskUsageMB(): Promise<number> {
    try {
      const { stdout } = await execFileAsync('du', ['-sm', this.sandboxPath], {
        timeout: 10_000,
      });
      return parseInt(stdout.split('\t')[0], 10) || 0;
    } catch {
      return 0;
    }
  }

  /** Check if disk usage exceeds the configured limit */
  async isOverLimit(): Promise<boolean> {
    const used = await this.diskUsageMB();
    return used > this.maxDiskMB;
  }

  /** Get sandbox stats */
  async stats(): Promise<SandboxStats> {
    const diskUsageMB = await this.diskUsageMB();
    return {
      path: this.sandboxPath,
      taskId: this.taskId,
      created: this.created,
      exists: fs.existsSync(this.sandboxPath),
      diskUsageMB,
    };
  }

  /** Destroy the sandbox (delete directory) */
  async destroy(): Promise<void> {
    if (fs.existsSync(this.sandboxPath)) {
      fs.rmSync(this.sandboxPath, { recursive: true, force: true });
    }
  }
}

/** Factory: create + initialize a sandbox for a task */
export async function createSandbox(opts: SandboxOptions = {}): Promise<AgentSandbox> {
  const sandbox = new AgentSandbox(opts);
  await sandbox.create();
  return sandbox;
}
