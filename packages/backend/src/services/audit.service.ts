import type { Request } from 'express';
import mongoose from 'mongoose';
import { auditLogRepository, type AuditResult, type IAuditLog } from '../models/audit-log.model';
import type { UserRole, JsonObject, JsonValue } from '../types';

export type AuditLogWriter = Pick<typeof auditLogRepository, 'create'>;

export interface AuditActor {
  id?: string | null;
  role?: UserRole | null;
}

export interface AuditEventInput {
  actor?: AuditActor | null;
  actorUserId?: string | null;
  actorRole?: UserRole | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  scopeType?: string | null;
  scopeId?: string | null;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  result: AuditResult;
  errorCode?: string | null;
  metadata?: JsonObject;
}

export interface AuditServiceDependencies {
  writer?: AuditLogWriter;
  logger?: Pick<Console, 'error' | 'warn'>;
}

const SENSITIVE_KEY_PATTERN = /password|password_hash|token|secret|api[-_]?key|authorization|cookie|session|otp|refresh/i;
const REDACTED_VALUE = '[REDACTED]';
const MAX_DEPTH = 8;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

const toObjectIdOrNull = (value?: string | null): mongoose.Types.ObjectId | null => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }

  return new mongoose.Types.ObjectId(value);
};

const normalizeJsonValue = (value: unknown, depth = 0): JsonValue => {
  if (depth > MAX_DEPTH) {
    return '[MaxDepth]';
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    return Object.entries(value).reduce<JsonObject>((acc, [key, childValue]) => {
      acc[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED_VALUE : normalizeJsonValue(childValue, depth + 1);
      return acc;
    }, {});
  }

  if (typeof (value as { toObject?: unknown }).toObject === 'function') {
    return normalizeJsonValue((value as { toObject: () => unknown }).toObject(), depth + 1);
  }

  return String(value);
};

export const redactAuditJson = (value: unknown): JsonObject | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = normalizeJsonValue(value);
  if (isPlainObject(normalized)) {
    return normalized as JsonObject;
  }

  return { value: normalized };
};

export const getAuditContextFromRequest = (req: Request): Pick<AuditEventInput, 'actor' | 'requestId' | 'ipAddress' | 'userAgent'> => ({
  actor: req.user ? { id: req.user.id, role: req.user.role } : null,
  requestId:
    (typeof req.headers?.['x-request-id'] === 'string' && req.headers['x-request-id']) ||
    (typeof req.headers?.['x-correlation-id'] === 'string' && req.headers['x-correlation-id']) ||
    null,
  ipAddress: req.ip || req.socket?.remoteAddress || null,
  userAgent: typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : null,
});

export class AuditService {
  private readonly writer: AuditLogWriter;
  private readonly logger: Pick<Console, 'error' | 'warn'>;

  constructor(dependencies: AuditServiceDependencies = {}) {
    this.writer = dependencies.writer ?? auditLogRepository;
    this.logger = dependencies.logger ?? console;
  }

  public async record(input: AuditEventInput): Promise<IAuditLog | null> {
    try {
      const actorUserId = input.actorUserId ?? input.actor?.id ?? null;
      const actorRole = input.actorRole ?? input.actor?.role ?? null;

      return await this.writer.create({
        actorUserId: toObjectIdOrNull(actorUserId),
        actorRole,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        scopeType: input.scopeType ?? null,
        scopeId: input.scopeId ?? null,
        before: redactAuditJson(input.before),
        after: redactAuditJson(input.after),
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        result: input.result,
        errorCode: input.errorCode ?? null,
        metadata: input.metadata ?? {},
      } as Partial<IAuditLog>);
    } catch (error) {
      this.logger.error('Audit write failed', {
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        result: input.result,
        error,
      });
      return null;
    }
  }

  public async recordFromRequest(req: Request, input: Omit<AuditEventInput, 'actor' | 'requestId' | 'ipAddress' | 'userAgent'>): Promise<IAuditLog | null> {
    return this.record({
      ...getAuditContextFromRequest(req),
      ...input,
    });
  }
}

export const auditService = new AuditService();
