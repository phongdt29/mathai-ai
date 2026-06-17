import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';
import type { CurriculumStage } from '../utils/curriculum-stages';

export type { CurriculumStage } from '../utils/curriculum-stages';

export interface ICurriculum extends Document {
  student_id: mongoose.Types.ObjectId;
  title: string;
  input_level: string | null;
  ai_summary: string | null;
  target_goal: string | null;
  estimated_total_sessions: number | null;
  status: string;
  created_by_ai: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CurriculumSchema = new Schema<ICurriculum>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'StudentProfile', required: true },
    title: { type: String, required: true },
    input_level: { type: String, default: null },
    ai_summary: { type: String, default: null },
    target_goal: { type: String, default: null },
    estimated_total_sessions: { type: Number, default: null },
    status: { type: String, default: 'active' },
    created_by_ai: { type: Boolean, default: false },
  },
  { timestamps: true }
);

CurriculumSchema.index({ student_id: 1, status: 1 });

export const CurriculumModel = mongoose.model<ICurriculum>('Curriculum', CurriculumSchema);

export interface ICurriculumModule extends Document {
  curriculum_id: mongoose.Types.ObjectId;
  module_title: string;
  module_description: string | null;
  topic: string | null;
  order_index: number;
  /** Giai đoạn lộ trình (foundation/consolidation/advanced/practice). */
  stage: CurriculumStage | null;
  estimated_sessions: number | null;
  target_mastery: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const CurriculumModuleSchema = new Schema<ICurriculumModule>(
  {
    curriculum_id: { type: Schema.Types.ObjectId, ref: 'Curriculum', required: true },
    module_title: { type: String, required: true },
    module_description: { type: String, default: null },
    topic: { type: String, default: null },
    order_index: { type: Number, required: true },
    stage: {
      type: String,
      enum: ['foundation', 'consolidation', 'advanced', 'practice'],
      default: null,
    },
    estimated_sessions: { type: Number, default: null },
    target_mastery: { type: Number, default: null },
    status: { type: String, default: 'pending' },
  },
  { timestamps: true }
);

CurriculumModuleSchema.index({ curriculum_id: 1, order_index: 1 });

export const CurriculumModuleModel = mongoose.model<ICurriculumModule>('CurriculumModule', CurriculumModuleSchema);

export interface CurriculumWithModules extends ICurriculum {
  modules: ICurriculumModule[];
}

export class CurriculumRepository extends BaseRepository<ICurriculum> {
  constructor() {
    super(CurriculumModel);
  }

  public async findActiveByStudent(studentId: string, session?: ClientSession): Promise<ICurriculum[]> {
    const query = this.model.find({ student_id: studentId, status: 'active' }).sort({ updatedAt: -1 });
    if (session) query.session(session);
    return query.exec();
  }

  public async findWithModules(curriculumId: string, session?: ClientSession): Promise<CurriculumWithModules | null> {
    const curriculum = await this.findById(curriculumId, session);

    if (!curriculum) {
      return null;
    }

    const modules = await curriculumModuleRepository.findByCurriculumId(curriculumId, session);

    return {
      ...curriculum.toObject(),
      modules,
    } as CurriculumWithModules;
  }
}

export class CurriculumModuleRepository extends BaseRepository<ICurriculumModule> {
  constructor() {
    super(CurriculumModuleModel);
  }

  public async findByCurriculumId(curriculumId: string, session?: ClientSession): Promise<ICurriculumModule[]> {
    const query = this.model.find({ curriculum_id: curriculumId }).sort({ order_index: 1 });
    if (session) query.session(session);
    return query.exec();
  }
}

export const curriculumRepository = new CurriculumRepository();
export const curriculumModuleRepository = new CurriculumModuleRepository();
