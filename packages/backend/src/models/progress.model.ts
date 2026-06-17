import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';

export interface ITopicMastery extends Document {
  student_id: mongoose.Types.ObjectId;
  topic: string;
  grade_level: number;
  mastery_level: number;
  total_attempts: number;
  correct_attempts: number;
  strength_label: string | null;
  last_practiced_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const TopicMasterySchema = new Schema<ITopicMastery>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    topic: { type: String, required: true },
    grade_level: { type: Number, required: true },
    mastery_level: { type: Number, default: 0 },
    total_attempts: { type: Number, default: 0 },
    correct_attempts: { type: Number, default: 0 },
    strength_label: { type: String, default: null },
    last_practiced_at: { type: Date, default: null },
  },
  { timestamps: true }
);

TopicMasterySchema.index({ student_id: 1, topic: 1, grade_level: 1 }, { unique: true });

export const TopicMasteryModel = mongoose.model<ITopicMastery>('TopicMastery', TopicMasterySchema);

export interface IStudentProgress extends Document {
  student_id: mongoose.Types.ObjectId;
  curriculum_id: mongoose.Types.ObjectId;
  total_lessons: number;
  completed_lessons: number;
  completion_percentage: number;
  average_quiz_score: number | null;
  total_study_time_minutes: number;
  current_streak_days: number;
  longest_streak_days: number;
  last_study_date: Date | null;
  ai_progress_summary: string | null;
  predicted_improvement: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const StudentProgressSchema = new Schema<IStudentProgress>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    curriculum_id: { type: Schema.Types.ObjectId, ref: 'Curriculum', required: true },
    total_lessons: { type: Number, default: 0 },
    completed_lessons: { type: Number, default: 0 },
    completion_percentage: { type: Number, default: 0 },
    average_quiz_score: { type: Number, default: null },
    total_study_time_minutes: { type: Number, default: 0 },
    current_streak_days: { type: Number, default: 0 },
    longest_streak_days: { type: Number, default: 0 },
    last_study_date: { type: Date, default: null },
    ai_progress_summary: { type: String, default: null },
    predicted_improvement: { type: Number, default: null },
  },
  { timestamps: true }
);

StudentProgressSchema.index({ student_id: 1 });
StudentProgressSchema.index({ curriculum_id: 1 });

export const StudentProgressModel = mongoose.model<IStudentProgress>('StudentProgress', StudentProgressSchema);

import { LessonRecommendationModel, ILessonRecommendation } from './lesson.model';
export { ILessonRecommendation } from './lesson.model';

export class TopicMasteryRepository extends BaseRepository<ITopicMastery> {
  constructor() {
    super(TopicMasteryModel);
  }

  public async findByStudent(studentId: string, session?: ClientSession): Promise<ITopicMastery[]> {
    const query = this.model.find({ student_id: studentId }).sort({ mastery_level: -1 });
    if (session) query.session(session);
    return query.exec();
  }

  public async updateMastery(
    studentId: string,
    topic: string,
    gradeLevel: number,
    data: Partial<ITopicMastery>
  ): Promise<ITopicMastery> {
    const existing = await this.findOne({
      student_id: studentId,
      topic,
      grade_level: gradeLevel,
    } as any);

    if (existing) {
      return this.update(existing._id.toString(), data);
    }

    return this.create({
      student_id: studentId,
      topic,
      grade_level: gradeLevel,
      mastery_level: data.mastery_level ?? 0,
      total_attempts: data.total_attempts ?? 0,
      correct_attempts: data.correct_attempts ?? 0,
      strength_label: data.strength_label ?? null,
      last_practiced_at: data.last_practiced_at ?? null,
    } as any);
  }
}

export class StudentProgressRepository extends BaseRepository<IStudentProgress> {
  constructor() {
    super(StudentProgressModel);
  }

  public async findByStudent(studentId: string, session?: ClientSession): Promise<IStudentProgress[]> {
    const query = this.model.find({ student_id: studentId }).sort({ updatedAt: -1 });
    if (session) query.session(session);
    return query.exec();
  }
}

export class LessonRecommendationRepository extends BaseRepository<ILessonRecommendation> {
  constructor() {
    super(LessonRecommendationModel);
  }

  public async findByStudent(studentId: string, session?: ClientSession): Promise<ILessonRecommendation[]> {
    const query = this.model.find({ student_id: studentId }).sort({ recommended_date: -1, priority: -1 });
    if (session) query.session(session);
    return query.exec();
  }

  public async getRecentRecommendations(
    studentId: string,
    limit: number = 5,
    session?: ClientSession
  ): Promise<ILessonRecommendation[]> {
    const query = this.model.find({ student_id: studentId }).sort({ createdAt: -1 }).limit(limit);
    if (session) query.session(session);
    return query.exec();
  }
}

export const topicMasteryRepository = new TopicMasteryRepository();
export const studentProgressRepository = new StudentProgressRepository();
export const lessonRecommendationRepository = new LessonRecommendationRepository();
