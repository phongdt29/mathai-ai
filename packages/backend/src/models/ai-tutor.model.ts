import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';

export interface IAITutor extends Document {
  code: string;
  name: string;
  display_name: string;
  avatar_url: string | null;
  avatar_emoji: string;
  gender_style: 'nam' | 'nu' | null;
  tone_style: string | null;
  teaching_style: string | null;
  personality: string | null;
  description: string | null;
  system_prompt: string | null;
  is_active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AITutorSchema = new Schema<IAITutor>(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    display_name: { type: String, required: true },
    avatar_url: { type: String, default: null },
    avatar_emoji: { type: String, required: true, default: '🤖' },
    gender_style: { type: String, enum: ['nam', 'nu', null], default: null },
    tone_style: { type: String, default: null },
    teaching_style: { type: String, default: null },
    personality: { type: String, default: null },
    description: { type: String, default: null },
    system_prompt: { type: String, default: null },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

AITutorSchema.index({ is_active: 1 });

export const AITutorModel = mongoose.model<IAITutor>('AITutor', AITutorSchema);

export class AITutorRepository extends BaseRepository<IAITutor> {
  constructor() {
    super(AITutorModel);
  }

  public async findActive(session?: ClientSession): Promise<IAITutor[]> {
    return this.findAll({ is_active: true } as any, session);
  }
}

export const aiTutorRepository = new AITutorRepository();
