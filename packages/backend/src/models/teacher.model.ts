import mongoose, { Schema, Document } from 'mongoose';
import BaseRepository from './base.model';

// ── TeacherClass ──
export interface ITeacherClass extends Document {
  teacher_id: mongoose.Types.ObjectId;
  name: string;
  subject: string;
  grade_level: number;
  schedule: string;
  description: string | null;
  student_ids: mongoose.Types.ObjectId[];
  is_active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TeacherClassSchema = new Schema<ITeacherClass>(
  {
    teacher_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    subject: { type: String, required: true },
    grade_level: { type: Number, required: true },
    schedule: { type: String, default: '' },
    description: { type: String, default: null },
    student_ids: [{ type: Schema.Types.ObjectId, ref: 'StudentProfile' }],
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

TeacherClassSchema.index({ teacher_id: 1, is_active: 1 });
TeacherClassSchema.index({ student_ids: 1 });

export const TeacherClassModel = mongoose.model<ITeacherClass>('TeacherClass', TeacherClassSchema);

export class TeacherClassRepository extends BaseRepository<ITeacherClass> {
  constructor() {
    super(TeacherClassModel);
  }

  public async findByTeacherId(teacherId: string): Promise<ITeacherClass[]> {
    return this.model.find({ teacher_id: teacherId, is_active: true }).sort({ name: 1 }).exec();
  }

  public async findByTeacherIdWithStudents(teacherId: string): Promise<ITeacherClass[]> {
    return this.model
      .find({ teacher_id: teacherId, is_active: true })
      .populate({
        path: 'student_ids',
        populate: { path: 'user_id', select: 'email full_name is_active' },
      })
      .sort({ name: 1 })
      .exec();
  }

  public async findClassesByStudentId(studentProfileId: string): Promise<ITeacherClass[]> {
    return this.model.find({ student_ids: studentProfileId, is_active: true }).exec();
  }

  public async addStudent(classId: string, studentProfileId: string): Promise<ITeacherClass | null> {
    return this.model.findByIdAndUpdate(
      classId,
      { $addToSet: { student_ids: studentProfileId } },
      { new: true }
    ).exec();
  }

  public async removeStudent(classId: string, studentProfileId: string): Promise<ITeacherClass | null> {
    return this.model.findByIdAndUpdate(
      classId,
      { $pull: { student_ids: studentProfileId } },
      { new: true }
    ).exec();
  }
}

// ── TeacherAssignment ──
export interface ITeacherAssignment extends Document {
  teacher_id: mongoose.Types.ObjectId;
  class_id: mongoose.Types.ObjectId;
  title: string;
  description: string | null;
  type: 'homework' | 'quiz' | 'exam';
  status: 'draft' | 'active' | 'grading' | 'closed';
  due_date: Date | null;
  total_points: number;
  rubric_contract_id?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const TeacherAssignmentSchema = new Schema<ITeacherAssignment>(
  {
    teacher_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    class_id: { type: Schema.Types.ObjectId, ref: 'TeacherClass', required: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    type: { type: String, enum: ['homework', 'quiz', 'exam'], required: true },
    status: { type: String, enum: ['draft', 'active', 'grading', 'closed'], default: 'draft' },
    due_date: { type: Date, default: null },
    total_points: { type: Number, default: 10 },
    rubric_contract_id: { type: Schema.Types.ObjectId, ref: 'MathRubricContract', default: null },
  },
  { timestamps: true }
);

TeacherAssignmentSchema.index({ teacher_id: 1, status: 1 });
TeacherAssignmentSchema.index({ class_id: 1 });

export const TeacherAssignmentModel = mongoose.model<ITeacherAssignment>('TeacherAssignment', TeacherAssignmentSchema);

export class TeacherAssignmentRepository extends BaseRepository<ITeacherAssignment> {
  constructor() {
    super(TeacherAssignmentModel);
  }

  public async findByTeacherId(teacherId: string, status?: string): Promise<ITeacherAssignment[]> {
    const query: any = { teacher_id: teacherId };
    if (status && status !== 'all') query.status = status;
    return this.model.find(query).populate('class_id', 'name').sort({ createdAt: -1 }).exec();
  }

  public async findByClassId(classId: string): Promise<ITeacherAssignment[]> {
    return this.model.find({ class_id: classId }).sort({ createdAt: -1 }).exec();
  }
}

// ── StudentSubmission ──

export interface IStudentSubmissionAttachment {
  attachment_id: string;
  file_url: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: Date;
}

export interface IStudentSubmission extends Document {
  assignment_id: mongoose.Types.ObjectId;
  student_id: mongoose.Types.ObjectId;
  content: string;
  score: number | null;
  feedback: string | null;
  rubric_score: Record<string, unknown> | null;
  graded_at: Date | null;
  submitted_at: Date;
  attachments: IStudentSubmissionAttachment[];
  is_late: boolean;
  resubmit_count: number;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSubmissionAttachmentSchema = new Schema<IStudentSubmissionAttachment>(
  {
    attachment_id: { type: String, required: true },
    file_url: { type: String, required: true },
    file_name: { type: String, required: true },
    mime_type: { type: String, required: true },
    size_bytes: { type: Number, required: true },
    uploaded_at: { type: Date, required: true },
  },
  { _id: false }
);

const StudentSubmissionSchema = new Schema<IStudentSubmission>(
  {
    assignment_id: { type: Schema.Types.ObjectId, ref: 'TeacherAssignment', required: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    content: { type: String, default: '' },
    score: { type: Number, default: null },
    feedback: { type: String, default: null },
    rubric_score: { type: Schema.Types.Mixed, default: null },
    graded_at: { type: Date, default: null },
    submitted_at: { type: Date, default: Date.now },
    attachments: { type: [StudentSubmissionAttachmentSchema], default: [] },
    is_late: { type: Boolean, default: false },
    resubmit_count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

StudentSubmissionSchema.index({ assignment_id: 1, student_id: 1 }, { unique: true });

export const StudentSubmissionModel = mongoose.model<IStudentSubmission>('StudentSubmission', StudentSubmissionSchema);

export class StudentSubmissionRepository extends BaseRepository<IStudentSubmission> {
  constructor() {
    super(StudentSubmissionModel);
  }

  public async findByAssignment(assignmentId: string): Promise<IStudentSubmission[]> {
    return this.model.find({ assignment_id: assignmentId }).populate({
      path: 'student_id',
      populate: { path: 'user_id', select: 'full_name email' },
    }).exec();
  }



  public async findByAssignmentAndStudent(assignmentId: string, studentId: string): Promise<IStudentSubmission | null> {
    return this.model.findOne({ assignment_id: assignmentId, student_id: studentId }).exec();
  }

  public async countByAssignment(assignmentId: string): Promise<{ submitted: number; graded: number }> {
    const [submitted, graded] = await Promise.all([
      this.model.countDocuments({ assignment_id: assignmentId }),
      this.model.countDocuments({ assignment_id: assignmentId, score: { $ne: null } }),
    ]);
    return { submitted, graded };
  }

  public async avgScoreByAssignment(assignmentId: string): Promise<number | null> {
    const result = await this.model.aggregate([
      { $match: { assignment_id: new mongoose.Types.ObjectId(assignmentId), score: { $ne: null } } },
      { $group: { _id: null, avg: { $avg: '$score' } } },
    ]);
    return result.length > 0 ? Math.round(result[0].avg * 10) / 10 : null;
  }
}

export const teacherClassRepository = new TeacherClassRepository();
export const teacherAssignmentRepository = new TeacherAssignmentRepository();
export const studentSubmissionRepository = new StudentSubmissionRepository();
