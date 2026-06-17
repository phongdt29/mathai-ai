import mongoose from 'mongoose';
import {
  fraudSignalRepository,
  type FraudSignalActorContext,
  type FraudSignalRiskLevel,
  type FraudSignalSourceType,
  type FraudSignalStatus,
  type FraudSignalType,
  type IFraudSignal,
} from '../models/fraud-signal.model';
import { auditService, type AuditActor } from './audit.service';
import type { JsonObject, JsonValue, UserRole } from '../types';

export type FraudSignalWriter = Pick<typeof fraudSignalRepository, 'create' | 'findByStudent' | 'findPendingReview' | 'listForReview'> & {
  findById: (id: string) => Promise<IFraudSignal | null>;
  update: (id: string, data: Partial<IFraudSignal>) => Promise<IFraudSignal | null>;
};

export interface CreateFraudSignalInput {
  studentId: string;
  actor?: FraudSignalActorContextInput | null;
  sourceType: FraudSignalSourceType;
  sourceId?: string | null;
  signalType: FraudSignalType;
  riskLevel?: FraudSignalRiskLevel;
  severity?: FraudSignalRiskLevel;
  confidence: number;
  evidence?: Record<string, unknown> | null;
  explanation: string;
  status?: FraudSignalStatus;
}

export interface FraudSignalActorContextInput {
  userId?: string | null;
  role?: UserRole | string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface FraudSignalServiceDependencies {
  writer?: FraudSignalWriter;
  auditor?: Pick<typeof auditService, 'record'>;
  logger?: Pick<Console, 'warn' | 'error'>;
}

const SENSITIVE_KEY_PATTERN = /password|password_hash|token|secret|api[-_]?key|authorization|cookie|session|otp|refresh|prompt|response|content|input_text|ai_response/i;
const MAX_EVIDENCE_STRING_LENGTH = 180;
const MAX_EVIDENCE_ARRAY_LENGTH = 10;
const MAX_EVIDENCE_DEPTH = 5;
const REDACTED_VALUE = '[REDACTED]';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

const toObjectIdOrNull = (value?: string | null): mongoose.Types.ObjectId | null => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

const clampConfidence = (confidence: number): number => {
  if (!Number.isFinite(confidence)) return 0;
  return Math.min(1, Math.max(0, Math.round(confidence * 100) / 100));
};

const redactEvidenceValue = (value: unknown, depth = 0): JsonValue => {
  if (depth > MAX_EVIDENCE_DEPTH) return '[MaxDepth]';
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    return value.length > MAX_EVIDENCE_STRING_LENGTH
      ? `${value.slice(0, MAX_EVIDENCE_STRING_LENGTH)}…[truncated]`
      : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (Array.isArray(value)) {
    return value.slice(0, MAX_EVIDENCE_ARRAY_LENGTH).map((item) => redactEvidenceValue(item, depth + 1));
  }
  if (isPlainObject(value)) {
    return Object.entries(value).reduce<JsonObject>((acc, [key, childValue]) => {
      acc[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED_VALUE : redactEvidenceValue(childValue, depth + 1);
      return acc;
    }, {});
  }

  return String(value);
};

export const redactFraudSignalEvidence = (evidence: Record<string, unknown> | null | undefined): JsonObject => {
  if (!evidence) return {};
  const redacted = redactEvidenceValue(evidence);
  return isPlainObject(redacted) ? redacted : { value: redacted };
};

export class FraudSignalService {
  private readonly writer: FraudSignalWriter;
  private readonly auditor: Pick<typeof auditService, 'record'>;
  private readonly logger: Pick<Console, 'warn' | 'error'>;

  constructor(dependencies: FraudSignalServiceDependencies = {}) {
    this.writer = dependencies.writer ?? fraudSignalRepository;
    this.auditor = dependencies.auditor ?? auditService;
    this.logger = dependencies.logger ?? console;
  }

  public async createSignal(input: CreateFraudSignalInput): Promise<IFraudSignal> {
    const riskLevel = input.riskLevel ?? 'informational';
    const signal = await this.writer.create({
      student_id: new mongoose.Types.ObjectId(input.studentId),
      actor: this.normalizeActor(input.actor),
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      signal_type: input.signalType,
      risk_level: riskLevel,
      severity: input.severity ?? riskLevel,
      confidence: clampConfidence(input.confidence),
      evidence: redactFraudSignalEvidence(input.evidence),
      explanation: this.neutralizeExplanation(input.explanation),
      status: input.status ?? 'pending_review',
      reviewed_by: null,
      reviewed_at: null,
    } as Partial<IFraudSignal>);

    if (riskLevel === 'medium' || riskLevel === 'high') {
      await this.auditSignalCreated(signal).catch((error: unknown) => {
        this.logger.warn('Fraud signal audit write failed', { signalId: signal.id, error });
      });
    }

    return signal;
  }

  public async getStudentSignals(studentId: string, limit = 50): Promise<IFraudSignal[]> {
    return this.writer.findByStudent(studentId, limit);
  }

  public async getPendingReviewSignals(limit = 100): Promise<IFraudSignal[]> {
    return this.writer.findPendingReview(limit);
  }

  public async listReviewSignals(input: {
    status?: FraudSignalStatus;
    studentId?: string;
    sourceType?: FraudSignalSourceType;
    signalType?: FraudSignalType;
    limit?: number;
  } = {}): Promise<IFraudSignal[]> {
    const filter: Record<string, unknown> = {};
    if (input.status) filter.status = input.status;
    if (input.studentId) filter.student_id = new mongoose.Types.ObjectId(input.studentId);
    if (input.sourceType) filter.source_type = input.sourceType;
    if (input.signalType) filter.signal_type = input.signalType;
    return this.writer.listForReview(filter, Math.min(Math.max(input.limit ?? 100, 1), 250));
  }

  public async reviewSignal(input: {
    signalId: string;
    reviewerId: string;
    reviewerRole: UserRole;
    decision: Extract<FraudSignalStatus, 'reviewed' | 'dismissed' | 'resolved'>;
    note?: string | null;
  }): Promise<IFraudSignal> {
    const existing = await this.writer.findById(input.signalId);
    if (!existing) {
      throw new Error('Fraud signal not found');
    }

    const before = {
      status: existing.status,
      reviewed_by: existing.reviewed_by?.toString() ?? null,
      reviewed_at: existing.reviewed_at?.toISOString?.() ?? null,
    };
    const reviewedAt = new Date();
    const updated = await this.writer.update(input.signalId, {
      status: input.decision,
      reviewed_by: new mongoose.Types.ObjectId(input.reviewerId),
      reviewed_at: reviewedAt,
    } as Partial<IFraudSignal>);

    if (!updated) {
      throw new Error('Fraud signal review update failed');
    }

    await this.auditReviewDecision({
      signal: updated,
      before,
      reviewerId: input.reviewerId,
      reviewerRole: input.reviewerRole,
      decision: input.decision,
      note: input.note ?? null,
    }).catch((error: unknown) => {
      this.logger.warn('Fraud signal review audit write failed', { signalId: input.signalId, error });
    });

    return updated;
  }

  private normalizeActor(actor?: FraudSignalActorContextInput | null): FraudSignalActorContext | null {
    if (!actor) return null;
    return {
      userId: toObjectIdOrNull(actor.userId),
      role: actor.role ?? null,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
    };
  }

  private neutralizeExplanation(explanation: string): string {
    return explanation
      .replace(/fraud confirmed/gi, 'risk signal observed')
      .replace(/confirmed fraud/gi, 'risk signal observed')
      .replace(/gian lận đã xác nhận/gi, 'tín hiệu cần xem xét')
      .trim();
  }

  private async auditSignalCreated(signal: IFraudSignal): Promise<void> {
    const actor = signal.actor
      ? ({ id: signal.actor.userId?.toString() ?? null, role: signal.actor.role as UserRole | null } satisfies AuditActor)
      : null;

    await this.auditor.record({
      actor,
      action: 'risk_signal.created',
      resourceType: 'fraud_signal',
      resourceId: signal.id,
      scopeType: 'student',
      scopeId: signal.student_id.toString(),
      after: {
        signal_type: signal.signal_type,
        risk_level: signal.risk_level,
        confidence: signal.confidence,
        status: signal.status,
      },
      result: 'success',
      metadata: {
        source_type: signal.source_type,
        source_id: signal.source_id,
        note: 'Neutral suspected-risk signal created for review; not an automatic conclusion.',
      },
    });
  }

  private async auditReviewDecision(input: {
    signal: IFraudSignal;
    before: JsonObject;
    reviewerId: string;
    reviewerRole: UserRole;
    decision: FraudSignalStatus;
    note: string | null;
  }): Promise<void> {
    await this.auditor.record({
      actor: { id: input.reviewerId, role: input.reviewerRole },
      action: 'risk_signal.review_decision',
      resourceType: 'fraud_signal',
      resourceId: input.signal.id,
      scopeType: 'student',
      scopeId: input.signal.student_id.toString(),
      before: input.before,
      after: {
        status: input.signal.status,
        reviewed_by: input.signal.reviewed_by?.toString() ?? null,
        reviewed_at: input.signal.reviewed_at?.toISOString?.() ?? null,
      },
      result: 'success',
      metadata: {
        decision: input.decision,
        reviewer_role: input.reviewerRole,
        note: input.note ? input.note.slice(0, 240) : null,
        note_redacted: Boolean(input.note),
        note_policy: 'Review note stored only as short metadata; evidence remains redacted.',
      },
    });
  }
}

export const fraudSignalService = new FraudSignalService();
export default fraudSignalService;
