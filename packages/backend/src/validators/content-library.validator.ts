import { z } from "zod";

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId");
const difficultySchema = z.enum(["easy", "medium", "hard"]);
const statusSchema = z.enum(["draft", "published", "archived"]);
const assignmentStatusSchema = z.enum(["active", "paused", "archived"]);
const templateTypeSchema = z.enum(["curriculum_template", "lesson_template"]);
const targetTypeSchema = z.enum(["class", "student"]);

const paginationQuerySchema = {
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	status: statusSchema.optional(),
	grade_level: z.coerce.number().int().min(1).max(12).optional(),
	difficulty_level: difficultySchema.optional(),
	search: z.string().trim().min(1).max(120).optional(),
	own: z.coerce.boolean().optional(),
};

export const generateCurriculumTemplateSchema = z.object({
	body: z.object({
		title: z.string().trim().min(2).max(160).optional(),
		grade_level: z.number().int().min(1).max(12),
		age_group: z.string().trim().min(2).max(80).optional(),
		subject: z.string().trim().min(2).max(80).default("math"),
		difficulty_level: difficultySchema.default("medium"),
		target_goal: z.string().trim().min(2).max(500).optional(),
		total_modules: z.number().int().min(1).max(12).default(4),
		lessons_per_module: z.number().int().min(1).max(12).default(4),
		exercises_per_lesson: z.number().int().min(0).max(20).default(5),
		topics: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
		teaching_style: z.string().trim().min(2).max(300).optional(),
	}),
});

export const generateLessonTemplateSchema = z.object({
	body: z.object({
		curriculum_template_id: objectIdString.optional(),
		module_template_id: objectIdString.optional(),
		lesson_title: z.string().trim().min(2).max(160).optional(),
		grade_level: z.number().int().min(1).max(12),
		age_group: z.string().trim().min(2).max(80).optional(),
		topic: z.string().trim().min(1).max(160),
		difficulty_level: difficultySchema.default("medium"),
		estimated_minutes: z.number().int().min(10).max(180).default(45),
		exercises_count: z.number().int().min(0).max(20).default(5),
		learning_objectives: z
			.array(z.string().trim().min(1).max(180))
			.max(12)
			.optional(),
		teaching_style: z.string().trim().min(2).max(300).optional(),
	}),
});

export const listCurriculumTemplatesSchema = z.object({
	query: z.object(paginationQuerySchema),
});

export const listLessonTemplatesSchema = z.object({
	query: z.object({
		...paginationQuerySchema,
		topic: z.string().trim().min(1).max(160).optional(),
		curriculum_template_id: objectIdString.optional(),
		module_template_id: objectIdString.optional(),
	}),
});

export const contentTemplateIdSchema = z.object({
	params: z.object({
		id: objectIdString,
	}),
});

export const requestPublishTemplateSchema = contentTemplateIdSchema;

export const updateLessonTemplateSchema = z.object({
	params: z.object({
		id: objectIdString,
	}),
	body: z
		.object({
			lesson_title: z.string().trim().min(2).max(160).optional(),
			lesson_objective: z.string().trim().max(1000).nullable().optional(),
			theory_content: z.string().trim().max(20000).nullable().optional(),
			topic: z.string().trim().min(1).max(160).nullable().optional(),
			difficulty_level: difficultySchema.optional(),
			estimated_minutes: z.number().int().min(1).max(240).nullable().optional(),
			age_group: z.string().trim().min(2).max(80).nullable().optional(),
		})
		.strict(),
});

export const createContentAssignmentSchema = z.object({
	body: z.object({
		template_type: templateTypeSchema,
		template_id: objectIdString,
		target_type: targetTypeSchema,
		target_id: objectIdString,
		auto_apply_new_students: z.boolean().optional(),
	}),
});

export const listContentAssignmentsSchema = z.object({
	query: z.object({
		page: z.coerce.number().int().min(1).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(20),
		status: assignmentStatusSchema.optional(),
		template_type: templateTypeSchema.optional(),
		target_type: targetTypeSchema.optional(),
		target_id: objectIdString.optional(),
	}),
});

export const contentAssignmentIdSchema = z.object({
	params: z.object({
		id: objectIdString,
	}),
});

export const updateContentAssignmentSchema = z.object({
	params: z.object({
		id: objectIdString,
	}),
	body: z
		.object({
			auto_apply_new_students: z.boolean().optional(),
		})
		.strict(),
});

export type GenerateCurriculumTemplateInput = z.infer<
	typeof generateCurriculumTemplateSchema
>["body"];
export type GenerateLessonTemplateInput = z.infer<
	typeof generateLessonTemplateSchema
>["body"];
export type UpdateLessonTemplateInput = z.infer<
	typeof updateLessonTemplateSchema
>["body"];
export type ListCurriculumTemplatesQuery = z.infer<
	typeof listCurriculumTemplatesSchema
>["query"];
export type ListLessonTemplatesQuery = z.infer<
	typeof listLessonTemplatesSchema
>["query"];
export type CreateContentAssignmentInput = z.infer<
	typeof createContentAssignmentSchema
>["body"];
export type UpdateContentAssignmentInput = z.infer<
	typeof updateContentAssignmentSchema
>["body"];
export type ListContentAssignmentsQuery = z.infer<
	typeof listContentAssignmentsSchema
>["query"];
