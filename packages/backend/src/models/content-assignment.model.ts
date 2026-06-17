import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';

export type ContentAssignmentTemplateType = 'curriculum_template' | 'lesson_template';
export type ContentAssignmentTargetType = 'class' | 'student';
export type ContentAssignmentStatus = 'active' | 'paused' | 'archived';
export type ContentAssignmentMaterializationStrategy = 'on_demand';
export type StudentAssignedContentStatus = 'active' | 'paused' | 'archived';

export interface AssignmentTemplateSnapshot {
  title: string;
  description?: string | null;
  grade_level?: number | null;
  difficulty_level?: string | null;
  topic?: string | null;
  status: string;
  published_at?: Date | null;
}

export interface AssignmentRecipientMapping {
  class_id?: mongoose.Types.ObjectId | null;
  student_ids: mongoose.Types.ObjectId[];
  applied_student_ids: mongoose.Types.ObjectId[];
}

export interface IContentAssignment extends Document {
  template_type: ContentAssignmentTemplateType;
  template_id: mongoose.Types.ObjectId;
  target_type: ContentAssignmentTargetType;
  target_id: mongoose.Types.ObjectId;
  assigned_by: mongoose.Types.ObjectId;
  assigned_by_role: string;
  status: ContentAssignmentStatus;
  auto_apply_new_students: boolean;
  materialization_strategy: ContentAssignmentMaterializationStrategy;
  template_snapshot: AssignmentTemplateSnapshot;
  recipient_mapping: AssignmentRecipientMapping;
  createdAt: Date;
  updatedAt: Date;
}

const AssignmentTemplateSnapshotSchema = new Schema<AssignmentTemplateSnapshot>(
  {
    title: { type: String, required: true },
    description: { type: String, default: null },
    grade_level: { type: Number, default: null },
    difficulty_level: { type: String, default: null },
    topic: { type: String, default: null },
    status: { type: String, required: true },
    published_at: { type: Date, default: null },
  },
  { _id: false }
);

const AssignmentRecipientMappingSchema = new Schema<AssignmentRecipientMapping>(
  {
    class_id: { type: Schema.Types.ObjectId, ref: 'TeacherClass', default: null },
    student_ids: [{ type: Schema.Types.ObjectId, ref: 'StudentProfile' }],
    applied_student_ids: [{ type: Schema.Types.ObjectId, ref: 'StudentProfile' }],
  },
  { _id: false }
);

const ContentAssignmentSchema = new Schema<IContentAssignment>(
  {
    template_type: { type: String, enum: ['curriculum_template', 'lesson_template'], required: true },
    template_id: { type: Schema.Types.ObjectId, required: true, refPath: 'template_ref' },
    target_type: { type: String, enum: ['class', 'student'], required: true },
    target_id: { type: Schema.Types.ObjectId, required: true },
    assigned_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assigned_by_role: { type: String, required: true },
    status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active' },
    auto_apply_new_students: { type: Boolean, default: true },
    materialization_strategy: { type: String, enum: ['on_demand'], default: 'on_demand' },
    template_snapshot: { type: AssignmentTemplateSnapshotSchema, required: true },
    recipient_mapping: { type: AssignmentRecipientMappingSchema, required: true },
  },
  { timestamps: true }
);

ContentAssignmentSchema.virtual('template_ref').get(function (this: IContentAssignment) {
  return this.template_type === 'curriculum_template' ? 'CurriculumTemplate' : 'LessonTemplate';
});
ContentAssignmentSchema.index({ assigned_by: 1, status: 1, createdAt: -1 });
ContentAssignmentSchema.index({ template_type: 1, template_id: 1 });
ContentAssignmentSchema.index({ target_type: 1, target_id: 1, status: 1 });
ContentAssignmentSchema.index({ 'recipient_mapping.class_id': 1, status: 1, auto_apply_new_students: 1 });

export const ContentAssignmentModel = mongoose.model<IContentAssignment>('ContentAssignment', ContentAssignmentSchema);

export interface IStudentAssignedContent extends Document {
  assignment_id: mongoose.Types.ObjectId;
  student_id: mongoose.Types.ObjectId;
  class_id: mongoose.Types.ObjectId | null;
  template_type: ContentAssignmentTemplateType;
  template_id: mongoose.Types.ObjectId;
  status: StudentAssignedContentStatus;
  materialization_strategy: ContentAssignmentMaterializationStrategy;
  assigned_by: mongoose.Types.ObjectId;
  assigned_at: Date;
  template_snapshot: AssignmentTemplateSnapshot;
  createdAt: Date;
  updatedAt: Date;
}

const StudentAssignedContentSchema = new Schema<IStudentAssignedContent>(
  {
    assignment_id: { type: Schema.Types.ObjectId, ref: 'ContentAssignment', required: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    class_id: { type: Schema.Types.ObjectId, ref: 'TeacherClass', default: null },
    template_type: { type: String, enum: ['curriculum_template', 'lesson_template'], required: true },
    template_id: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active' },
    materialization_strategy: { type: String, enum: ['on_demand'], default: 'on_demand' },
    assigned_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assigned_at: { type: Date, default: Date.now },
    template_snapshot: { type: AssignmentTemplateSnapshotSchema, required: true },
  },
  { timestamps: true }
);

StudentAssignedContentSchema.index({ assignment_id: 1, student_id: 1 }, { unique: true });
StudentAssignedContentSchema.index({ student_id: 1, status: 1, createdAt: -1 });
StudentAssignedContentSchema.index({ class_id: 1, status: 1 });
StudentAssignedContentSchema.index({ template_type: 1, template_id: 1, student_id: 1 });

export const StudentAssignedContentModel = mongoose.model<IStudentAssignedContent>(
  'StudentAssignedContent',
  StudentAssignedContentSchema
);

export class ContentAssignmentRepository extends BaseRepository<IContentAssignment> {
  constructor() {
    super(ContentAssignmentModel);
  }

  public async findActiveClassAutoApply(classId: string, session?: ClientSession): Promise<IContentAssignment[]> {
    return this.model
      .find({
        target_type: 'class',
        target_id: classId,
        status: 'active',
        auto_apply_new_students: true,
      })
      .session(session ?? null)
      .exec();
  }
}

export class StudentAssignedContentRepository extends BaseRepository<IStudentAssignedContent> {
  constructor() {
    super(StudentAssignedContentModel);
  }

  public async upsertForAssignment(
    data: Partial<IStudentAssignedContent>,
    session?: ClientSession
  ): Promise<IStudentAssignedContent> {
    const doc = await this.model
      .findOneAndUpdate(
        { assignment_id: data.assignment_id, student_id: data.student_id },
        { $setOnInsert: data },
        { new: true, upsert: true, session: session ?? undefined }
      )
      .exec();
    return doc;
  }
}

export const contentAssignmentRepository = new ContentAssignmentRepository();
export const studentAssignedContentRepository = new StudentAssignedContentRepository();
