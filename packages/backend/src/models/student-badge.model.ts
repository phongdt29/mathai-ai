import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Main interface ──────────────────────────────────────────────────────

export interface IStudentBadge extends Document {
  student_id: mongoose.Types.ObjectId;
  badge_id: string;
  earned_at: Date;
  progress: number; // 0..1, 1 = unlocked
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// ── Main schema ─────────────────────────────────────────────────────────

const StudentBadgeSchema = new Schema<IStudentBadge>(
  {
    student_id: {
      type: Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true,
    },
    badge_id: { type: String, required: true, trim: true },
    earned_at: { type: Date, required: true, default: () => new Date() },
    progress: { type: Number, required: true, min: 0, max: 1, default: 0 },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// ── Indexes ─────────────────────────────────────────────────────────────

// Unique partial index: a student can only fully earn (progress=1) a badge once
StudentBadgeSchema.index(
  { student_id: 1, badge_id: 1 },
  {
    unique: true,
    partialFilterExpression: { progress: 1 },
  },
);

StudentBadgeSchema.index({ student_id: 1, createdAt: -1 });
StudentBadgeSchema.index({ badge_id: 1 });

// ── Model ───────────────────────────────────────────────────────────────

export const StudentBadgeModel = mongoose.model<IStudentBadge>(
  "StudentBadge",
  StudentBadgeSchema,
);

// ── Repository ──────────────────────────────────────────────────────────

export class StudentBadgeRepository extends BaseRepository<IStudentBadge> {
  constructor() {
    super(StudentBadgeModel);
  }

  /**
   * Find all badges earned by a student, ordered by most recent first.
   */
  public async findByStudentId(
    studentId: string | mongoose.Types.ObjectId,
    session?: ClientSession,
  ): Promise<IStudentBadge[]> {
    const query = this.model
      .find({ student_id: studentId })
      .sort({ createdAt: -1 });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find a specific student-badge combination (fully earned).
   */
  public async findEarnedBadge(
    studentId: string | mongoose.Types.ObjectId,
    badgeId: string,
    session?: ClientSession,
  ): Promise<IStudentBadge | null> {
    const query = this.model.findOne({
      student_id: studentId,
      badge_id: badgeId,
      progress: 1,
    });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Upsert a student badge entry. If already earned (progress=1), no-op.
   * Used for awarding badges idempotently.
   */
  public async awardBadge(
    studentId: string | mongoose.Types.ObjectId,
    badgeId: string,
    metadata?: Record<string, unknown> | null,
    session?: ClientSession,
  ): Promise<IStudentBadge> {
    const result = await this.model.findOneAndUpdate(
      { student_id: studentId, badge_id: badgeId, progress: 1 },
      {
        $setOnInsert: {
          student_id: studentId,
          badge_id: badgeId,
          earned_at: new Date(),
          progress: 1,
          metadata: metadata ?? null,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        session: session ?? undefined,
      },
    );
    return result as IStudentBadge;
  }

  /**
   * Count badges earned by a student.
   */
  public async countByStudentId(
    studentId: string | mongoose.Types.ObjectId,
    session?: ClientSession,
  ): Promise<number> {
    const query = this.model.countDocuments({
      student_id: studentId,
      progress: 1,
    });
    if (session) query.session(session);
    return query.exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const studentBadgeRepository = new StudentBadgeRepository();
