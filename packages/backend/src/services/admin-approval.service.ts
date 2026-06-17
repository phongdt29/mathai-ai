import mongoose from 'mongoose';
import {
  approvalRequestRepository,
  ApprovalRequestRepository,
  type AIContentApprovalKind,
  type ApprovalRequestType,
  type ApprovalStatus,
} from '../models/approval.model';
import { AIGenerationLogModel } from '../models/ai-log.model';
import { teacherService, TeacherService } from './teacher.service';
import { contentLibraryService } from './content-library.service';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors';
import { UserRepository } from '../models/user.model';
import { auditService } from './audit.service';
import { AI_PROVIDER_OPENAI, AI_SUBJECT_SCOPE_MATH } from '../constants/ai-governance';

export class AdminApprovalService {
  private approvalRepo: ApprovalRequestRepository;
  private teacher: TeacherService;
  private userRepo: UserRepository;

  constructor() {
    this.approvalRepo = approvalRequestRepository;
    this.teacher = teacherService;
    this.userRepo = new UserRepository();
  }

  private async ensureAdmin(userId: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user || user.role !== 'admin') {
      throw new ForbiddenError('Chỉ quản trị viên mới có quyền thực hiện thao tác này');
    }
  }

  public async createAIContentApprovalRequest(input: {
    requesterId: string;
    contentKind: AIContentApprovalKind;
    content: Record<string, unknown>;
    aiLogId?: string | null;
    promptTemplate?: string | null;
    promptVersion?: string | null;
    aiModel?: string | null;
    aiProvider?: string | null;
    title?: string | null;
    criteria?: unknown;
    explanation?: string | null;
  }) {
    const type = this.mapAIContentKindToApprovalType(input.contentKind);
    const proposal = await this.approvalRepo.create({
      type,
      requester_id: new mongoose.Types.ObjectId(input.requesterId) as any,
      status: 'pending',
      content_kind: input.contentKind,
      subject_scope: AI_SUBJECT_SCOPE_MATH,
      prompt_template: input.promptTemplate ?? null,
      prompt_version: input.promptVersion ?? 'v1',
      ai_model: input.aiModel ?? null,
      ai_provider: input.aiProvider ?? AI_PROVIDER_OPENAI,
      ai_log_id: input.aiLogId ? new mongoose.Types.ObjectId(input.aiLogId) : null,
      content_status: 'pending',
      data: {
        title: input.title ?? null,
        content_kind: input.contentKind,
        subject_scope: AI_SUBJECT_SCOPE_MATH,
        content: input.content,
        criteria: input.criteria ?? null,
        explanation: input.explanation ?? null,
      },
    } as any);

    await this.updateLinkedAILogApprovalStatus(input.aiLogId ?? null, proposal.id, 'pending');

    await auditService.record({
      actor: { id: input.requesterId, role: 'teacher' },
      action: 'approval.ai_content.request',
      resourceType: 'approval_request',
      resourceId: proposal.id,
      scopeType: 'approval',
      scopeId: proposal.id,
      before: null,
      after: proposal,
      result: 'success',
      metadata: { approval_type: type, content_kind: input.contentKind, subject_scope: AI_SUBJECT_SCOPE_MATH },
    });

    return proposal.toObject ? proposal.toObject() : proposal;
  }

  // List all proposals (optionally filtered by status)
  public async getProposals(adminId: string, status?: string, type?: string) {
    await this.ensureAdmin(adminId);

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      return this.approvalRepo.findByStatus(status as ApprovalStatus);
    }

    // Default: show pending first
    const proposals = await this.approvalRepo.model
      .find(type ? { type } : {})
      .populate('requester_id', 'full_name email role')
      .populate('reviewed_by', 'full_name email')
      .sort({ status: 1, createdAt: -1 })
      .exec();

    return proposals;
  }

  // Get pending count for dashboard
  public async getPendingCount(adminId: string) {
    await this.ensureAdmin(adminId);
    return this.approvalRepo.model.countDocuments({ status: 'pending' });
  }

  // Approve a proposal
  public async approve(adminId: string, proposalId: string) {
    await this.ensureAdmin(adminId);

    const proposal = await this.approvalRepo.findById(proposalId);
    if (!proposal) throw new NotFoundError('Không tìm thấy đề xuất');
    if (proposal.status !== 'pending') {
      throw new ValidationError('Đề xuất này đã được xử lý');
    }

    // Execute the actual action
    const requesterId = proposal.requester_id.toString();
    const data = proposal.data as Record<string, any>;

    if (proposal.type === 'create_class') {
      await this.teacher.createClass(requesterId, {
        name: data.name,
        subject: data.subject,
        grade_level: data.grade_level,
        schedule: data.schedule,
        description: data.description,
      }, { id: adminId, role: 'admin' });
    } else if (proposal.type === 'add_student') {
      await this.teacher.addStudentToClass(requesterId, data.class_id, data.student_email, { id: adminId, role: 'admin' });
    } else if (proposal.type === 'remove_student') {
      await this.teacher.removeStudentFromClass(requesterId, data.class_id, data.student_profile_id, { id: adminId, role: 'admin' });
    } else if (proposal.type === 'archive_class') {
      await this.teacher.deleteClass(requesterId, data.class_id, { id: adminId, role: 'admin' });
    } else if (proposal.type === 'publish_curriculum_template') {
      await contentLibraryService.publishCurriculumTemplate(data.template_id, { id: adminId, role: 'admin' });
    } else if (proposal.type === 'publish_lesson_template') {
      await contentLibraryService.publishLessonTemplate(data.template_id, { id: adminId, role: 'admin' });
    } else if (this.isAIContentApprovalType(proposal.type)) {
      await this.updateLinkedAILogApprovalStatus(data.ai_log_id ?? String((proposal as any).ai_log_id ?? ''), proposalId, 'approved');
    }

    // Mark as approved
    const updated = await this.approvalRepo.update(proposalId, {
      status: 'approved',
      content_status: 'approved',
      reviewed_by: new mongoose.Types.ObjectId(adminId),
      reviewed_at: new Date(),
    } as any);

    await auditService.record({
      actor: { id: adminId, role: 'admin' },
      action: 'approval.approve',
      resourceType: 'approval_request',
      resourceId: proposalId,
      scopeType: data.class_id ? 'class' : 'approval',
      scopeId: data.class_id ?? proposalId,
      before: proposal,
      after: updated,
      result: 'success',
      metadata: { approval_type: proposal.type, requester_id: requesterId },
    });

    return updated.toObject ? updated.toObject() : updated;
  }

  // Reject a proposal
  public async reject(adminId: string, proposalId: string, reason?: string) {
    await this.ensureAdmin(adminId);

    const proposal = await this.approvalRepo.findById(proposalId);
    if (!proposal) throw new NotFoundError('Không tìm thấy đề xuất');
    if (proposal.status !== 'pending') {
      throw new ValidationError('Đề xuất này đã được xử lý');
    }

    if (this.isAIContentApprovalType(proposal.type)) {
      await this.updateLinkedAILogApprovalStatus((proposal.data as Record<string, any>)?.ai_log_id ?? String((proposal as any).ai_log_id ?? ''), proposalId, 'rejected');
    }

    const updated = await this.approvalRepo.update(proposalId, {
      status: 'rejected',
      content_status: 'rejected',
      reviewed_by: new mongoose.Types.ObjectId(adminId),
      reviewed_at: new Date(),
      rejection_reason: reason || null,
    } as any);

    await auditService.record({
      actor: { id: adminId, role: 'admin' },
      action: 'approval.reject',
      resourceType: 'approval_request',
      resourceId: proposalId,
      scopeType: (proposal.data as Record<string, any>)?.class_id ? 'class' : 'approval',
      scopeId: (proposal.data as Record<string, any>)?.class_id ?? proposalId,
      before: proposal,
      after: updated,
      result: 'success',
      metadata: { approval_type: proposal.type, rejection_reason: reason ?? '' },
    });

    return updated.toObject ? updated.toObject() : updated;
  }

  private mapAIContentKindToApprovalType(kind: AIContentApprovalKind): ApprovalRequestType {
    const map: Record<AIContentApprovalKind, ApprovalRequestType> = {
      lesson: 'approve_ai_lesson_content',
      exercise: 'approve_ai_exercise_content',
      assessment: 'approve_ai_assessment_content',
      rubric_scoring_suggestion: 'approve_ai_rubric_suggestion',
    };
    return map[kind];
  }

  private isAIContentApprovalType(type: string): boolean {
    return type.startsWith('approve_ai_');
  }

  private async updateLinkedAILogApprovalStatus(aiLogId: string | null, approvalId: string, approvalStatus: ApprovalStatus): Promise<void> {
    if (!aiLogId || !mongoose.Types.ObjectId.isValid(aiLogId)) return;
    await AIGenerationLogModel.findByIdAndUpdate(aiLogId, {
      $set: {
        requires_approval: true,
        approval_id: new mongoose.Types.ObjectId(approvalId),
        approval_status: approvalStatus,
        'metadata.requiresApproval': true,
        'metadata.approvalId': approvalId,
        'metadata.approvalStatus': approvalStatus,
      },
    }).exec();
  }
}

export const adminApprovalService = new AdminApprovalService();
