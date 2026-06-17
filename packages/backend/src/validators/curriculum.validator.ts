import { z } from 'zod';

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

export const generateCurriculumSchema = z.object({
  body: z.object({
    title: z.string().min(2).optional(),
    total_modules: z.number().int().min(2).max(10).default(4),
    lessons_per_module: z.number().int().min(2).max(8).default(4),
    exercises_per_lesson: z.number().int().min(2).max(10).default(5),
    target_goal: z.string().min(2).optional(),
    estimated_weekly_hours: z.number().min(0.5).max(40).optional(),
    skill_strengths: z.array(z.string().min(1)).max(20).optional(),
    skill_weaknesses: z.array(z.string().min(1)).max(20).optional(),
    include_end_of_lesson_quiz: z.boolean().optional(),
  }),
});

export const curriculumIdSchema = z.object({
  params: z.object({
    id: objectIdString,
  }),
});

export const moduleIdSchema = z.object({
  params: z.object({
    id: objectIdString,
    moduleId: objectIdString,
  }),
});
