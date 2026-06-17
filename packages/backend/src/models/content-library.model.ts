import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';

export type ContentTemplateStatus = 'draft' | 'published' | 'archived';
export type ContentDifficultyLevel = 'easy' | 'medium' | 'hard';
export type TemplateAnswerType = 'multiple_choice' | 'short_answer' | 'essay';
export type MathQuestionType =
  | 'multiple_choice'
  | 'short_answer'
  | 'essay'
  | 'proof'
  | 'calculation'
  | 'word_problem'
  | 'graphing';
export type MathQuestionSource = 'ai' | 'manual' | 'imported' | 'textbook' | 'assessment';
export type QuestionBankStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived';
export type MathRubricCriterionScoring = 'points' | 'levels';
export type MathRubricContractStatus = 'draft' | 'active' | 'archived';
export type MathRubricAttachmentType = 'question_bank_item' | 'exercise_template' | 'assessment';

export interface MathLearningObjectiveRef {
  objective_id: string;
  description?: string | null;
}

export interface MathTaxonomyMetadata {
  grade_level?: number | null;
  math_topic?: string | null;
  math_topic_path?: string[];
  learning_objectives?: MathLearningObjectiveRef[];
  prerequisite_objectives?: MathLearningObjectiveRef[];
  tags?: string[];
}

export interface MathRubricLevel {
  label: string;
  points: number;
  description?: string | null;
}

export interface MathRubricCriterion {
  key: string;
  title: string;
  description?: string | null;
  max_points: number;
  scoring: MathRubricCriterionScoring;
  levels?: MathRubricLevel[];
}

export interface ICurriculumTemplate extends Document {
  title: string;
  description: string | null;
  grade_level: number;
  age_group: string | null;
  subject: string;
  difficulty_level: ContentDifficultyLevel;
  target_goal: string | null;
  estimated_total_sessions: number | null;
  status: ContentTemplateStatus;
  created_by: mongoose.Types.ObjectId;
  created_by_role: string;
  source: 'ai' | 'manual';
  ai_prompt: string | null;
  ai_model: string | null;
  tokens_input: number;
  tokens_output: number;
  published_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CurriculumTemplateSchema = new Schema<ICurriculumTemplate>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    grade_level: { type: Number, required: true, min: 1, max: 12 },
    age_group: { type: String, default: null },
    subject: { type: String, default: 'math', trim: true },
    difficulty_level: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
    target_goal: { type: String, default: null },
    estimated_total_sessions: { type: Number, default: null },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    created_by_role: { type: String, required: true },
    source: { type: String, enum: ['ai', 'manual'], default: 'ai' },
    ai_prompt: { type: String, default: null },
    ai_model: { type: String, default: null },
    tokens_input: { type: Number, default: 0 },
    tokens_output: { type: Number, default: 0 },
    published_at: { type: Date, default: null },
  },
  { timestamps: true }
);

CurriculumTemplateSchema.index({ status: 1, grade_level: 1, difficulty_level: 1 });
CurriculumTemplateSchema.index({ created_by: 1, createdAt: -1 });
CurriculumTemplateSchema.index({ title: 'text', description: 'text', target_goal: 'text' });

export const CurriculumTemplateModel = mongoose.model<ICurriculumTemplate>(
  'CurriculumTemplate',
  CurriculumTemplateSchema
);

export interface ICurriculumModuleTemplate extends Document {
  curriculum_template_id: mongoose.Types.ObjectId;
  module_title: string;
  module_description: string | null;
  topic: string | null;
  order_index: number;
  estimated_sessions: number | null;
  target_mastery: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const CurriculumModuleTemplateSchema = new Schema<ICurriculumModuleTemplate>(
  {
    curriculum_template_id: { type: Schema.Types.ObjectId, ref: 'CurriculumTemplate', required: true },
    module_title: { type: String, required: true, trim: true },
    module_description: { type: String, default: null },
    topic: { type: String, default: null },
    order_index: { type: Number, required: true },
    estimated_sessions: { type: Number, default: null },
    target_mastery: { type: Number, default: null },
  },
  { timestamps: true }
);

CurriculumModuleTemplateSchema.index({ curriculum_template_id: 1, order_index: 1 });

export const CurriculumModuleTemplateModel = mongoose.model<ICurriculumModuleTemplate>(
  'CurriculumModuleTemplate',
  CurriculumModuleTemplateSchema
);

export interface ILessonTemplate extends Document {
  curriculum_template_id: mongoose.Types.ObjectId | null;
  module_template_id: mongoose.Types.ObjectId | null;
  lesson_title: string;
  theory_content: string | null;
  lesson_objective: string | null;
  grade_level: number;
  age_group: string | null;
  topic: string | null;
  difficulty_level: ContentDifficultyLevel;
  estimated_minutes: number | null;
  order_index: number;
  status: ContentTemplateStatus;
  created_by: mongoose.Types.ObjectId;
  created_by_role: string;
  source: 'ai' | 'manual';
  ai_prompt: string | null;
  ai_model: string | null;
  tokens_input: number;
  tokens_output: number;
  published_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const LessonTemplateSchema = new Schema<ILessonTemplate>(
  {
    curriculum_template_id: { type: Schema.Types.ObjectId, ref: 'CurriculumTemplate', default: null },
    module_template_id: { type: Schema.Types.ObjectId, ref: 'CurriculumModuleTemplate', default: null },
    lesson_title: { type: String, required: true, trim: true },
    theory_content: { type: String, default: null },
    lesson_objective: { type: String, default: null },
    grade_level: { type: Number, required: true, min: 1, max: 12 },
    age_group: { type: String, default: null },
    topic: { type: String, default: null },
    difficulty_level: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
    estimated_minutes: { type: Number, default: null },
    order_index: { type: Number, default: 1 },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    created_by_role: { type: String, required: true },
    source: { type: String, enum: ['ai', 'manual'], default: 'ai' },
    ai_prompt: { type: String, default: null },
    ai_model: { type: String, default: null },
    tokens_input: { type: Number, default: 0 },
    tokens_output: { type: Number, default: 0 },
    published_at: { type: Date, default: null },
  },
  { timestamps: true }
);

LessonTemplateSchema.index({ status: 1, grade_level: 1, difficulty_level: 1 });
LessonTemplateSchema.index({ curriculum_template_id: 1, module_template_id: 1, order_index: 1 });
LessonTemplateSchema.index({ created_by: 1, createdAt: -1 });
LessonTemplateSchema.index({ lesson_title: 'text', theory_content: 'text', lesson_objective: 'text', topic: 'text' });

export const LessonTemplateModel = mongoose.model<ILessonTemplate>('LessonTemplate', LessonTemplateSchema);

export interface IExerciseTemplate extends Document {
  lesson_template_id: mongoose.Types.ObjectId;
  topic: string | null;
  difficulty_level: ContentDifficultyLevel;
  question_text: string;
  answer_type: TemplateAnswerType;
  choices: unknown;
  correct_answer: string;
  solution_steps: unknown;
  explanation: string | null;
  order_index: number;
  grade_level?: number | null;
  math_topic?: string | null;
  math_topic_path?: string[];
  question_type?: MathQuestionType | null;
  source?: MathQuestionSource | null;
  question_bank_status?: QuestionBankStatus | null;
  max_points?: number | null;
  estimated_minutes?: number | null;
  learning_objectives?: MathLearningObjectiveRef[];
  prerequisite_objectives?: MathLearningObjectiveRef[];
  tags?: string[];
  rubric_contract_id?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ExerciseTemplateSchema = new Schema<IExerciseTemplate>(
  {
    lesson_template_id: { type: Schema.Types.ObjectId, ref: 'LessonTemplate', required: true },
    topic: { type: String, default: null },
    difficulty_level: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
    question_text: { type: String, required: true },
    answer_type: { type: String, enum: ['multiple_choice', 'short_answer', 'essay'], required: true },
    choices: { type: Schema.Types.Mixed, default: null },
    correct_answer: { type: String, required: true },
    solution_steps: { type: Schema.Types.Mixed, default: null },
    explanation: { type: String, default: null },
    order_index: { type: Number, required: true },
    grade_level: { type: Number, min: 1, max: 12, default: null },
    math_topic: { type: String, default: null, trim: true },
    math_topic_path: { type: [String], default: undefined },
    question_type: {
      type: String,
      enum: ['multiple_choice', 'short_answer', 'essay', 'proof', 'calculation', 'word_problem', 'graphing'],
      default: null,
    },
    source: { type: String, enum: ['ai', 'manual', 'imported', 'textbook', 'assessment'], default: null },
    question_bank_status: { type: String, enum: ['draft', 'review', 'approved', 'published', 'archived'], default: null },
    max_points: { type: Number, min: 0, default: null },
    estimated_minutes: { type: Number, min: 0, default: null },
    learning_objectives: { type: Schema.Types.Mixed, default: undefined },
    prerequisite_objectives: { type: Schema.Types.Mixed, default: undefined },
    tags: { type: [String], default: undefined },
    rubric_contract_id: { type: Schema.Types.ObjectId, ref: 'MathRubricContract', default: null },
  },
  { timestamps: true }
);

ExerciseTemplateSchema.index({ lesson_template_id: 1, order_index: 1 });
ExerciseTemplateSchema.index({ grade_level: 1, math_topic: 1, difficulty_level: 1, question_bank_status: 1 });
ExerciseTemplateSchema.index({ question_type: 1, source: 1 });

export const ExerciseTemplateModel = mongoose.model<IExerciseTemplate>('ExerciseTemplate', ExerciseTemplateSchema);

export interface IMathQuestionBankItem extends Document {
  title: string;
  grade_level: number;
  math_topic: string;
  math_topic_path: string[];
  difficulty_level: ContentDifficultyLevel;
  question_type: MathQuestionType;
  question_text: string;
  choices: unknown;
  correct_answer: string;
  solution_steps: unknown;
  explanation: string | null;
  source: MathQuestionSource;
  source_reference: string | null;
  status: QuestionBankStatus;
  max_points: number | null;
  estimated_minutes: number | null;
  learning_objectives: MathLearningObjectiveRef[];
  prerequisite_objectives: MathLearningObjectiveRef[];
  tags: string[];
  rubric_contract_id: mongoose.Types.ObjectId | null;
  created_by: mongoose.Types.ObjectId | null;
  created_by_role: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const MathLearningObjectiveRefSchema = new Schema<MathLearningObjectiveRef>(
  {
    objective_id: { type: String, required: true, trim: true },
    description: { type: String, default: null },
  },
  { _id: false }
);

const MathQuestionBankItemSchema = new Schema<IMathQuestionBankItem>(
  {
    title: { type: String, required: true, trim: true },
    grade_level: { type: Number, required: true, min: 1, max: 12 },
    math_topic: { type: String, required: true, trim: true },
    math_topic_path: { type: [String], default: [] },
    difficulty_level: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
    question_type: {
      type: String,
      enum: ['multiple_choice', 'short_answer', 'essay', 'proof', 'calculation', 'word_problem', 'graphing'],
      required: true,
    },
    question_text: { type: String, required: true },
    choices: { type: Schema.Types.Mixed, default: null },
    correct_answer: { type: String, required: true },
    solution_steps: { type: Schema.Types.Mixed, default: null },
    explanation: { type: String, default: null },
    source: { type: String, enum: ['ai', 'manual', 'imported', 'textbook', 'assessment'], default: 'manual' },
    source_reference: { type: String, default: null },
    status: { type: String, enum: ['draft', 'review', 'approved', 'published', 'archived'], default: 'draft' },
    max_points: { type: Number, min: 0, default: null },
    estimated_minutes: { type: Number, min: 0, default: null },
    learning_objectives: { type: [MathLearningObjectiveRefSchema], default: [] },
    prerequisite_objectives: { type: [MathLearningObjectiveRefSchema], default: [] },
    tags: { type: [String], default: [] },
    rubric_contract_id: { type: Schema.Types.ObjectId, ref: 'MathRubricContract', default: null },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    created_by_role: { type: String, default: null },
  },
  { timestamps: true }
);

MathQuestionBankItemSchema.index({ grade_level: 1, math_topic: 1, difficulty_level: 1, status: 1 });
MathQuestionBankItemSchema.index({ question_type: 1, source: 1 });
MathQuestionBankItemSchema.index({ 'learning_objectives.objective_id': 1 });
MathQuestionBankItemSchema.index({ title: 'text', question_text: 'text', explanation: 'text', math_topic: 'text', tags: 'text' });

export const MathQuestionBankItemModel = mongoose.model<IMathQuestionBankItem>(
  'MathQuestionBankItem',
  MathQuestionBankItemSchema
);

export interface IMathRubricContract extends Document {
  title: string;
  description: string | null;
  attachment_type: MathRubricAttachmentType;
  question_bank_item_id: mongoose.Types.ObjectId | null;
  exercise_template_id: mongoose.Types.ObjectId | null;
  assessment_id: mongoose.Types.ObjectId | null;
  grade_level: number | null;
  math_topic: string | null;
  difficulty_level: ContentDifficultyLevel | null;
  total_points: number;
  criteria: MathRubricCriterion[];
  status: MathRubricContractStatus;
  version: number;
  created_by: mongoose.Types.ObjectId | null;
  created_by_role: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const MathRubricLevelSchema = new Schema<MathRubricLevel>(
  {
    label: { type: String, required: true, trim: true },
    points: { type: Number, required: true, min: 0 },
    description: { type: String, default: null },
  },
  { _id: false }
);

const MathRubricCriterionSchema = new Schema<MathRubricCriterion>(
  {
    key: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    max_points: { type: Number, required: true, min: 0 },
    scoring: { type: String, enum: ['points', 'levels'], default: 'points' },
    levels: { type: [MathRubricLevelSchema], default: undefined },
  },
  { _id: false }
);

const MathRubricContractSchema = new Schema<IMathRubricContract>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    attachment_type: {
      type: String,
      enum: ['question_bank_item', 'exercise_template', 'assessment'],
      required: true,
    },
    question_bank_item_id: { type: Schema.Types.ObjectId, ref: 'MathQuestionBankItem', default: null },
    exercise_template_id: { type: Schema.Types.ObjectId, ref: 'ExerciseTemplate', default: null },
    assessment_id: { type: Schema.Types.ObjectId, default: null },
    grade_level: { type: Number, min: 1, max: 12, default: null },
    math_topic: { type: String, default: null, trim: true },
    difficulty_level: { type: String, enum: ['easy', 'medium', 'hard'], default: null },
    total_points: { type: Number, required: true, min: 0 },
    criteria: { type: [MathRubricCriterionSchema], required: true, default: [] },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
    version: { type: Number, default: 1, min: 1 },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    created_by_role: { type: String, default: null },
  },
  { timestamps: true }
);

MathRubricContractSchema.index({ attachment_type: 1, question_bank_item_id: 1, exercise_template_id: 1, assessment_id: 1 });
MathRubricContractSchema.index({ grade_level: 1, math_topic: 1, difficulty_level: 1, status: 1 });
MathRubricContractSchema.index({ status: 1, updatedAt: -1 });
MathRubricContractSchema.index({ title: 'text', description: 'text', math_topic: 'text' });

export const MathRubricContractModel = mongoose.model<IMathRubricContract>(
  'MathRubricContract',
  MathRubricContractSchema
);

export interface CurriculumTemplateDetail extends ICurriculumTemplate {
  modules: Array<ICurriculumModuleTemplate & { lessons: Array<LessonTemplateDetail> }>;
}

export interface LessonTemplateDetail extends ILessonTemplate {
  exercises: IExerciseTemplate[];
}

export class CurriculumTemplateRepository extends BaseRepository<ICurriculumTemplate> {
  constructor() {
    super(CurriculumTemplateModel);
  }

  public async findWithModulesAndLessons(
    templateId: string,
    session?: ClientSession
  ): Promise<CurriculumTemplateDetail | null> {
    const template = await this.findById(templateId, session);
    if (!template) return null;

    const modules = await curriculumModuleTemplateRepository.findByCurriculumTemplateId(templateId, session);
    const modulesWithLessons = [];

    for (const module of modules) {
      const lessons = await lessonTemplateRepository.findByModuleTemplateId(String(module._id), session);
      const lessonsWithExercises = [];

      for (const lesson of lessons) {
        const exercises = await exerciseTemplateRepository.findByLessonTemplateId(String(lesson._id), session);
        lessonsWithExercises.push({ ...lesson.toObject(), exercises } as LessonTemplateDetail);
      }

      modulesWithLessons.push({ ...module.toObject(), lessons: lessonsWithExercises });
    }

    return { ...template.toObject(), modules: modulesWithLessons } as CurriculumTemplateDetail;
  }
}

export class CurriculumModuleTemplateRepository extends BaseRepository<ICurriculumModuleTemplate> {
  constructor() {
    super(CurriculumModuleTemplateModel);
  }

  public async findByCurriculumTemplateId(
    curriculumTemplateId: string,
    session?: ClientSession
  ): Promise<ICurriculumModuleTemplate[]> {
    const query = this.model.find({ curriculum_template_id: curriculumTemplateId }).sort({ order_index: 1 });
    if (session) query.session(session);
    return query.exec();
  }
}

export class LessonTemplateRepository extends BaseRepository<ILessonTemplate> {
  constructor() {
    super(LessonTemplateModel);
  }

  public async findWithExercises(lessonTemplateId: string, session?: ClientSession): Promise<LessonTemplateDetail | null> {
    const lesson = await this.findById(lessonTemplateId, session);
    if (!lesson) return null;

    const exercises = await exerciseTemplateRepository.findByLessonTemplateId(lessonTemplateId, session);
    return { ...lesson.toObject(), exercises } as LessonTemplateDetail;
  }

  public async findByModuleTemplateId(moduleTemplateId: string, session?: ClientSession): Promise<ILessonTemplate[]> {
    const query = this.model.find({ module_template_id: moduleTemplateId }).sort({ order_index: 1 });
    if (session) query.session(session);
    return query.exec();
  }
}

export class ExerciseTemplateRepository extends BaseRepository<IExerciseTemplate> {
  constructor() {
    super(ExerciseTemplateModel);
  }

  public async findByLessonTemplateId(lessonTemplateId: string, session?: ClientSession): Promise<IExerciseTemplate[]> {
    const query = this.model.find({ lesson_template_id: lessonTemplateId }).sort({ order_index: 1 });
    if (session) query.session(session);
    return query.exec();
  }
}

export class MathQuestionBankItemRepository extends BaseRepository<IMathQuestionBankItem> {
  constructor() {
    super(MathQuestionBankItemModel);
  }

  public async findByTaxonomy(
    filters: {
      grade_level?: number;
      math_topic?: string;
      difficulty_level?: ContentDifficultyLevel;
      status?: QuestionBankStatus;
    },
    session?: ClientSession
  ): Promise<IMathQuestionBankItem[]> {
    const query = this.model.find(filters).sort({ grade_level: 1, math_topic: 1, difficulty_level: 1, createdAt: -1 });
    if (session) query.session(session);
    return query.exec();
  }
}

export class MathRubricContractRepository extends BaseRepository<IMathRubricContract> {
  constructor() {
    super(MathRubricContractModel);
  }

  public async findActiveForQuestionBankItem(
    questionBankItemId: string,
    session?: ClientSession
  ): Promise<IMathRubricContract | null> {
    const query = this.model.findOne({
      attachment_type: 'question_bank_item',
      question_bank_item_id: questionBankItemId,
      status: 'active',
    });
    if (session) query.session(session);
    return query.exec();
  }

  public async findActiveById(
    rubricContractId: string,
    session?: ClientSession
  ): Promise<IMathRubricContract | null> {
    const query = this.model.findOne({ _id: rubricContractId, status: 'active' });
    if (session) query.session(session);
    return query.exec();
  }
}

export const curriculumTemplateRepository = new CurriculumTemplateRepository();
export const curriculumModuleTemplateRepository = new CurriculumModuleTemplateRepository();
export const lessonTemplateRepository = new LessonTemplateRepository();
export const exerciseTemplateRepository = new ExerciseTemplateRepository();
export const mathQuestionBankItemRepository = new MathQuestionBankItemRepository();
export const mathRubricContractRepository = new MathRubricContractRepository();
