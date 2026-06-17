import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Interface ───────────────────────────────────────────────────────────

export interface IAnalyticsLessonEngagement extends Document {
  date: string; // ISO date string YYYY-MM-DD (ICT)
  lesson_id: mongoose.Types.ObjectId;
  student_count: number;
  avg_active_minutes: number; // average active minutes per student
  avg_focus_ratio: number; // 0..1, average focus ratio across students
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ──────────────────────────────────────────────────────────────

const AnalyticsLessonEngagementSchema = new Schema<IAnalyticsLessonEngagement>(
  {
    date: { type: String, required: true, trim: true },
    lesson_id: { type: Schema.Types.ObjectId, ref: "Lesson", required: true },
    student_count: { type: Number, required: true, min: 0, default: 0 },
    avg_active_minutes: { type: Number, required: true, min: 0, default: 0 },
    avg_focus_ratio: { type: Number, required: true, min: 0, max: 1, default: 0 },
  },
  { timestamps: true },
);

// ── Indexes ─────────────────────────────────────────────────────────────

// Compound unique key: one document per (date, lesson_id)
AnalyticsLessonEngagementSchema.index({ date: 1, lesson_id: 1 }, { unique: true });

// Support queries filtering by date range
AnalyticsLessonEngagementSchema.index({ date: 1 });

// ── Model ───────────────────────────────────────────────────────────────

export const AnalyticsLessonEngagementModel = mongoose.model<IAnalyticsLessonEngagement>(
  "AnalyticsLessonEngagement",
  AnalyticsLessonEngagementSchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class AnalyticsLessonEngagementRepository extends BaseRepository<IAnalyticsLessonEngagement> {
  constructor() {
    super(AnalyticsLessonEngagementModel);
  }

  /**
   * Upsert a lesson engagement record for a given date and lesson.
   * Idempotent: running twice for the same (date, lesson_id) produces the same final state.
   */
  public async upsertDaily(
    date: string,
    lessonId: string,
    data: { student_count: number; avg_active_minutes: number; avg_focus_ratio: number },
    session?: ClientSession,
  ): Promise<IAnalyticsLessonEngagement> {
    const result = await this.model.findOneAndUpdate(
      { date, lesson_id: lessonId },
      {
        $set: {
          student_count: data.student_count,
          avg_active_minutes: data.avg_active_minutes,
          avg_focus_ratio: data.avg_focus_ratio,
        },
      },
      { upsert: true, new: true, session: session ?? undefined },
    );
    return result as IAnalyticsLessonEngagement;
  }

  /**
   * Find engagement records within a date range, optionally filtered by lesson.
   */
  public async findByDateRange(
    from: string,
    to: string,
    lessonId?: string,
    session?: ClientSession,
  ): Promise<IAnalyticsLessonEngagement[]> {
    const filter: Record<string, unknown> = { date: { $gte: from, $lte: to } };
    if (lessonId) filter.lesson_id = lessonId;
    const query = this.model.find(filter).sort({ date: 1, lesson_id: 1 });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find engagement records for a specific lesson across all dates.
   */
  public async findByLessonId(
    lessonId: string,
    limit: number = 30,
    session?: ClientSession,
  ): Promise<IAnalyticsLessonEngagement[]> {
    const query = this.model
      .find({ lesson_id: lessonId })
      .sort({ date: -1 })
      .limit(limit);
    if (session) query.session(session);
    return query.exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const analyticsLessonEngagementRepo = new AnalyticsLessonEngagementRepository();
