import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';

export interface IUser extends Document {
  email: string;
  password_hash: string;
  full_name: string;
  role: 'student' | 'parent' | 'admin' | 'teacher' | 'staff';
  is_active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    full_name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['student', 'parent', 'admin', 'teacher', 'staff'], default: 'student' },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// email index already created by unique: true
UserSchema.index({ role: 1, is_active: 1 });

export const UserModel = mongoose.model<IUser>('User', UserSchema);

export interface UserWithProfile extends IUser {
  profile: any | null;
}

export class UserRepository extends BaseRepository<IUser> {
  constructor() {
    super(UserModel);
  }

  public async findByEmail(email: string): Promise<IUser | null> {
    return this.findOne({ email } as any);
  }

  public async findWithProfile(id: string, session?: ClientSession): Promise<UserWithProfile | null> {
    const user = await this.findById(id, session);

    if (!user) {
      return null;
    }

    const StudentProfileModel = mongoose.model('StudentProfile');
    const profile = await StudentProfileModel.findOne({ user_id: user._id }).session(session ?? null).lean();

    return {
      ...user.toObject(),
      profile: profile ?? null,
    } as UserWithProfile;
  }
}

export const userRepository = new UserRepository();
