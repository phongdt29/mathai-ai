import cron, { type ScheduledTask } from "node-cron";
import {
  scheduledJobRunRepo,
  type IScheduledJobRun,
  type ScheduledJobStatus,
  type ScheduledJobTrigger,
} from "../models/scheduled-job.model";
import { auditService, type AuditActor } from "./audit.service";

// ── Types ───────────────────────────────────────────────────────────────

export interface ScheduledJobSummary {
  ok: boolean;
  metrics: Record<string, number>;
  notes?: string[];
}

export interface ScheduledJobContext {
  jobName: string;
  trigger: ScheduledJobTrigger;
  triggeredBy?: string | null;
  signal?: AbortSignal;
}

export interface ScheduledJobDefinition {
  name: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  run: (context: ScheduledJobContext) => Promise<ScheduledJobSummary>;
  lockTimeoutMs: number;
}

export interface ScheduledJobInfo {
  name: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  lockTimeoutMs: number;
  lastRunAt: Date | null;
  lastStatus: ScheduledJobStatus | null;
}

// ── Service ─────────────────────────────────────────────────────────────

export class SchedulerService {
  private readonly jobs: Map<string, ScheduledJobDefinition> = new Map();
  private readonly tasks: Map<string, ScheduledTask> = new Map();
  private running = false;

  /**
   * Register a job definition. Must be called before start().
   * Throws if a job with the same name is already registered.
   */
  public registerJob(def: ScheduledJobDefinition): void {
    if (this.jobs.has(def.name)) {
      throw new Error(`Job "${def.name}" is already registered`);
    }
    if (!cron.validate(def.cronExpression)) {
      throw new Error(
        `Invalid cron expression "${def.cronExpression}" for job "${def.name}"`,
      );
    }
    this.jobs.set(def.name, def);
  }

  /**
   * Start all registered cron jobs.
   * Uses SCHEDULER_TIMEZONE env or falls back to each job's timezone config.
   */
  public async start(): Promise<void> {
    if (this.running) return;

    const globalTimezone =
      process.env.SCHEDULER_TIMEZONE || "Asia/Ho_Chi_Minh";

    for (const [name, def] of this.jobs) {
      if (!def.enabled) continue;

      const timezone = def.timezone || globalTimezone;
      const task = cron.schedule(
        def.cronExpression,
        () => {
          void this.executeJob(name, "cron");
        },
        { timezone },
      );

      this.tasks.set(name, task);
    }

    this.running = true;
  }

  /**
   * Stop all cron tasks gracefully.
   */
  public async stop(): Promise<void> {
    for (const [, task] of this.tasks) {
      task.stop();
    }
    this.tasks.clear();
    this.running = false;
  }

  /**
   * Manually trigger a job by name.
   * Persists a ScheduledJobRun with trigger="manual".
   */
  public async runNow(
    jobName: string,
    triggeredBy?: string | null,
  ): Promise<ScheduledJobSummary> {
    const def = this.jobs.get(jobName);
    if (!def) {
      throw new Error(`Job "${jobName}" is not registered`);
    }

    return this.executeJob(jobName, "manual", triggeredBy ?? null);
  }

  /**
   * List all registered jobs with their last run metadata.
   */
  public async listJobs(): Promise<ScheduledJobInfo[]> {
    const result: ScheduledJobInfo[] = [];

    for (const [, def] of this.jobs) {
      const lastRun = await scheduledJobRunRepo.findLatestByJobName(def.name);
      result.push({
        name: def.name,
        cronExpression: def.cronExpression,
        timezone: def.timezone,
        enabled: def.enabled,
        lockTimeoutMs: def.lockTimeoutMs,
        lastRunAt: lastRun?.started_at ?? null,
        lastStatus: lastRun?.status ?? null,
      });
    }

    return result;
  }

  /**
   * Get recent runs for a specific job.
   */
  public async getRecentRuns(
    jobName: string,
    limit: number = 20,
  ): Promise<IScheduledJobRun[]> {
    return scheduledJobRunRepo.findRecentByJobName(jobName, limit);
  }

  // ── Private ─────────────────────────────────────────────────────────

  /**
   * Core execution logic with lock mechanism.
   *
   * Lock mechanism:
   * 1. Check if there's a ScheduledJobRun with status="running" and
   *    started_at within lockTimeoutMs.
   * 2. If locked → persist a "skipped" run and return early.
   * 3. If not locked → persist "running", execute handler, then update
   *    to "succeeded" or "failed".
   */
  private async executeJob(
    jobName: string,
    trigger: ScheduledJobTrigger,
    triggeredBy?: string | null,
  ): Promise<ScheduledJobSummary> {
    const def = this.jobs.get(jobName);
    if (!def) {
      throw new Error(`Job "${jobName}" is not registered`);
    }

    const startedAt = new Date();

    // ── Lock check ──────────────────────────────────────────────────
    const isLocked = await this.isJobLocked(jobName, def.lockTimeoutMs);

    if (isLocked) {
      // Persist a skipped run
      await scheduledJobRunRepo.create({
        job_name: jobName,
        status: "skipped",
        started_at: startedAt,
        finished_at: new Date(),
        duration_ms: 0,
        trigger,
        triggered_by: triggeredBy ?? null,
        summary: "Skipped: another instance is still running",
        error_message: null,
        cron_expression: def.cronExpression,
      } as Partial<IScheduledJobRun>);

      return {
        ok: false,
        metrics: { skipped: 1 },
        notes: ["Job skipped due to active lock"],
      };
    }

    // ── Persist "running" state ─────────────────────────────────────
    const runRecord = await scheduledJobRunRepo.create({
      job_name: jobName,
      status: "running",
      started_at: startedAt,
      finished_at: null,
      duration_ms: null,
      trigger,
      triggered_by: triggeredBy ?? null,
      summary: null,
      error_message: null,
      cron_expression: def.cronExpression,
    } as Partial<IScheduledJobRun>);

    // ── Execute handler ─────────────────────────────────────────────
    try {
      const context: ScheduledJobContext = {
        jobName,
        trigger,
        triggeredBy: triggeredBy ?? null,
      };

      const summary = await def.run(context);
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      // Update to succeeded
      await scheduledJobRunRepo.update(runRecord.id, {
        status: "succeeded",
        finished_at: finishedAt,
        duration_ms: durationMs,
        summary: JSON.stringify(summary.metrics),
      } as Partial<IScheduledJobRun>);

      return summary;
    } catch (error) {
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Update to failed
      await scheduledJobRunRepo.update(runRecord.id, {
        status: "failed",
        finished_at: finishedAt,
        duration_ms: durationMs,
        error_message: errorMessage,
      } as Partial<IScheduledJobRun>);

      return {
        ok: false,
        metrics: { failed: 1 },
        notes: [errorMessage],
      };
    }
  }

  /**
   * Check if a job is currently locked (has a running instance within lockTimeoutMs).
   */
  private async isJobLocked(
    jobName: string,
    lockTimeoutMs: number,
  ): Promise<boolean> {
    const runningJobs =
      await scheduledJobRunRepo.findRunningByJobName(jobName);

    if (runningJobs.length === 0) return false;

    const now = Date.now();
    for (const run of runningJobs) {
      const elapsed = now - run.started_at.getTime();
      if (elapsed < lockTimeoutMs) {
        // There's a running job that hasn't exceeded the lock timeout
        return true;
      }
    }

    // All running jobs have exceeded lockTimeoutMs — treat as stale
    return false;
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const schedulerService = new SchedulerService();
export default schedulerService;
