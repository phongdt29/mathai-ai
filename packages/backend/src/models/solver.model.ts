import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';

export interface ISolverRequest extends Document {
  student_id: mongoose.Types.ObjectId;
  lesson_id: mongoose.Types.ObjectId | null;
  input_type: string;
  input_text: string | null;
  image_url: string | null;
  parsed_text: string | null;
  ai_response: string | null;
  solution_steps: any;
  explanation: string | null;
  common_mistakes: string | null;
  ai_model: string | null;
  tokens_used: number | null;
  related_topic: string | null;
  similar_problems: any;
  similar_problems_message: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const SolverRequestSchema = new Schema<ISolverRequest>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    lesson_id: { type: Schema.Types.ObjectId, ref: 'Lesson', default: null },
    input_type: { type: String, required: true },
    input_text: { type: String, default: null },
    image_url: { type: String, default: null },
    parsed_text: { type: String, default: null },
    ai_response: { type: String, default: null },
    solution_steps: { type: Schema.Types.Mixed, default: null },
    explanation: { type: String, default: null },
    common_mistakes: { type: String, default: null },
    ai_model: { type: String, default: null },
    tokens_used: { type: Number, default: null },
    related_topic: { type: String, default: null },
    similar_problems: { type: Schema.Types.Mixed, default: null },
    similar_problems_message: { type: String, default: null },
  },
  { timestamps: true }
);

SolverRequestSchema.index({ student_id: 1, createdAt: -1 });

export const SolverRequestModel = mongoose.model<ISolverRequest>('SolverRequest', SolverRequestSchema);

export class SolverRequestRepository extends BaseRepository<ISolverRequest> {
  constructor() {
    super(SolverRequestModel);
  }

  public async findByStudent(studentId: string, session?: ClientSession): Promise<ISolverRequest[]> {
    const query = this.model.find({ student_id: studentId }).sort({ createdAt: -1 });
    if (session) query.session(session);
    return query.exec();
  }

  public async findRecent(studentId: string, limit: number = 10, session?: ClientSession): Promise<ISolverRequest[]> {
    const query = this.model.find({ student_id: studentId }).sort({ createdAt: -1 }).limit(limit);
    if (session) query.session(session);
    return query.exec();
  }

  public async countToday(
    studentId: string,
    inputType?: string,
    now: Date = new Date(),
    session?: ClientSession,
  ): Promise<number> {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const query = this.model.countDocuments({
      student_id: studentId,
      ...(inputType ? { input_type: inputType } : {}),
      createdAt: { $gte: startOfDay, $lte: now },
    });
    if (session) query.session(session);
    return query.exec();
  }
}

export const solverRequestRepository = new SolverRequestRepository();
