export const AI_SUBJECT_SCOPE_MATH = 'math' as const;
export type AISubjectScope = typeof AI_SUBJECT_SCOPE_MATH;

export const AI_PROVIDER_OPENAI = 'openai' as const;
export type AIProvider = typeof AI_PROVIDER_OPENAI | (string & {});

export type AISafetyStatus = 'not_checked' | 'passed' | 'flagged' | 'blocked';
export type AIApprovalStatus = 'not_required' | 'draft' | 'pending' | 'approved' | 'rejected';
export type AIPurpose =
  | 'chat_tutoring'
  | 'solver_hint'
  | 'solver_solution'
  | 'ocr_math_problem'
  | 'assessment_generation'
  | 'assessment_grading'
  | 'curriculum_generation'
  | 'lesson_generation'
  | 'content_template_generation'
  | 'rubric_scoring_suggestion'
  | 'personalization'
  | 'recommendation'
  | 'classification'
  | 'other';

export interface AIActorMetadata {
  id?: string | null;
  role?: string | null;
}

export interface AIStudentContextMetadata {
  student_id?: string | null;
  class_id?: string | null;
  grade_level?: number | null;
  age_group?: string | null;
}

export interface AITransparencyMetadata {
  purpose?: AIPurpose | string | null;
  subjectScope?: AISubjectScope;
  promptTemplate?: string | null;
  promptVersion?: string | null;
  provider?: AIProvider | null;
  model?: string | null;
  confidence?: number | null;
  safetyStatus?: AISafetyStatus;
  inputRedacted?: boolean;
  outputRedacted?: boolean;
  requiresApproval?: boolean;
  approvalId?: string | null;
  approvalStatus?: AIApprovalStatus;
  actor?: AIActorMetadata | null;
  studentContext?: AIStudentContextMetadata | null;
  criteria?: unknown;
  explanation?: string | null;
}

export const DEFAULT_AI_TRANSPARENCY_METADATA = {
  subjectScope: AI_SUBJECT_SCOPE_MATH,
  safetyStatus: 'not_checked',
  inputRedacted: true,
  outputRedacted: true,
  requiresApproval: false,
  approvalStatus: 'not_required',
} as const;
