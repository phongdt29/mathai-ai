import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';
import type { JsonObject, UserRole } from '../types';

export type FraudSignalSourceType = 'solver' | 'chat' | 'ai_log' | 'assessment' | 'manual' | 'system';
export type FraudSignalType =
  | 'rapid_repeated_solver_requests'
  | 'high_full_solution_dependency'
  | 'solver_usage_near_assessment'
  | 'repeated_flagged_safety_events'
  | 'rapid_assessment_submission'
  | 'abnormal_score_jump'
  | 'duplicate_answer_pattern'
  | 'excessive_answer_changes'
  | 'other_risk_signal';
export type FraudSignalRiskLevel = 'informational' | 'low' | 'medium' | 'high';
export type FraudSignalStatus = 'pending_review' | 'reviewed' | 'dismissed' | 'resolved';

export interface FraudSignalActorContext {
  userId?: mongoose.Types.ObjectId | null;
  role?: UserRole | string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface IFraudSignal extends Document {
  student_id: mongoose.Types.ObjectId;
  actor: FraudSignalActorContext | null;
  source_type: FraudSignalSourceType;
  source_id: string | null;
  signal_type: FraudSignalType;
  risk_level: FraudSignalRiskLevel;
  severity: FraudSignalRiskLevel;
  confidence: number;
  evidence: JsonObject;
  explanation: string;
  status: FraudSignalStatus;
  reviewed_by: mongoose.Types.ObjectId | null;
  reviewed_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ActorContextSchema = new Schema<FraudSignalActorContext>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, default: null, trim: true },
    ipAddress: { type: String, default: null, trim: true },
    userAgent: { type: String, default: null },
  },
  { _id: false }
);

const FraudSignalSchema = new Schema<IFraudSignal>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true, index: true },
    actor: { type: ActorContextSchema, default: null },
    source_type: {
      type: String,
      enum: ['solver', 'chat', 'ai_log', 'assessment', 'manual', 'system'],
      required: true,
      index: true,
    },
    source_id: { type: String, default: null, trim: true },
    signal_type: {
      type: String,
      enum: [
        'rapid_repeated_solver_requests',
        'high_full_solution_dependency',
        'solver_usage_near_assessment',
        'repeated_flagged_safety_events',
        'rapid_assessment_submission',
        'abnormal_score_jump',
        'duplicate_answer_pattern',
        'excessive_answer_changes',
        'other_risk_signal',
      ],
      required: true,
      index: true,
    },
    risk_level: { type: String, enum: ['informational', 'low', 'medium', 'high'], default: 'informational', index: true },
    severity: { type: String, enum: ['informational', 'low', 'medium', 'high'], default: 'informational' },
    confidence: { type: Number, min: 0, max: 1, required: true },
    evidence: { type: Schema.Types.Mixed, default: {} },
    explanation: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: ['pending_review', 'reviewed', 'dismissed', 'resolved'], default: 'pending_review', index: true },
    reviewed_by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

FraudSignalSchema.index({ student_id: 1, createdAt: -1 });
FraudSignalSchema.index({ status: 1, risk_level: 1, createdAt: -1 });
FraudSignalSchema.index({ source_type: 1, source_id: 1 });
FraudSignalSchema.index({ signal_type: 1, createdAt: -1 });
FraudSignalSchema.index({ reviewed_by: 1, reviewed_at: -1 });

export const FraudSignalModel = mongoose.model<IFraudSignal>('FraudSignal', FraudSignalSchema);

export class FraudSignalRepository extends BaseRepository<IFraudSignal> {
  constructor() {
    super(FraudSignalModel);
  }

  public async findByStudent(studentId: string, limit: number = 50, session?: ClientSession): Promise<IFraudSignal[]> {
    const query = this.model.find({ student_id: studentId }).sort({ createdAt: -1 }).limit(limit);
    if (session) query.session(session);
    return query.exec();
  }

  public async findPendingReview(limit: number = 100, session?: ClientSession): Promise<IFraudSignal[]> {
    const query = this.model.find({ status: 'pending_review' }).sort({ risk_level: -1, createdAt: -1 }).limit(limit);
    if (session) query.session(session);
    return query.exec();
  }

  public async listForReview(filter: Record<string, unknown> = {}, limit: number = 100, session?: ClientSession): Promise<IFraudSignal[]> {
    const query = this.model.find(filter).sort({ createdAt: -1 }).limit(limit);
    if (session) query.session(session);
    return query.exec();
  }
}
export const fraudSignalRepository = new FraudSignalRepository();
