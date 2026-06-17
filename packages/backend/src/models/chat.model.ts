import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';

export interface IAITutorConversation extends Document {
  student_id: mongoose.Types.ObjectId;
  ai_tutor_id: mongoose.Types.ObjectId;
  lesson_id: mongoose.Types.ObjectId | null;
  title: string | null;
  context_summary: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const AITutorConversationSchema = new Schema<IAITutorConversation>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    ai_tutor_id: { type: Schema.Types.ObjectId, ref: 'AITutor', required: true },
    lesson_id: { type: Schema.Types.ObjectId, ref: 'Lesson', default: null },
    title: { type: String, default: null },
    context_summary: { type: String, default: null },
    status: { type: String, default: 'active' },
  },
  { timestamps: true }
);

AITutorConversationSchema.index({ student_id: 1, updatedAt: -1 });

export const AITutorConversationModel = mongoose.model<IAITutorConversation>(
  'AITutorConversation',
  AITutorConversationSchema
);

export interface IAITutorMessage extends Document {
  conversation_id: mongoose.Types.ObjectId;
  role: string;
  content: string;
  message_type: string | null;
  ai_model: string | null;
  tokens_used: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const AITutorMessageSchema = new Schema<IAITutorMessage>(
  {
    conversation_id: { type: Schema.Types.ObjectId, ref: 'AITutorConversation', required: true },
    role: { type: String, required: true },
    content: { type: String, required: true },
    message_type: { type: String, default: null },
    ai_model: { type: String, default: null },
    tokens_used: { type: Number, default: null },
  },
  { timestamps: true }
);

AITutorMessageSchema.index({ conversation_id: 1, createdAt: 1 });

export const AITutorMessageModel = mongoose.model<IAITutorMessage>('AITutorMessage', AITutorMessageSchema);

export interface ConversationWithMessages extends IAITutorConversation {
  messages: IAITutorMessage[];
}

export class ConversationRepository extends BaseRepository<IAITutorConversation> {
  constructor() {
    super(AITutorConversationModel);
  }

  public async findByStudent(studentId: string, session?: ClientSession): Promise<IAITutorConversation[]> {
    const query = this.model.find({ student_id: studentId }).sort({ updatedAt: -1 });
    if (session) query.session(session);
    return query.exec();
  }

  public async findWithMessages(
    conversationId: string,
    session?: ClientSession
  ): Promise<ConversationWithMessages | null> {
    const conversation = await this.findById(conversationId, session);

    if (!conversation) {
      return null;
    }

    const messages = await messageRepository.getRecentMessages(conversationId, 100, session);

    return {
      ...conversation.toObject(),
      messages: messages.sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      ),
    } as ConversationWithMessages;
  }
}

export class MessageRepository extends BaseRepository<IAITutorMessage> {
  constructor() {
    super(AITutorMessageModel);
  }

  public async findByConversation(conversationId: string, session?: ClientSession): Promise<IAITutorMessage[]> {
    const query = this.model.find({ conversation_id: conversationId }).sort({ createdAt: 1 });
    if (session) query.session(session);
    return query.exec();
  }

  public async getRecentMessages(
    conversationId: string,
    limit: number = 20,
    session?: ClientSession
  ): Promise<IAITutorMessage[]> {
    const query = this.model.find({ conversation_id: conversationId }).sort({ createdAt: -1 }).limit(limit);
    if (session) query.session(session);
    return query.exec();
  }
}

export const conversationRepository = new ConversationRepository();
export const messageRepository = new MessageRepository();
