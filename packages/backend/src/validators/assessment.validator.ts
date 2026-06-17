import { z } from 'zod';

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

export const generateAssessmentSchema = z.object({
  body: z.object({
    type: z.enum(['diagnostic', 'practice', 'quiz']).default('diagnostic'),
    grade_level: z.number().int().min(1).max(12).optional(),
    total_questions: z.number().int().min(4).max(20).default(8),
    difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('mixed'),
    topics: z.array(z.string()).optional(),
  }),
});

export const startAttemptSchema = z.object({
  params: z.object({
    id: objectIdString,
  }),
});

export const saveAnswerSchema = z.object({
  params: z.object({
    id: objectIdString,
    attemptId: objectIdString,
  }),
  body: z.object({
    question_id: z.string(),
    student_answer: z.string(),
    time_spent_seconds: z.number().int().min(0).optional(),
  }),
});

export const submitAttemptSchema = z.object({
  params: z.object({
    id: objectIdString,
    attemptId: objectIdString,
  }),
});

export const assessmentIdSchema = z.object({
  params: z.object({
    id: objectIdString,
  }),
});
