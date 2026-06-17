import { apiClient } from "./api";

export type ContentTemplateStatus = "draft" | "published" | "archived";
export type ContentDifficultyLevel = "easy" | "medium" | "hard";
export type TemplateAnswerType = "multiple_choice" | "short_answer" | "essay";
export type ContentAssignmentStatus = "active" | "paused" | "archived";
export type ContentAssignmentTemplateType =
	| "curriculum_template"
	| "lesson_template";
export type ContentAssignmentTargetType = "class" | "student";

export interface PaginationMeta {
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

export interface ApiResponse<T> {
	success: boolean;
	data: T;
	message?: string;
	meta?: PaginationMeta;
}

export interface PaginatedResponse<T> {
	data: T[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

export type PaginatedApiResponse<T> = ApiResponse<T[]> & {
	meta: PaginationMeta;
};

export interface ApprovalRequest {
	_id: string;
	type: "publish_curriculum_template" | "publish_lesson_template" | string;
	status: "pending" | "approved" | "rejected";
	data: Record<string, unknown>;
	createdAt: string;
	updatedAt?: string;
}

export interface CurriculumModuleTemplate {
	_id: string;
	id?: string;
	curriculum_template_id: string;
	module_title: string;
	module_description: string | null;
	topic: string | null;
	order_index: number;
	estimated_sessions: number | null;
	target_mastery: number | null;
	lessons?: LessonTemplate[];
}

export interface ExerciseTemplate {
	_id: string;
	id?: string;
	lesson_template_id: string;
	topic: string | null;
	difficulty_level: ContentDifficultyLevel;
	question_text: string;
	answer_type: TemplateAnswerType;
	choices: unknown;
	correct_answer: string;
	solution_steps: unknown;
	explanation: string | null;
	order_index: number;
}

export interface CurriculumTemplate {
	_id: string;
	id?: string;
	title: string;
	description: string | null;
	grade_level: number;
	age_group: string | null;
	subject: string;
	difficulty_level: ContentDifficultyLevel;
	target_goal: string | null;
	estimated_total_sessions: number | null;
	status: ContentTemplateStatus;
	created_by: string;
	created_by_role: string;
	source: "ai" | "manual";
	ai_model: string | null;
	tokens_input: number;
	tokens_output: number;
	published_at: string | null;
	createdAt: string;
	updatedAt: string;
	modules?: CurriculumModuleTemplate[];
}

export interface LessonTemplate {
	_id: string;
	id?: string;
	curriculum_template_id: string | null;
	module_template_id: string | null;
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
	created_by: string;
	created_by_role: string;
	source: "ai" | "manual";
	ai_model: string | null;
	tokens_input: number;
	tokens_output: number;
	published_at: string | null;
	createdAt: string;
	updatedAt: string;
	exercises?: ExerciseTemplate[];
}

export interface ContentAssignment {
	_id: string;
	id?: string;
	template_type: ContentAssignmentTemplateType;
	template_id: string;
	target_type: ContentAssignmentTargetType;
	target_id: string;
	assigned_by:
		| string
		| { _id: string; full_name?: string; email?: string; role?: string };
	assigned_by_role: string;
	status: ContentAssignmentStatus;
	auto_apply_new_students: boolean;
	materialization_strategy: "on_demand";
	template_snapshot?: {
		title?: string;
		description?: string | null;
		grade_level?: number;
		subject?: string;
		difficulty_level?: ContentDifficultyLevel;
		lesson_title?: string;
		topic?: string | null;
	};
	recipient_mapping?: {
		class_id?:
			| string
			| { _id: string; name?: string; grade_level?: number; subject?: string }
			| null;
		student_ids?: Array<string | Record<string, unknown>>;
		applied_student_ids?: Array<string | Record<string, unknown>>;
	};
	recipients_count?: number;
	student_contents?: unknown[];
	createdAt: string;
	updatedAt: string;
}

export interface ContentLibraryListQuery {
	page?: number;
	limit?: number;
	status?: ContentTemplateStatus;
	grade_level?: number;
	difficulty_level?: ContentDifficultyLevel;
	search?: string;
	own?: boolean;
}

export interface LessonTemplateListQuery extends ContentLibraryListQuery {
	topic?: string;
	curriculum_template_id?: string;
	module_template_id?: string;
}

export interface CreateContentAssignmentInput {
	template_type: ContentAssignmentTemplateType;
	template_id: string;
	target_type: ContentAssignmentTargetType;
	target_id: string;
	auto_apply_new_students?: boolean;
}

export interface ListContentAssignmentsQuery {
	page?: number;
	limit?: number;
	status?: ContentAssignmentStatus;
	template_type?: ContentAssignmentTemplateType;
	target_type?: ContentAssignmentTargetType;
	target_id?: string;
}

export interface GenerateCurriculumTemplateInput {
	title?: string;
	grade_level: number;
	age_group?: string;
	subject?: string;
	difficulty_level: ContentDifficultyLevel;
	target_goal?: string;
	total_modules: number;
	lessons_per_module: number;
	exercises_per_lesson: number;
	topics?: string[];
	teaching_style?: string;
}

export interface GenerateLessonTemplateInput {
	curriculum_template_id?: string;
	module_template_id?: string;
	lesson_title?: string;
	grade_level: number;
	age_group?: string;
	topic: string;
	difficulty_level: ContentDifficultyLevel;
	estimated_minutes: number;
	exercises_count: number;
	learning_objectives?: string[];
	teaching_style?: string;
}

export interface UpdateLessonTemplateInput {
	lesson_title?: string;
	theory_content?: string | null;
	lesson_objective?: string | null;
	age_group?: string | null;
	topic?: string | null;
	difficulty_level?: ContentDifficultyLevel;
	estimated_minutes?: number | null;
}

export interface UpdateContentAssignmentInput {
	auto_apply_new_students?: boolean;
}

type QueryValue = string | number | boolean | undefined;

function toQueryString(query: Record<string, QueryValue>): string {
	const params = new URLSearchParams();
	Object.entries(query).forEach(([key, value]) => {
		if (value !== undefined && value !== "") params.set(key, String(value));
	});
	const qs = params.toString();
	return qs ? `?${qs}` : "";
}

export function getTemplateId(template: { _id?: string; id?: string }): string {
	return template._id || template.id || "";
}

export function getAssignmentId(assignment: {
	_id?: string;
	id?: string;
}): string {
	return assignment._id || assignment.id || "";
}

export const contentLibraryApi = {
	listCurriculumTemplates(query: ContentLibraryListQuery = {}) {
		return apiClient<PaginatedApiResponse<CurriculumTemplate>>(
			`/content-library/curriculum-templates${toQueryString(query as Record<string, QueryValue>)}`,
		);
	},
	getCurriculumTemplate(id: string) {
		return apiClient<ApiResponse<CurriculumTemplate>>(
			`/content-library/curriculum-templates/${id}`,
		);
	},
	generateCurriculumTemplate(input: GenerateCurriculumTemplateInput) {
		return apiClient<ApiResponse<CurriculumTemplate>>(
			"/content-library/curriculum-templates/generate",
			{ method: "POST", body: JSON.stringify(input) },
		);
	},
	publishCurriculumTemplate(id: string) {
		return apiClient<ApiResponse<CurriculumTemplate>>(
			`/content-library/curriculum-templates/${id}/publish`,
			{ method: "POST" },
		);
	},
	requestPublishCurriculumTemplate(id: string) {
		return apiClient<ApiResponse<ApprovalRequest>>(
			`/content-library/curriculum-templates/${id}/request-publish`,
			{ method: "POST" },
		);
	},
	listLessonTemplates(query: LessonTemplateListQuery = {}) {
		return apiClient<PaginatedApiResponse<LessonTemplate>>(
			`/content-library/lesson-templates${toQueryString(query as Record<string, QueryValue>)}`,
		);
	},
	getLessonTemplate(id: string) {
		return apiClient<ApiResponse<LessonTemplate>>(
			`/content-library/lesson-templates/${id}`,
		);
	},
	generateLessonTemplate(input: GenerateLessonTemplateInput) {
		return apiClient<ApiResponse<LessonTemplate>>(
			"/content-library/lesson-templates/generate",
			{
				method: "POST",
				body: JSON.stringify(input),
			},
		);
	},
	updateLessonTemplate(id: string, input: UpdateLessonTemplateInput) {
		return apiClient<ApiResponse<LessonTemplate>>(
			`/content-library/lesson-templates/${id}`,
			{
				method: "PATCH",
				body: JSON.stringify(input),
			},
		);
	},
	publishLessonTemplate(id: string) {
		return apiClient<ApiResponse<LessonTemplate>>(
			`/content-library/lesson-templates/${id}/publish`,
			{ method: "POST" },
		);
	},
	requestPublishLessonTemplate(id: string) {
		return apiClient<ApiResponse<ApprovalRequest>>(
			`/content-library/lesson-templates/${id}/request-publish`,
			{ method: "POST" },
		);
	},
	createAssignment(input: CreateContentAssignmentInput) {
		return apiClient<ApiResponse<ContentAssignment>>(
			"/content-library/assignments",
			{
				method: "POST",
				body: JSON.stringify(input),
			},
		);
	},
	listAssignments(query: ListContentAssignmentsQuery = {}) {
		return apiClient<PaginatedApiResponse<ContentAssignment>>(
			`/content-library/assignments${toQueryString(query as Record<string, QueryValue>)}`,
		);
	},
	getAssignmentDetail(id: string) {
		return apiClient<ApiResponse<ContentAssignment>>(
			`/content-library/assignments/${id}`,
		);
	},
	updateAssignment(id: string, input: UpdateContentAssignmentInput) {
		return apiClient<ApiResponse<ContentAssignment>>(
			`/content-library/assignments/${id}`,
			{
				method: "PATCH",
				body: JSON.stringify(input),
			},
		);
	},
	pauseAssignment(id: string) {
		return apiClient<ApiResponse<ContentAssignment>>(
			`/content-library/assignments/${id}/pause`,
			{
				method: "PUT",
			},
		);
	},
	activateAssignment(id: string) {
		return apiClient<ApiResponse<ContentAssignment>>(
			`/content-library/assignments/${id}/activate`,
			{ method: "PUT" },
		);
	},
	archiveAssignment(id: string) {
		return apiClient<ApiResponse<ContentAssignment>>(
			`/content-library/assignments/${id}`,
			{
				method: "DELETE",
			},
		);
	},
};
