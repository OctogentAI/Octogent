// ============================================================================
// Cron Channel - Scheduled task execution
// ============================================================================

import { loadConfig, getConfig } from '../config';
import type { CronJob, CronJobConfig } from '../../lib/types';

// Simple cron parser (minute hour day month weekday)
function parseCron(expression: string): { minute: number | null; hour: number | null; day: number | null; month: number | null; weekday: number | null } {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${expression}`);
  }

  const parse = (value: string, max: number): number | null => {
    if (value === '*') return null;
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0 || num > max) {
      throw new Error(`Invalid cron value: ${value}`);
    }
    return num;
  };

  return {
    minute: parse(parts[0], 59),
    hour: parse(parts[1], 23),
    day: parse(parts[2], 31),
    month: parse(parts[3], 12),
    weekday: parse(parts[4], 6)
  };
}

function shouldRun(schedule: ReturnType<typeof parseCron>, now: Date): boolean {
  const minute = now.getMinutes();
  const hour = now.getHours();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const weekday = now.getDay();

  return (
    (schedule.minute === null || schedule.minute === minute) &&
    (schedule.hour === null || schedule.hour === hour) &&
    (schedule.day === null || schedule.day === day) &&
    (schedule.month === null || schedule.month === month) &&
    (schedule.weekday === null || schedule.weekday === weekday)
  );
}

export class CronScheduler {
  private jobs: Map<string, CronJob> = new Map();
  private timerId: ReturnType<typeof setInterval> | null = null;
  private submitTask: (task: string, sessionId: string) => Promise<string>;
  private lastCheck: Date = new Date();

  constructor(submitTask: (task: string, sessionId: string) => Promise<string>) {
    this.submitTask = submitTask;
  }

  /**
   * Load cron jobs from config
   */
  loadFromConfig(): void {
    const config = getConfig();
    const cronJobs = config.cron || [];

    this.jobs.clear();

    for (const jobConfig of cronJobs) {
      this.addJob(jobConfig);
    }

    console.log(`[cron] Loaded ${this.jobs.size} cron jobs`);
  }

  /**
   * Add a cron job
   */
  addJob(config: CronJobConfig): CronJob {
    try {
      const schedule = parseCron(config.schedule);
      
      const job: CronJob = {
        id: config.id || `cron-${Date.now()}`,
        name: config.name,
        schedule: config.schedule,
        task: config.task,
        enabled: config.enabled ?? true,
        last_run: null,
        next_run: this.calculateNextRun(schedule),
        created_at: Date.now()
      };

      this.jobs.set(job.id, job);
      console.log(`[cron] Added job: ${job.name} (${job.schedule})`);
      
      return job;
    } catch (error) {
      console.error(`[cron] Failed to add job "${config.name}":`, error);
      throw error;
    }
  }

  /**
   * Remove a cron job
   */
  removeJob(id: string): boolean {
    const deleted = this.jobs.delete(id);
    if (deleted) {
      console.log(`[cron] Removed job: ${id}`);
    }
    return deleted;
  }

  /**
   * Enable/disable a job
   */
  setJobEnabled(id: string, enabled: boolean): void {
    const job = this.jobs.get(id);
    if (job) {
      job.enabled = enabled;
      console.log(`[cron] Job ${id} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Get all jobs
   */
  getJobs(): CronJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Calculate next run time for a schedule
   */
  private calculateNextRun(schedule: ReturnType<typeof parseCron>): number {
    const now = new Date();
    const next = new Date(now);
    
    // Simple approximation - find next matching minute
    for (let i = 0; i < 60 * 24 * 31; i++) { // Max 31 days ahead
      next.setMinutes(next.getMinutes() + 1);
      if (shouldRun(schedule, next)) {
        return next.getTime();
      }
    }
    
    // Fallback to 1 hour from now
    return now.getTime() + 3600000;
  }

  /**
   * Check and run due jobs
   */
  private async tick(): Promise<void> {
    const now = new Date();
    
    // Only check once per minute
    if (now.getMinutes() === this.lastCheck.getMinutes()) {
      return;
    }
    this.lastCheck = now;

    for (const job of this.jobs.values()) {
      if (!job.enabled) continue;

      try {
        const schedule = parseCron(job.schedule);
        
        if (shouldRun(schedule, now)) {
          console.log(`[cron] Running job: ${job.name}`);
          
          const sessionId = `cron-${job.id}-${Date.now()}`;
          await this.submitTask(job.task, sessionId);
          
          job.last_run = Date.now();
          job.next_run = this.calculateNextRun(schedule);
          job.run_count = (job.run_count || 0) + 1;
        }
      } catch (error) {
        console.error(`[cron] Error running job "${job.name}":`, error);
        job.last_error = error instanceof Error ? error.message : 'Unknown error';
      }
    }
  }

  /**
   * Start the cron scheduler
   */
  start(): void {
    if (this.timerId) {
      console.warn('[cron] Scheduler already running');
      return;
    }

    this.loadFromConfig();
    
    // Check every 10 seconds
    this.timerId = setInterval(() => {
      this.tick().catch(console.error);
    }, 10000);

    console.log('[cron] Scheduler started');
  }

  /**
   * Stop the cron scheduler
   */
  stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
      console.log('[cron] Scheduler stopped');
    }
  }

  /**
   * Reload jobs from config
   */
  reload(): void {
    this.loadFromConfig();
  }
}

// Example cron configuration for octogent.config.json:
/*
{
  "cron": [
    {
      "id": "daily-backup",
      "name": "Daily Backup",
      "schedule": "0 2 * * *",
      "task": "Create a backup of all important files in the workspace",
      "enabled": true
    },
    {
      "id": "hourly-check",
      "name": "Hourly Health Check",
      "schedule": "0 * * * *",
      "task": "Check system health and report any issues",
      "enabled": true
    }
  ]
}
*/
