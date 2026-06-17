import mongoose, { Schema, Document } from 'mongoose';
import BaseRepository from './base.model';

// ── Approval Request ──

export type ApprovalRequestType =
  | 'create_class'
  | 'add_student'
  | 'remove_student'
  | 'archive_class'
  | 'publish_curriculum_template'
  | 'publish_lesson_template'
  | 'approve_ai_lesson_content'
  | 'approve_ai_exercise_content'
  | 'approve_ai_assessment_content'
  | 'approve_ai_rubric_suggestion';
export type ApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type AIContentApprovalKind = 'lesson' | 'exercise' | 'assessment' | 'rubric_scoring_suggestion';

export interface IApprovalRequest extends Document {
  type: ApprovalRequestType;
  requester_id: mongoose.Types.ObjectId;
  status: ApprovalStatus;
  data: Record<string, unknown>;
  content_kind?: AIContentApprovalKind | null;
  subject_scope?: string;
  prompt_template?: string | null;
  prompt_version?: string | null;
  ai_model?: string | null;
  ai_provider?: string | null;
  ai_log_id?: mongoose.Types.ObjectId | null;
  content_status?: ApprovalStatus;
  reviewed_by: mongoose.Types.ObjectId | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalRequestSchema = new Schema<IApprovalRequest>(
  {
    type: {
      type: String,
      enum: [
        'create_class',
        'add_student',
        'remove_student',
        'archive_class',
        'publish_curriculum_template',
        'publish_lesson_template',
        'approve_ai_lesson_content',
        'approve_ai_exercise_content',
        'approve_ai_assessment_content',
        'approve_ai_rubric_suggestion',
      ],
      required: true,
    },
    requester_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['draft', 'pending', 'approved', 'rejected'], default: 'pending' },
    data: { type: Schema.Types.Mixed, required: true },
    content_kind: { type: String, enum: ['lesson', 'exercise', 'assessment', 'rubric_scoring_suggestion'], default: null },
    subject_scope: { type: String, default: 'math', index: true },
    prompt_template: { type: String, default: null },
    prompt_version: { type: String, default: null },
    ai_model: { type: String, default: null },
    ai_provider: { type: String, default: null },
    ai_log_id: { type: Schema.Types.ObjectId, ref: 'AIGenerationLog', default: null },
    content_status: { type: String, enum: ['draft', 'pending', 'approved', 'rejected'], default: 'pending' },
    reviewed_by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewed_at: { type: Date, default: null },
    rejection_reason: { type: String, default: null },
  },
  { timestamps: true }
);

ApprovalRequestSchema.index({ requester_id: 1, status: 1 });
ApprovalRequestSchema.index({ status: 1, createdAt: -1 });
ApprovalRequestSchema.index({ type: 1, status: 1 });
ApprovalRequestSchema.index({ content_kind: 1, content_status: 1 });
ApprovalRequestSchema.index({ ai_log_id: 1 });

export const ApprovalRequestModel = mongoose.model<IApprovalRequest>('ApprovalRequest', ApprovalRequestSchema);

export class ApprovalRequestRepository extends BaseRepository<IApprovalRequest> {
  constructor() {
    super(ApprovalRequestModel);
  }

  public async findByRequester(requesterId: string, status?: ApprovalStatus): Promise<IApprovalRequest[]> {
    const query: Record<string, unknown> = { requester_id: requesterId };
    if (status) query.status = status;
    return this.model.find(query).sort({ createdAt: -1 }).exec();
  }

  public async findPending(): Promise<IApprovalRequest[]> {
    return this.model
      .find({ status: 'pending' })
      .populate('requester_id', 'full_name email role')
      .sort({ createdAt: -1 })
      .exec();
  }

  public async findByStatus(status: ApprovalStatus): Promise<IApprovalRequest[]> {
    return this.model
      .find({ status })
      .populate('requester_id', 'full_name email role')
      .populate('reviewed_by', 'full_name email')
      .sort({ createdAt: -1 })
      .exec();
  }
}

export const approvalRequestRepository = new ApprovalRequestRepository();
