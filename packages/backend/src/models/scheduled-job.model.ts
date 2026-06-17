import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Types ───────────────────────────────────────────────────────────────

export type ScheduledJobStatus = "running" | "succeeded" | "failed" | "skipped";
export type ScheduledJobTrigger = "cron" | "manual";

// ── Interface ───────────────────────────────────────────────────────────

export interface IScheduledJobRun extends Document {
  job_name: string;
  status: ScheduledJobStatus;
  started_at: Date;
  finished_at: Date | null;
  duration_ms: number | null;
  trigger: ScheduledJobTrigger;
  triggered_by: mongoose.Types.ObjectId | null;
  summary: string | null;
  error_message: string | null;
  cron_expression: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ──────────────────────────────────────────────────────────────

const ScheduledJobRunSchema = new Schema<IScheduledJobRun>(
  {
    job_name: { type: String, required: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: ["running", "succeeded", "failed", "skipped"],
    },
    started_at: { type: Date, required: true },
    finished_at: { type: Date, default: null },
    duration_ms: { type: Number, default: null },
    trigger: {
      type: String,
      required: true,
      enum: ["cron", "manual"],
    },
    triggered_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    summary: { type: String, default: null },
    error_message: { type: String, default: null },
    cron_expression: { type: String, default: null },
  },
  { timestamps: true },
);

ScheduledJobRunSchema.index({ job_name: 1, started_at: -1 });

// ── Model ───────────────────────────────────────────────────────────────

export const ScheduledJobRunModel = mongoose.model<IScheduledJobRun>(
  "ScheduledJobRun",
  ScheduledJobRunSchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class ScheduledJobRunRepository extends BaseRepository<IScheduledJobRun> {
  constructor() {
    super(ScheduledJobRunModel);
  }

  /**
   * Find the most recent run for a given job name.
   */
  public async findLatestByJobName(
    jobName: string,
    session?: ClientSession,
  ): Promise<IScheduledJobRun | null> {
    const query = this.model
      .findOne({ job_name: jobName })
      .sort({ started_at: -1 });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find runs currently in "running" status for a given job name.
   */
  public async findRunningByJobName(
    jobName: string,
    session?: ClientSession,
  ): Promise<IScheduledJobRun[]> {
    const query = this.model
      .find({ job_name: jobName, status: "running" })
      .sort({ started_at: -1 });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Get recent runs for a job with pagination support.
   */
  public async findRecentByJobName(
    jobName: string,
    limit: number = 20,
    session?: ClientSession,
  ): Promise<IScheduledJobRun[]> {
    const query = this.model
      .find({ job_name: jobName })
      .sort({ started_at: -1 })
      .limit(limit);
    if (session) query.session(session);
    return query.exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const scheduledJobRunRepo = new ScheduledJobRunRepository();
