import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';
import type { UserRole, JsonObject } from '../types';

export type StaffDepartment = 'academic' | 'operations' | 'support' | 'engineering' | 'finance' | 'other';
export type StaffEmploymentStatus = 'active' | 'inactive' | 'on_leave';
export type TeacherProfileStatus = 'active' | 'inactive' | 'on_leave';
export type ParentProfileStatus = 'active' | 'inactive';

export interface IRoleProfile extends Document {
  user_id: mongoose.Types.ObjectId;
  role: UserRole;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  locale: string | null;
  timezone: string | null;
  onboarding_completed_at: Date | null;
  metadata: JsonObject;
  createdAt: Date;
  updatedAt: Date;
}

const RoleProfileSchema = new Schema<IRoleProfile>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['student', 'parent', 'admin', 'teacher'], required: true },
    display_name: { type: String, default: null, trim: true },
    bio: { type: String, default: null },
    avatar_url: { type: String, default: null },
    locale: { type: String, default: null },
    timezone: { type: String, default: null },
    onboarding_completed_at: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

RoleProfileSchema.index({ user_id: 1, role: 1 }, { unique: true });
RoleProfileSchema.index({ role: 1 });

export const RoleProfileModel = mongoose.model<IRoleProfile>('RoleProfile', RoleProfileSchema);

export interface IStaffProfile extends Document {
  user_id: mongoose.Types.ObjectId;
  employee_code: string | null;
  department: StaffDepartment | null;
  title: string | null;
  phone: string | null;
  status: StaffEmploymentStatus;
  permissions_metadata: JsonObject;
  createdAt: Date;
  updatedAt: Date;
}

const StaffProfileSchema = new Schema<IStaffProfile>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    employee_code: { type: String, default: null, trim: true },
    department: {
      type: String,
      enum: ['academic', 'operations', 'support', 'engineering', 'finance', 'other', null],
      default: null,
    },
    title: { type: String, default: null, trim: true },
    phone: { type: String, default: null, trim: true },
    status: { type: String, enum: ['active', 'inactive', 'on_leave'], default: 'active' },
    permissions_metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

StaffProfileSchema.index({ user_id: 1 }, { unique: true });
StaffProfileSchema.index({ department: 1, status: 1 });

export const StaffProfileModel = mongoose.model<IStaffProfile>('StaffProfile', StaffProfileSchema);

export interface ITeacherProfile extends Document {
  user_id: mongoose.Types.ObjectId;
  staff_profile_id: mongoose.Types.ObjectId | null;
  specialties: string[];
  grade_levels: number[];
  certifications: string[];
  years_of_experience: number | null;
  phone: string | null;
  office_hours: string | null;
  status: TeacherProfileStatus;
  metadata: JsonObject;
  createdAt: Date;
  updatedAt: Date;
}

const TeacherProfileSchema = new Schema<ITeacherProfile>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    staff_profile_id: { type: Schema.Types.ObjectId, ref: 'StaffProfile', default: null },
    specialties: [{ type: String }],
    grade_levels: [{ type: Number }],
    certifications: [{ type: String }],
    years_of_experience: { type: Number, default: null, min: 0 },
    phone: { type: String, default: null, trim: true },
    office_hours: { type: String, default: null },
    status: { type: String, enum: ['active', 'inactive', 'on_leave'], default: 'active' },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

TeacherProfileSchema.index({ user_id: 1 }, { unique: true });
TeacherProfileSchema.index({ status: 1 });
TeacherProfileSchema.index({ grade_levels: 1 });

export const TeacherProfileModel = mongoose.model<ITeacherProfile>('TeacherProfile', TeacherProfileSchema);

export interface IParentProfile extends Document {
  user_id: mongoose.Types.ObjectId;
  phone: string | null;
  address: string | null;
  relationship_label: string | null;
  preferred_contact_method: 'email' | 'phone' | 'app' | null;
  emergency_contact: boolean;
  status: ParentProfileStatus;
  metadata: JsonObject;
  createdAt: Date;
  updatedAt: Date;
}

const ParentProfileSchema = new Schema<IParentProfile>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    phone: { type: String, default: null, trim: true },
    address: { type: String, default: null },
    relationship_label: { type: String, default: null, trim: true },
    preferred_contact_method: { type: String, enum: ['email', 'phone', 'app', null], default: null },
    emergency_contact: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

ParentProfileSchema.index({ user_id: 1 }, { unique: true });
ParentProfileSchema.index({ status: 1 });

export const ParentProfileModel = mongoose.model<IParentProfile>('ParentProfile', ParentProfileSchema);

export class RoleProfileRepository extends BaseRepository<IRoleProfile> {
  constructor() {
    super(RoleProfileModel);
  }

  public async findByUserAndRole(
    userId: string,
    role: UserRole,
    session?: ClientSession
  ): Promise<IRoleProfile | null> {
    return this.findOne({ user_id: userId, role } as any, session);
  }
}

export class StaffProfileRepository extends BaseRepository<IStaffProfile> {
  constructor() {
    super(StaffProfileModel);
  }

  public async findByUserId(userId: string, session?: ClientSession): Promise<IStaffProfile | null> {
    return this.findOne({ user_id: userId } as any, session);
  }
}

export class TeacherProfileRepository extends BaseRepository<ITeacherProfile> {
  constructor() {
    super(TeacherProfileModel);
  }

  public async findByUserId(userId: string, session?: ClientSession): Promise<ITeacherProfile | null> {
    return this.findOne({ user_id: userId } as any, session);
  }
}

export class ParentProfileRepository extends BaseRepository<IParentProfile> {
  constructor() {
    super(ParentProfileModel);
  }

  public async findByUserId(userId: string, session?: ClientSession): Promise<IParentProfile | null> {
    return this.findOne({ user_id: userId } as any, session);
  }
}

export const roleProfileRepository = new RoleProfileRepository();
export const staffProfileRepository = new StaffProfileRepository();
export const teacherProfileRepository = new TeacherProfileRepository();
export const parentProfileRepository = new ParentProfileRepository();
