import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';
import type { UserRole, JsonObject } from '../types';

export type AuditResult = 'success' | 'failure' | 'denied';

export interface IAuditLog extends Document {
  actorUserId: mongoose.Types.ObjectId | null;
  actorRole: UserRole | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  scopeType: string | null;
  scopeId: string | null;
  before: JsonObject | null;
  after: JsonObject | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  result: AuditResult;
  errorCode: string | null;
  metadata: JsonObject;
  createdAt: Date;
  updatedAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, enum: ['student', 'parent', 'admin', 'teacher', null], default: null },
    action: { type: String, required: true, trim: true },
    resourceType: { type: String, required: true, trim: true },
    resourceId: { type: String, default: null, trim: true },
    scopeType: { type: String, default: null, trim: true },
    scopeId: { type: String, default: null, trim: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    requestId: { type: String, default: null, trim: true },
    ipAddress: { type: String, default: null, trim: true },
    userAgent: { type: String, default: null },
    result: { type: String, enum: ['success', 'failure', 'denied'], required: true },
    errorCode: { type: String, default: null, trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

AuditLogSchema.index({ actorUserId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, resourceType: 1, createdAt: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
AuditLogSchema.index({ requestId: 1 });
AuditLogSchema.index({ createdAt: -1 });

export const AuditLogModel = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

export class AuditLogRepository extends BaseRepository<IAuditLog> {
  constructor() {
    super(AuditLogModel);
  }

  public async findByRequestId(requestId: string, session?: ClientSession): Promise<IAuditLog[]> {
    return this.model.find({ requestId }).session(session ?? null).sort({ createdAt: -1 }).exec();
  }
}

export const auditLogRepository = new AuditLogRepository();
