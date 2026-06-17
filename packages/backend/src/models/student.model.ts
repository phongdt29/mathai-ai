import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';

export interface IStudentProfile extends Document {
  user_id: mongoose.Types.ObjectId;
  date_of_birth: Date | null;
  phone: string | null;
  address: string | null;
  school_name: string | null;
  grade_level: number | null;
  self_assessed_level: string | null;
  math_average_score: number | null;
  preferred_teacher_gender: string | null;
  selected_tutor_id: mongoose.Types.ObjectId | null;
  favorite_color: string | null;
  interests: string | null;
  initial_classification: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const StudentProfileSchema = new Schema<IStudentProfile>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date_of_birth: { type: Date, default: null },
    phone: { type: String, default: null },
    address: { type: String, default: null },
    school_name: { type: String, default: null },
    grade_level: { type: Number, default: null },
    self_assessed_level: { type: String, default: null },
    math_average_score: { type: Number, default: null },
    preferred_teacher_gender: { type: String, enum: ['thay', 'co', null], default: null },
    selected_tutor_id: { type: Schema.Types.ObjectId, ref: 'AITutor', default: null },
    favorite_color: { type: String, default: null },
    interests: { type: String, default: null },
    initial_classification: { type: String, default: null },
  },
  { timestamps: true }
);

StudentProfileSchema.index({ user_id: 1 }, { unique: true });
StudentProfileSchema.index({ grade_level: 1 });

export const StudentProfileModel = mongoose.model<IStudentProfile>('StudentProfile', StudentProfileSchema);

export interface IStudentThemePreference extends Document {
  student_id: mongoose.Types.ObjectId;
  favorite_color: string | null;
  font_size: string | null;
  theme_mode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const StudentThemePreferenceSchema = new Schema<IStudentThemePreference>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    favorite_color: { type: String, default: null },
    font_size: { type: String, default: null },
    theme_mode: { type: String, default: null },
  },
  { timestamps: true }
);

StudentThemePreferenceSchema.index({ student_id: 1 }, { unique: true });

export const StudentThemePreferenceModel = mongoose.model<IStudentThemePreference>(
  'StudentThemePreference',
  StudentThemePreferenceSchema
);

export interface StudentProfileWithTheme extends IStudentProfile {
  theme: IStudentThemePreference | null;
}

export interface StudentProfileWithUser extends IStudentProfile {
  user: any | null;
}

export class StudentProfileRepository extends BaseRepository<IStudentProfile> {
  constructor() {
    super(StudentProfileModel);
  }

  public async findByUserId(userId: string, session?: ClientSession): Promise<IStudentProfile | null> {
    return this.findOne({ user_id: userId } as any, session);
  }

  /** Danh sách id hồ sơ học sinh — dùng cho scheduled jobs (nhắc học, cảnh báo). */
  public async findAllStudentIds(limit = 5000): Promise<string[]> {
    const docs = await StudentProfileModel.find({}, { _id: 1 })
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) => String(d._id));
  }

  public async findWithTheme(studentId: string, session?: ClientSession): Promise<StudentProfileWithTheme | null> {
    const student = await this.findById(studentId, session);

    if (!student) {
      return null;
    }

    const theme = await StudentThemePreferenceModel.findOne({ student_id: student._id })
      .session(session ?? null)
      .lean();

    return {
      ...student.toObject(),
      theme: theme ?? null,
    } as StudentProfileWithTheme;
  }

  public async findWithUser(studentId: string, session?: ClientSession): Promise<StudentProfileWithUser | null> {
    const student = await this.findById(studentId, session);

    if (!student) {
      return null;
    }

    const UserModel = mongoose.model('User');
    const user = await UserModel.findById(student.user_id).session(session ?? null).lean();

    return {
      ...student.toObject(),
      user: user ?? null,
    } as StudentProfileWithUser;
  }
}

export class StudentThemeRepository extends BaseRepository<IStudentThemePreference> {
  constructor() {
    super(StudentThemePreferenceModel);
  }

  public async findByStudentId(studentId: string, session?: ClientSession): Promise<IStudentThemePreference | null> {
    return this.findOne({ student_id: studentId } as any, session);
  }
}

export const studentProfileRepository = new StudentProfileRepository();
export const studentThemeRepository = new StudentThemeRepository();
