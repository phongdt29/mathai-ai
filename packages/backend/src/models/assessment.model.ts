import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';

export interface IAssessment extends Document {
  student_id: mongoose.Types.ObjectId;
  type: 'diagnostic' | 'practice' | 'final';
  title: string;
  grade_level: number | null;
  target_difficulty: string | null;
  generated_by_ai: boolean;
  total_questions: number;
  total_score: number | null;
  duration_minutes: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const AssessmentSchema = new Schema<IAssessment>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    type: { type: String, enum: ['diagnostic', 'practice', 'final'], required: true },
    title: { type: String, required: true },
    grade_level: { type: Number, default: null },
    target_difficulty: { type: String, default: null },
    generated_by_ai: { type: Boolean, default: false },
    total_questions: { type: Number, default: 0 },
    total_score: { type: Number, default: null },
    duration_minutes: { type: Number, default: null },
    status: { type: String, default: 'pending' },
  },
  { timestamps: true }
);

AssessmentSchema.index({ student_id: 1, type: 1 });
AssessmentSchema.index({ status: 1 });

export const AssessmentModel = mongoose.model<IAssessment>('Assessment', AssessmentSchema);

export interface IAssessmentQuestion extends Document {
  assessment_id: mongoose.Types.ObjectId;
  question_type: string;
  topic: string | null;
  difficulty_level: string | null;
  question_text: string;
  choices: any;
  correct_answer: string;
  solution_steps: any;
  explanation: string | null;
  score: number;
  order_index: number;
  createdAt: Date;
  updatedAt: Date;
}

const AssessmentQuestionSchema = new Schema<IAssessmentQuestion>(
  {
    assessment_id: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    question_type: { type: String, required: true },
    topic: { type: String, default: null },
    difficulty_level: { type: String, default: null },
    question_text: { type: String, required: true },
    choices: { type: Schema.Types.Mixed, default: null },
    correct_answer: { type: String, required: true },
    solution_steps: { type: Schema.Types.Mixed, default: null },
    explanation: { type: String, default: null },
    score: { type: Number, default: 1 },
    order_index: { type: Number, required: true },
  },
  { timestamps: true }
);

AssessmentQuestionSchema.index({ assessment_id: 1, order_index: 1 });

export const AssessmentQuestionModel = mongoose.model<IAssessmentQuestion>(
  'AssessmentQuestion',
  AssessmentQuestionSchema
);

export interface IAssessmentAttempt extends Document {
  assessment_id: mongoose.Types.ObjectId;
  student_id: mongoose.Types.ObjectId;
  started_at: Date | null;
  submitted_at: Date | null;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  ai_feedback: string | null;
  ai_analysis: any;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const AssessmentAttemptSchema = new Schema<IAssessmentAttempt>(
  {
    assessment_id: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    started_at: { type: Date, default: null },
    submitted_at: { type: Date, default: null },
    total_score: { type: Number, default: null },
    max_score: { type: Number, default: null },
    percentage: { type: Number, default: null },
    ai_feedback: { type: String, default: null },
    ai_analysis: { type: Schema.Types.Mixed, default: null },
    status: { type: String, default: 'in_progress' },
  },
  { timestamps: true }
);

AssessmentAttemptSchema.index({ assessment_id: 1 });
AssessmentAttemptSchema.index({ student_id: 1 });

export const AssessmentAttemptModel = mongoose.model<IAssessmentAttempt>(
  'AssessmentAttempt',
  AssessmentAttemptSchema
);

export interface IAssessmentAnswer extends Document {
  attempt_id: mongoose.Types.ObjectId;
  question_id: mongoose.Types.ObjectId;
  student_answer: string | null;
  selected_choice: string | null;
  is_correct: boolean | null;
  score: number | null;
  ai_comment: string | null;
  answered_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AssessmentAnswerSchema = new Schema<IAssessmentAnswer>(
  {
    attempt_id: { type: Schema.Types.ObjectId, ref: 'AssessmentAttempt', required: true },
    question_id: { type: Schema.Types.ObjectId, ref: 'AssessmentQuestion', required: true },
    student_answer: { type: String, default: null },
    selected_choice: { type: String, default: null },
    is_correct: { type: Boolean, default: null },
    score: { type: Number, default: null },
    ai_comment: { type: String, default: null },
    answered_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

AssessmentAnswerSchema.index({ attempt_id: 1 });
AssessmentAnswerSchema.index({ question_id: 1 });

export const AssessmentAnswerModel = mongoose.model<IAssessmentAnswer>('AssessmentAnswer', AssessmentAnswerSchema);

export interface AssessmentWithQuestions extends IAssessment {
  questions: IAssessmentQuestion[];
}

export class AssessmentRepository extends BaseRepository<IAssessment> {
  constructor() {
    super(AssessmentModel);
  }

  public async findByStudentId(studentId: string, session?: ClientSession): Promise<IAssessment[]> {
    return this.findAll({ student_id: studentId } as any, session);
  }

  public async findLatestDiagnostic(studentId: string, session?: ClientSession): Promise<IAssessment | null> {
    const query = this.model.findOne({ student_id: studentId, type: 'diagnostic' }).sort({ createdAt: -1 });
    if (session) query.session(session);
    return query.exec();
  }

  public async findWithQuestions(id: string, session?: ClientSession): Promise<AssessmentWithQuestions | null> {
    const assessment = await this.findById(id, session);

    if (!assessment) {
      return null;
    }

    const questions = await assessmentQuestionRepository.findByAssessmentId(id, session);

    return {
      ...assessment.toObject(),
      questions,
    } as AssessmentWithQuestions;
  }

  public async createWithQuestions(data: {
    questions?: any[];
    [key: string]: any;
  }): Promise<AssessmentWithQuestions> {
    return this.transaction<AssessmentWithQuestions>(async (session) => {
      const { questions = [], ...assessmentPayload } = data;
      const assessment = await this.create(
        {
          ...assessmentPayload,
          total_questions: questions.length > 0 ? questions.length : (assessmentPayload.total_questions ?? 0),
        } as any,
        session
      );

      if (questions.length > 0) {
        await assessmentQuestionRepository.bulkCreate(assessment._id.toString(), questions, session);
      }

      const createdQuestions = await assessmentQuestionRepository.findByAssessmentId(
        assessment._id.toString(),
        session
      );

      return {
        ...assessment.toObject(),
        questions: createdQuestions,
      } as AssessmentWithQuestions;
    });
  }
}

export class AssessmentQuestionRepository extends BaseRepository<IAssessmentQuestion> {
  constructor() {
    super(AssessmentQuestionModel);
  }

  public async findByAssessmentId(
    assessmentId: string,
    session?: ClientSession
  ): Promise<IAssessmentQuestion[]> {
    const query = this.model.find({ assessment_id: assessmentId }).sort({ order_index: 1 });
    if (session) query.session(session);
    return query.exec();
  }

  public async bulkCreate(
    assessmentId: string,
    questions: any[],
    session?: ClientSession
  ): Promise<void> {
    if (questions.length === 0) {
      return;
    }

    const docs = questions.map((question, index) => ({
      assessment_id: assessmentId,
      question_type: question.question_type,
      topic: question.topic,
      difficulty_level: question.difficulty_level,
      question_text: question.question_text,
      choices: question.choices,
      correct_answer: question.correct_answer,
      solution_steps: question.solution_steps,
      explanation: question.explanation,
      score: question.score ?? 1,
      order_index: question.order_index ?? index + 1,
    }));

    await this.model.insertMany(docs, { session });
  }
}

export class AssessmentAttemptRepository extends BaseRepository<IAssessmentAttempt> {
  constructor() {
    super(AssessmentAttemptModel);
  }

  public async findByStudentId(studentId: string, session?: ClientSession): Promise<IAssessmentAttempt[]> {
    return this.findAll({ student_id: studentId } as any, session);
  }
}

export class AssessmentAnswerRepository extends BaseRepository<IAssessmentAnswer> {
  constructor() {
    super(AssessmentAnswerModel);
  }

  public async findByAttemptId(attemptId: string, session?: ClientSession): Promise<IAssessmentAnswer[]> {
    return this.findAll({ attempt_id: attemptId } as any, session);
  }
}

export const assessmentRepository = new AssessmentRepository();
export const assessmentQuestionRepository = new AssessmentQuestionRepository();
export const assessmentAttemptRepository = new AssessmentAttemptRepository();
export const assessmentAnswerRepository = new AssessmentAnswerRepository();
