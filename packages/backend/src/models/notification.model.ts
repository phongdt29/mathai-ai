import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';

export interface INotification extends Document {
  user_id: mongoose.Types.ObjectId;
  title: string;
  content: string | null;
  type: string;
  is_read: boolean;
  read_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    content: { type: String, default: null },
    type: { type: String, required: true },
    is_read: { type: Boolean, default: false },
    read_at: { type: Date, default: null },
  },
  { timestamps: true }
);

NotificationSchema.index({ user_id: 1, is_read: 1, createdAt: -1 });

export const NotificationModel = mongoose.model<INotification>('Notification', NotificationSchema);

export class NotificationRepository extends BaseRepository<INotification> {
  constructor() {
    super(NotificationModel);
  }

  public async findUnread(userId: string, session?: ClientSession): Promise<INotification[]> {
    const query = this.model.find({ user_id: userId, is_read: false }).sort({ createdAt: -1 });
    if (session) query.session(session);
    return query.exec();
  }

  public async markAsRead(id: string, session?: ClientSession): Promise<INotification> {
    return this.update(id, { is_read: true, read_at: new Date() } as any, session);
  }
}

export const notificationRepository = new NotificationRepository();
