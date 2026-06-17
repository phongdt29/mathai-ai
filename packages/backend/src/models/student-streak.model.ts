import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Main interface ──────────────────────────────────────────────────────

export interface IStudentStreak extends Document {
  student_id: mongoose.Types.ObjectId;
  current_streak_days: number;
  longest_streak_days: number;
  last_active_date: string; // YYYY-MM-DD
  break_count_30d: number;
  updatedAt: Date;
}

// ── Main schema ─────────────────────────────────────────────────────────

const StudentStreakSchema = new Schema<IStudentStreak>(
  {
    student_id: {
      type: Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true,
      unique: true,
    },
    current_streak_days: { type: Number, required: true, min: 0, default: 0 },
    longest_streak_days: { type: Number, required: true, min: 0, default: 0 },
    last_active_date: { type: String, required: true, trim: true }, // YYYY-MM-DD
    break_count_30d: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

// ── Indexes ─────────────────────────────────────────────────────────────

// student_id is already unique via schema definition
StudentStreakSchema.index({ current_streak_days: -1 });

// ── Model ───────────────────────────────────────────────────────────────

export const StudentStreakModel = mongoose.model<IStudentStreak>(
  "StudentStreak",
  StudentStreakSchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class StudentStreakRepository extends BaseRepository<IStudentStreak> {
  constructor() {
    super(StudentStreakModel);
  }

  /**
   * Find streak record for a student.
   */
  public async findByStudentId(
    studentId: string | mongoose.Types.ObjectId,
    session?: ClientSession,
  ): Promise<IStudentStreak | null> {
    const query = this.model.findOne({ student_id: studentId });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Upsert streak for a student. Used by gamification.service.updateStreakOnSession.
   * Returns the updated document.
   */
  public async upsertStreak(
    studentId: string | mongoose.Types.ObjectId,
    update: {
      current_streak_days: number;
      longest_streak_days: number;
      last_active_date: string;
      break_count_30d: number;
    },
    session?: ClientSession,
  ): Promise<IStudentStreak> {
    const result = await this.model.findOneAndUpdate(
      { student_id: studentId },
      {
        $set: {
          current_streak_days: update.current_streak_days,
          longest_streak_days: update.longest_streak_days,
          last_active_date: update.last_active_date,
          break_count_30d: update.break_count_30d,
        },
        $setOnInsert: {
          student_id: studentId,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        session: session ?? undefined,
      },
    );
    return result as IStudentStreak;
  }

  /**
   * Find top streaks for leaderboard purposes.
   */
  public async findTopStreaks(
    limit: number = 10,
    session?: ClientSession,
  ): Promise<IStudentStreak[]> {
    const query = this.model
      .find({ current_streak_days: { $gt: 0 } })
      .sort({ current_streak_days: -1 })
      .limit(limit);
    if (session) query.session(session);
    return query.exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const studentStreakRepository = new StudentStreakRepository();
