import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';

export interface IPasswordResetRequest extends Document {
  email: string;
  user_id: mongoose.Types.ObjectId | null;
  ip: string | null;
  user_agent: string | null;
  token_fingerprint: string;
  expires_at: Date;
  consumed_at: Date | null;
  delivery_id: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const PasswordResetRequestSchema = new Schema<IPasswordResetRequest>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    ip: { type: String, default: null, trim: true },
    user_agent: { type: String, default: null },
    token_fingerprint: { type: String, required: true, unique: true },
    expires_at: { type: Date, required: true },
    consumed_at: { type: Date, default: null },
    delivery_id: { type: Schema.Types.ObjectId, ref: 'NotificationDelivery', default: null },
  },
  { timestamps: true }
);

PasswordResetRequestSchema.index({ email: 1, createdAt: -1 });
PasswordResetRequestSchema.index({ ip: 1, createdAt: -1 });

export const PasswordResetRequestModel = mongoose.model<IPasswordResetRequest>(
  'PasswordResetRequest',
  PasswordResetRequestSchema
);

export class PasswordResetRequestRepository extends BaseRepository<IPasswordResetRequest> {
  constructor() {
    super(PasswordResetRequestModel);
  }

  public async findByEmail(email: string, limit: number = 10, session?: ClientSession): Promise<IPasswordResetRequest[]> {
    const query = this.model
      .find({ email: email.toLowerCase().trim() })
      .sort({ createdAt: -1 })
      .limit(limit);
    if (session) query.session(session);
    return query.exec();
  }

  public async findByTokenFingerprint(fingerprint: string, session?: ClientSession): Promise<IPasswordResetRequest | null> {
    const query = this.model.findOne({ token_fingerprint: fingerprint });
    if (session) query.session(session);
    return query.exec();
  }

  public async countRecentByEmail(email: string, sinceMinutes: number = 60, session?: ClientSession): Promise<number> {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
    const query = this.model.countDocuments({
      email: email.toLowerCase().trim(),
      createdAt: { $gte: since },
    });
    if (session) query.session(session);
    return query.exec();
  }

  public async countRecentByIp(ip: string, sinceMinutes: number = 60, session?: ClientSession): Promise<number> {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
    const query = this.model.countDocuments({
      ip,
      createdAt: { $gte: since },
    });
    if (session) query.session(session);
    return query.exec();
  }

  public async markConsumed(id: string, session?: ClientSession): Promise<IPasswordResetRequest | null> {
    return this.model
      .findByIdAndUpdate(id, { $set: { consumed_at: new Date() } }, { new: true, session: session ?? undefined })
      .exec();
  }
}

export const passwordResetRequestRepository = new PasswordResetRequestRepository();
