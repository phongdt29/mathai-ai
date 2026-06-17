import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';
import {
  AI_SUBJECT_SCOPE_MATH,
  DEFAULT_AI_TRANSPARENCY_METADATA,
  type AITransparencyMetadata,
} from '../constants/ai-governance';

export interface IAIGenerationLog extends Document {
  student_id: mongoose.Types.ObjectId | null;
  generation_type: string;
  purpose?: string | null;
  subject_scope?: string;
  prompt_template: string | null;
  prompt_version: string | null;
  prompt_template_name?: string | null;
  ai_model: string | null;
  ai_provider?: string | null;
  confidence?: number | null;
  safety_status?: string;
  input_data: any;
  output_data: any;
  input_redacted?: boolean;
  output_redacted?: boolean;
  requires_approval?: boolean;
  approval_id?: mongoose.Types.ObjectId | null;
  approval_status?: string;
  actor?: Record<string, unknown> | null;
  student_context?: Record<string, unknown> | null;
  criteria?: any;
  explanation?: string | null;
  metadata?: AITransparencyMetadata | null;
  tokens_input: number | null;
  tokens_output: number | null;
  cost_usd: number | null;
  response_time_ms: number | null;
  status: string;
  error_message: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const AIGenerationLogSchema = new Schema<IAIGenerationLog>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'StudentProfile', default: null },
    generation_type: { type: String, required: true },
    purpose: { type: String, default: null },
    subject_scope: { type: String, default: AI_SUBJECT_SCOPE_MATH, index: true },
    prompt_template: { type: String, default: null },
    prompt_version: { type: String, default: null },
    prompt_template_name: { type: String, default: null },
    ai_model: { type: String, default: null },
    ai_provider: { type: String, default: null },
    confidence: { type: Number, min: 0, max: 1, default: null },
    safety_status: { type: String, enum: ['not_checked', 'passed', 'flagged', 'blocked'], default: DEFAULT_AI_TRANSPARENCY_METADATA.safetyStatus },
    input_data: { type: Schema.Types.Mixed, default: null },
    output_data: { type: Schema.Types.Mixed, default: null },
    input_redacted: { type: Boolean, default: DEFAULT_AI_TRANSPARENCY_METADATA.inputRedacted },
    output_redacted: { type: Boolean, default: DEFAULT_AI_TRANSPARENCY_METADATA.outputRedacted },
    requires_approval: { type: Boolean, default: DEFAULT_AI_TRANSPARENCY_METADATA.requiresApproval },
    approval_id: { type: Schema.Types.ObjectId, ref: 'ApprovalRequest', default: null },
    approval_status: { type: String, enum: ['not_required', 'draft', 'pending', 'approved', 'rejected'], default: DEFAULT_AI_TRANSPARENCY_METADATA.approvalStatus },
    actor: { type: Schema.Types.Mixed, default: null },
    student_context: { type: Schema.Types.Mixed, default: null },
    criteria: { type: Schema.Types.Mixed, default: null },
    explanation: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
    tokens_input: { type: Number, default: null },
    tokens_output: { type: Number, default: null },
    cost_usd: { type: Number, default: null },
    response_time_ms: { type: Number, default: null },
    status: { type: String, default: 'success' },
    error_message: { type: String, default: null },
  },
  { timestamps: true }
);

AIGenerationLogSchema.index({ student_id: 1, createdAt: -1 });
AIGenerationLogSchema.index({ subject_scope: 1, purpose: 1, createdAt: -1 });
AIGenerationLogSchema.index({ requires_approval: 1, approval_status: 1 });
AIGenerationLogSchema.index({ approval_id: 1 });

export const AIGenerationLogModel = mongoose.model<IAIGenerationLog>('AIGenerationLog', AIGenerationLogSchema);

export class AIGenerationLogRepository extends BaseRepository<IAIGenerationLog> {
  constructor() {
    super(AIGenerationLogModel);
  }

  public async log(data: Partial<IAIGenerationLog>): Promise<IAIGenerationLog> {
    return this.create(data);
  }

  public async findByStudent(studentId: string, session?: ClientSession): Promise<IAIGenerationLog[]> {
    const query = this.model.find({ student_id: studentId }).sort({ createdAt: -1 });
    if (session) query.session(session);
    return query.exec();
  }
}

export const aiGenerationLogRepository = new AIGenerationLogRepository();
