import {
	ADMIN_AI_PROVIDER_ROUTES,
	ADMIN_POINT_ROUTES,
	PARENT_ROUTES,
	SOLVER_ROUTES,
} from "./api-routes";
import { getPublicApiUrl } from "./env-config";

export const API_URL = getPublicApiUrl();

export interface ApiResponse<T> {
	success: boolean;
	message?: string;
	data: T;
	meta?: Record<string, unknown>;
}

export interface AuthActionResult {
	message?: string;
}

export async function requestPasswordReset(
	email: string,
): Promise<AuthActionResult> {
	const response = await apiClient<ApiResponse<null>>("/auth/forgot-password", {
		method: "POST",
		body: JSON.stringify({ email }),
	});
	return { message: response.message };
}

export async function resetPassword(
	token: string,
	password: string,
): Promise<AuthActionResult> {
	const response = await apiClient<ApiResponse<null>>("/auth/reset-password", {
		method: "POST",
		body: JSON.stringify({ token, password }),
	});
	return { message: response.message };
}

export type AIProviderKind = "openai" | "openai-compatible";

export interface AIProviderRegistryItem {
	id: string;
	name: string;
	provider: AIProviderKind;
	base_url: string;
	model: string;
	is_enabled: boolean;
	is_active: boolean;
	api_key_masked: string | null;
	created_at: string;
	updated_at: string;
}

export interface UpsertAIProviderPayload {
	name: string;
	provider: AIProviderKind;
	base_url: string;
	api_key?: string;
	model: string;
	is_enabled?: boolean;
}

export async function listAIProviders(): Promise<AIProviderRegistryItem[]> {
	const response = await apiClient<ApiResponse<AIProviderRegistryItem[]>>(
		ADMIN_AI_PROVIDER_ROUTES.collection,
	);
	return response.data ?? [];
}

export async function createAIProvider(
	payload: UpsertAIProviderPayload,
): Promise<AIProviderRegistryItem> {
	const response = await apiClient<ApiResponse<AIProviderRegistryItem>>(
		ADMIN_AI_PROVIDER_ROUTES.collection,
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
	return response.data;
}

export async function updateAIProvider(
	providerId: string,
	payload: UpsertAIProviderPayload,
): Promise<AIProviderRegistryItem> {
	const response = await apiClient<ApiResponse<AIProviderRegistryItem>>(
		ADMIN_AI_PROVIDER_ROUTES.item(providerId),
		{
			method: "PUT",
			body: JSON.stringify(payload),
		},
	);
	return response.data;
}

export async function activateAIProvider(
	providerId: string,
): Promise<AIProviderRegistryItem> {
	const response = await apiClient<ApiResponse<AIProviderRegistryItem>>(
		ADMIN_AI_PROVIDER_ROUTES.activate(providerId),
		{ method: "POST" },
	);
	return response.data;
}

export async function deleteAIProvider(providerId: string): Promise<void> {
	await apiClient<ApiResponse<null>>(
		ADMIN_AI_PROVIDER_ROUTES.item(providerId),
		{
			method: "DELETE",
		},
	);
}

export interface AIProviderTestResult {
	ok: boolean;
	latency_ms: number;
	error?: string;
}

export async function testAIProvider(
	providerId: string,
): Promise<AIProviderTestResult> {
	const response = await apiClient<ApiResponse<AIProviderTestResult>>(
		ADMIN_AI_PROVIDER_ROUTES.test(providerId),
		{ method: "POST" },
	);
	return response.data;
}

export interface TeacherAssignmentDetail {
	id: string;
	title: string;
	description: string | null;
	type: "homework" | "quiz" | "exam" | string;
	status: "draft" | "active" | "grading" | "closed" | string;
	due_date: string | null;
	total_points: number;
	class_id: string;
	class_name: string;
	total_students: number;
	submitted: number;
	graded: number;
	avg_score: number | null;
	rubric_contract_id?: string | null;
	createdAt: string;
	updatedAt?: string;
}

export async function getTeacherAssignment(
	assignmentId: string,
): Promise<TeacherAssignmentDetail> {
	const response = await apiClient<ApiResponse<TeacherAssignmentDetail>>(
		`/teacher/assignments/${encodeURIComponent(assignmentId)}`,
	);
	return response.data;
}
export interface GradebookSummaryBucket {
	earned_points: number;
	max_points: number;
	percentage: number;
	entries: number;
}

export interface GradebookEntry {
	_id?: string;
	id?: string;
	student_id: string;
	class_id: string | null;
	teacher_id: string | null;
	source_type: "teacher_assignment" | "assessment" | "lesson" | string;
	source_id: string;
	attempt_id: string | null;
	title: string;
	earned_points: number;
	max_points: number;
	percentage: number;
	status: "graded" | "submitted" | "missing" | string;
	graded_at: string | null;
	submitted_at: string | null;
	metadata: Record<string, unknown> | null;
	createdAt?: string;
	updatedAt?: string;
}

export interface StudentGradebookSummary extends GradebookSummaryBucket {
	student_id: string;
	by_source_type: Record<string, GradebookSummaryBucket>;
	gradebook_entries: GradebookEntry[];
}

export interface TeacherGradebookSummary extends GradebookSummaryBucket {
	filters: {
		teacher_id?: string;
		class_id?: string;
		student_id?: string;
	};
	students: StudentGradebookSummary[];
}

export async function getTeacherGradebook(
	filters: { class_id?: string; student_id?: string } = {},
): Promise<TeacherGradebookSummary> {
	const params = new URLSearchParams();
	if (filters.class_id) params.set("class_id", filters.class_id);
	if (filters.student_id) params.set("student_id", filters.student_id);
	const query = params.toString();
	const response = await apiClient<ApiResponse<TeacherGradebookSummary>>(
		`/teacher/gradebook${query ? `?${query}` : ""}`,
	);
	return response.data;
}

export interface PointSourceSummary {
	earned_points: number;
	available_points: number;
	reward_points: number;
	competency_score: number;
	entries: number;
}

export interface StudentGamificationBadge {
	key: string;
	title: string;
	description: string;
	unlocked: boolean;
	progress: {
		current: number;
		target: number;
		percentage: number;
	};
}

export interface StudentGamificationSummary {
	level: number;
	level_title: string;
	reward_points: number;
	next_level_reward_points: number | null;
	points_to_next_level: number;
	progress_percentage: number;
	badges: StudentGamificationBadge[];
}

export interface PointLedgerMetadata {
	[key: string]: unknown;
	assessment_type?: string;
	lesson_title?: string;
	assignment_title?: string;
	topic?: string;
	topics?: string[];
	difficulty?: string;
	total_questions?: number;
	correct_answers?: number;
	note?: string;
}

export interface PointLedgerEntry {
	_id?: string;
	student_id?: string;
	source_type: string;
	source_id?: string;
	attempt_id?: string | null;
	earned_points: number;
	max_points: number;
	reward_points: number;
	competency_score: number;
	reason: string;
	metadata?: PointLedgerMetadata;
	created_by?: string | null;
	createdAt: string;
	updatedAt?: string;
}

export interface StudentPointSummary {
	total_earned_points: number;
	total_available_points: number;
	reward_points: number;
	academic_percentage: number;
	competency_score: number;
	by_source_type: Record<string, PointSourceSummary>;
	gamification: StudentGamificationSummary;
}

export interface StudentPointHistoryResult {
	summary: StudentPointSummary;
	history: PointLedgerEntry[];
}

export interface StudentPointHeaderSummary {
	reward_points: number;
	academic_percentage: number;
	competency_score: number;
}

export interface SolverSimilarProblem {
	problem: string;
	hint: string;
	difficulty: string;
	topic: string;
	answer?: string;
	solution_outline?: string;
}

export interface SolverResponse {
	stage: "hint" | "detailed_hint" | "full_solution";
	content: string;
	can_request_more: boolean;
	hint_count: number;
	dependency_warning: boolean;
	similar_problems: SolverSimilarProblem[];
	similar_problems_meta: {
		message: string;
	};
}

export interface SolverSolvePayload {
	problem_text: string;
	stage?: SolverResponse["stage"];
	previous_hints?: string[];
	session_id?: string | null;
	grade_level?: number;
	input_type?: "text" | "image";
	image_url?: string;
}

export interface SolverImageParseResult {
	input_type: "image";
	image_url: string;
	parsed_text: string;
	ocr_status: "parsed" | "manual_required";
	confidence: number;
	warnings: string[];
	ocr_result_id: string | null;
	remaining_quota: number;
	message: string;
}

export async function apiClient<T>(
	endpoint: string,
	options: RequestInit = {},
): Promise<T> {
	const url = `${API_URL}${endpoint}`;

	const { headers: optHeaders, ...restOptions } = options;
	const config: RequestInit = {
		...restOptions,
		headers: {
			"Content-Type": "application/json",
			...(optHeaders as Record<string, string>),
		},
	};

	// Add auth token if available (validate ASCII-safe for HTTP headers)
	if (typeof window !== "undefined") {
		const token = localStorage.getItem("token");
		if (token && /^[\x20-\x7E]+$/.test(token)) {
			config.headers = {
				...config.headers,
				Authorization: `Bearer ${token}`,
			};
		}
	}

	const response = await fetch(url, config);

	if (!response.ok) {
		const error = await response
			.json()
			.catch(() => ({ message: "Network error" }));
		throw new Error(
			error.message ||
				error.error ||
				error.meta?.errors?.message ||
				"Có lỗi xảy ra",
		);
	}

	return response.json();
}

export async function solveProblem(
	payload: SolverSolvePayload,
): Promise<SolverResponse> {
	const response = await apiClient<ApiResponse<SolverResponse>>(
		SOLVER_ROUTES.solve,
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
	return response.data;
}

export async function uploadSolverImage(
	image: File,
): Promise<SolverImageParseResult> {
	const formData = new FormData();
	formData.append("image", image);

	const headers: Record<string, string> = {};
	if (typeof window !== "undefined") {
		const token = localStorage.getItem("token");
		if (token && /^[\x20-\x7E]+$/.test(token)) {
			headers.Authorization = `Bearer ${token}`;
		}
	}

	const response = await fetch(`${API_URL}${SOLVER_ROUTES.parseImage}`, {
		method: "POST",
		headers,
		body: formData,
	});

	if (!response.ok) {
		const error = await response
			.json()
			.catch(() => ({ message: "Network error" }));
		throw new Error(
			error.message || error.error || "Không thể xử lý ảnh đề toán",
		);
	}

	const result = (await response.json()) as ApiResponse<SolverImageParseResult>;
	return result.data;
}

export async function getDashboardPoints(): Promise<StudentPointHistoryResult> {
	const response = await apiClient<ApiResponse<StudentPointHistoryResult>>(
		ADMIN_POINT_ROUTES.dashboardPoints,
	);
	return response.data;
}

export const getStudentPointDetails = getDashboardPoints;

export async function getDashboardPointSummary(): Promise<StudentPointHeaderSummary> {
	const response = await apiClient<ApiResponse<StudentPointHeaderSummary>>(
		ADMIN_POINT_ROUTES.dashboardPointSummary,
	);
	return response.data;
}

export interface AdminPointAdjustmentPayload {
	reward_points: number;
	reason: string;
	metadata?: Record<string, unknown>;
	note?: string;
}

export async function adminGetStudentPoints(
	studentId: string,
): Promise<StudentPointHistoryResult> {
	const response = await apiClient<ApiResponse<StudentPointHistoryResult>>(
		ADMIN_POINT_ROUTES.studentPoints(studentId),
	);
	return response.data;
}

export async function adminAdjustStudentPoints(
	studentId: string,
	payload: AdminPointAdjustmentPayload,
): Promise<PointLedgerEntry> {
	const response = await apiClient<ApiResponse<PointLedgerEntry>>(
		ADMIN_POINT_ROUTES.studentPoints(studentId),
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
	return response.data;
}

export interface LessonQuizResultPayload {
	score: number;
	max_score: number;
	total_questions?: number;
	correct_answers?: number;
	duration_seconds?: number;
	ai_feedback?: string;
	started_at?: string;
	submitted_at?: string;
	idempotency_key?: string;
	attempt_id?: string;
	metadata?: Record<string, unknown>;
}

export async function submitLessonQuizResult<T = unknown>(
	lessonId: string,
	payload: LessonQuizResultPayload,
): Promise<T> {
	const response = await apiClient<ApiResponse<T>>(
		`/lessons/${encodeURIComponent(lessonId)}/quiz-results`,
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
	return response.data;
}

export interface LessonExerciseAttemptAnswerPayload {
	exercise_id: string;
	student_answer?: string;
	selected_choice?: string;
}

export interface LessonExerciseAttemptSubmitPayload {
	answers: LessonExerciseAttemptAnswerPayload[];
	duration_seconds?: number;
	started_at?: string;
	submitted_at?: string;
	idempotency_key?: string;
}

export interface LessonExerciseSnapshot {
	_id?: string;
	order_index?: number;
	topic?: string | null;
	difficulty_level?: string | null;
	answer_type?: string;
	question_text?: string;
	choices?: string[] | null;
	correct_answer?: string;
	solution_steps?: string[] | string | null;
	explanation?: string | null;
}

export interface LessonExerciseAttemptAnswerResult {
	_id?: string;
	exercise_id?: string;
	lesson_id?: string;
	student_id?: string;
	quiz_result_id?: string;
	student_answer?: string | null;
	selected_choice?: string | null;
	is_correct?: boolean | null;
	score?: number | null;
	ai_comment?: string | null;
	exercise_snapshot?: LessonExerciseSnapshot | null;
	answered_at?: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface LessonExerciseAttemptResult {
	_id?: string;
	lesson_id?: string;
	student_id?: string;
	total_questions?: number;
	correct_answers?: number;
	score?: number;
	max_score?: number;
	percentage?: number;
	duration_seconds?: number | null;
	ai_feedback?: string | null;
	passed?: boolean;
	started_at?: string | null;
	submitted_at?: string;
	createdAt?: string;
	updatedAt?: string;
	/** Module 5 — đề xuất sau quiz: ≥70% học tiếp / <70% ôn lại. */
	next_action?: {
		action: "advance" | "review";
		threshold: number;
		label: string;
		message: string;
	};
}

export interface LessonCompletionSideEffects {
	lesson_completed?: boolean;
	progress_updated?: boolean;
	mastery_updated?: boolean;
	recommendation_completed?: boolean;
}

export interface LessonExerciseAttemptResponse
	extends LessonCompletionSideEffects {
	result?: LessonExerciseAttemptResult;
	answers?: LessonExerciseAttemptAnswerResult[];
	ledger?: unknown;
	idempotent?: boolean;
}

export interface LessonExerciseAttemptHistoryItem {
	result?: LessonExerciseAttemptResult;
	answers?: LessonExerciseAttemptAnswerResult[];
}

export async function submitLessonExerciseAttempt(
	lessonId: string,
	payload: LessonExerciseAttemptSubmitPayload,
): Promise<LessonExerciseAttemptResponse> {
	const response = await apiClient<ApiResponse<LessonExerciseAttemptResponse>>(
		`/lessons/${encodeURIComponent(lessonId)}/exercise-attempts/submit`,
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
	return response.data;
}

export async function getLessonExerciseAttemptHistory(
	lessonId: string,
): Promise<LessonExerciseAttemptHistoryItem[]> {
	const response = await apiClient<
		ApiResponse<LessonExerciseAttemptHistoryItem[]>
	>(`/lessons/${encodeURIComponent(lessonId)}/exercise-attempts/history`);
	return response.data ?? [];
}

export type AssessmentQuestionType =
	| "multiple_choice"
	| "short_answer"
	| "essay";

export interface AssessmentQuestion {
	id?: string;
	_id?: string;
	assessment_id?: string;
	question_type: AssessmentQuestionType;
	topic?: string | null;
	difficulty_level?: string | null;
	question_text: string;
	choices?: string[] | Record<string, string> | null;
	options?: string[] | null;
	correct_answer?: string | null;
	explanation?: string | null;
	score?: number | string;
	order_index?: number;
}

export interface Assessment {
	id?: string;
	_id?: string;
	student_id?: string;
	type: string;
	title: string;
	grade_level?: number | null;
	target_difficulty?: string | null;
	generated_by_ai?: boolean;
	total_questions?: number;
	total_score?: number | string | null;
	duration_minutes?: number | null;
	status?: string;
	questions?: AssessmentQuestion[];
	created_at?: string;
	createdAt?: string;
}

export interface AssessmentAttempt {
	id?: string;
	_id?: string;
	assessment_id?: string;
	student_id?: string;
	started_at?: string | null;
	submitted_at?: string | null;
	total_score?: number | string | null;
	max_score?: number | string | null;
	percentage?: number | string | null;
	ai_feedback?: string | null;
	ai_analysis?: {
		strengths?: string[];
		weaknesses?: string[];
		recommendations?: string;
	} | null;
	status?: string;
	answers?: AssessmentAnswer[];
}

export interface AssessmentAnswer {
	id?: string;
	_id?: string;
	attempt_id?: string;
	question_id?: string;
	student_answer?: string | null;
	selected_choice?: string | null;
	is_correct?: boolean | null;
	score?: number | string | null;
	ai_comment?: string | null;
	answered_at?: string | null;
}

export type StudentSelfAssessedLevel =
	| "weak"
	| "average"
	| "good"
	| "excellent";
export type StudentThemeMode = "light" | "dark";
export type StudentFontSize = "small" | "medium" | "large";

export interface StudentProfileData {
	id?: string;
	_id?: string;
	user_id?: string;
	date_of_birth?: string | null;
	phone?: string | null;
	address?: string | null;
	school_name?: string | null;
	grade_level?: number | null;
	self_assessed_level?: StudentSelfAssessedLevel | null;
	math_average_score?: number | string | null;
	selected_tutor_id?: string | null;
	favorite_color?: string | null;
	interests?: string | null;
	initial_classification?: string | null;
}

export type StudentOnboardingField =
	| "full_name"
	| "grade_level"
	| "self_assessed_level";

export interface StudentOnboardingStatus {
	completed: boolean;
	completion_percentage: number;
	required_fields: StudentOnboardingField[];
	missing_fields: StudentOnboardingField[];
}

export interface StudentProfileResponse {
	user: {
		id?: string;
		_id?: string;
		email?: string;
		full_name?: string;
		role?: string;
		is_active?: boolean;
	};
	profile: StudentProfileData;
	theme: StudentThemePreferenceData;
	onboarding: StudentOnboardingStatus;
}

export interface StudentThemePreferenceData {
	id?: string;
	_id?: string;
	student_id?: string;
	favorite_color?: string | null;
	font_size?: StudentFontSize | null;
	theme_mode?: StudentThemeMode | null;
}

export interface StudentTutorData {
	id?: string;
	_id?: string;
	code?: string;
	name?: string;
	display_name?: string;
	avatar_emoji?: string;
	avatar_url?: string | null;
	gender_style?: string | null;
	teaching_style?: string | null;
	description?: string | null;
	is_active?: boolean;
}

export interface UpdateStudentProfilePayload {
	full_name?: string;
	date_of_birth?: string;
	phone?: string;
	address?: string;
	school_name?: string;
	grade_level?: number;
	self_assessed_level?: StudentSelfAssessedLevel;
	math_average_score?: number;
	selected_tutor_id?: string;
	interests?: string;
}

export interface UpdateStudentThemePayload {
	favorite_color?: string;
	font_size?: StudentFontSize;
	theme_mode?: StudentThemeMode;
}

export interface StudentAssignmentSummary {
	id: string;
	title: string;
	description: string | null;
	type: "homework" | "quiz" | "exam" | string;
	status: "active" | "grading" | "closed" | string;
	due_date: string | null;
	total_points: number;
	class_id: string;
	class_name: string;
	submission_id: string | null;
	submission_content: string | null;
	submitted_at: string | null;
	score: number | null;
	feedback: string | null;
	graded_at: string | null;
}

export type StudentAssignmentSubmissionStatus =
	| "pending"
	| "submitted"
	| "graded";

export interface StudentAssignmentListFilters {
	page?: number;
	limit?: number;
	status?: string;
	class_id?: string;
	submission_status?: StudentAssignmentSubmissionStatus;
}

export interface StudentAssignmentListResult {
	items: StudentAssignmentSummary[];
	total: number;
	page: number;
	limit: number;
	total_pages: number;
	filters: {
		status: string | null;
		class_id: string | null;
		submission_status: StudentAssignmentSubmissionStatus | null;
	};
}

export interface SubmitStudentAssignmentPayload {
	content: string;
}

export interface StudentAssignmentSubmission {
	id?: string;
	_id?: string;
	assignment_id: string;
	student_id: string;
	content: string;
	score: number | null;
	feedback: string | null;
	rubric_score?: Record<string, unknown> | null;
	graded_at: string | null;
	submitted_at: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface GenerateAssessmentPayload {
	type?: "diagnostic" | "practice" | "quiz";
	grade_level?: number;
	total_questions?: number;
	difficulty?: "easy" | "medium" | "hard" | "mixed";
	topics?: string[];
}

export async function listAssessments(): Promise<Assessment[]> {
	const response = await apiClient<ApiResponse<Assessment[]>>("/assessments");
	return response.data ?? [];
}

export async function generateAssessment(
	payload: GenerateAssessmentPayload,
): Promise<Assessment> {
	const response = await apiClient<ApiResponse<Assessment>>(
		"/assessments/generate",
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
	return response.data;
}

export async function startAssessmentAttempt(
	assessmentId: string,
): Promise<AssessmentAttempt> {
	const response = await apiClient<ApiResponse<AssessmentAttempt>>(
		`/assessments/${encodeURIComponent(assessmentId)}/start`,
		{ method: "POST" },
	);
	return response.data;
}

export async function saveAssessmentAnswer(
	assessmentId: string,
	attemptId: string,
	payload: {
		question_id: string;
		student_answer: string;
		time_spent_seconds?: number;
	},
): Promise<AssessmentAnswer> {
	const response = await apiClient<ApiResponse<AssessmentAnswer>>(
		`/assessments/${encodeURIComponent(assessmentId)}/attempts/${encodeURIComponent(attemptId)}/answers`,
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
	return response.data;
}

export async function submitAssessmentAttempt(
	assessmentId: string,
	attemptId: string,
): Promise<AssessmentAttempt> {
	const response = await apiClient<ApiResponse<AssessmentAttempt>>(
		`/assessments/${encodeURIComponent(assessmentId)}/attempts/${encodeURIComponent(attemptId)}/submit`,
		{ method: "POST" },
	);
	return response.data;
}

export async function getLatestAssessmentResult(): Promise<AssessmentAttempt | null> {
	const response = await apiClient<ApiResponse<AssessmentAttempt | null>>(
		"/assessments/latest-result",
	);
	return response.data ?? null;
}

export async function getStudentProfile(): Promise<StudentProfileResponse> {
	const response =
		await apiClient<ApiResponse<StudentProfileResponse>>("/students/profile");
	return response.data;
}

export async function updateStudentProfile(
	payload: UpdateStudentProfilePayload,
): Promise<StudentProfileData> {
	const response = await apiClient<ApiResponse<StudentProfileData>>(
		"/students/profile",
		{
			method: "PUT",
			body: JSON.stringify(payload),
		},
	);
	return response.data;
}

export async function getStudentTheme(): Promise<StudentThemePreferenceData> {
	const response =
		await apiClient<ApiResponse<StudentThemePreferenceData>>("/students/theme");
	return response.data;
}

export async function updateStudentTheme(
	payload: UpdateStudentThemePayload,
): Promise<StudentThemePreferenceData> {
	const response = await apiClient<ApiResponse<StudentThemePreferenceData>>(
		"/students/theme",
		{
			method: "PUT",
			body: JSON.stringify(payload),
		},
	);
	return response.data;
}

export async function getStudentTutors(): Promise<StudentTutorData[]> {
	const response =
		await apiClient<ApiResponse<StudentTutorData[]>>("/students/tutors");
	return response.data ?? [];
}

export async function selectStudentTutor(
	tutorId: string,
): Promise<StudentProfileData> {
	const response = await apiClient<ApiResponse<StudentProfileData>>(
		"/students/select-tutor",
		{
			method: "PUT",
			body: JSON.stringify({ tutor_id: tutorId }),
		},
	);
	return response.data;
}

function buildStudentAssignmentQuery(
	filters?: StudentAssignmentListFilters,
): string {
	if (!filters) return "";
	const params = new URLSearchParams();
	if (filters.page) params.set("page", String(filters.page));
	if (filters.limit) params.set("limit", String(filters.limit));
	if (filters.status) params.set("status", filters.status);
	if (filters.class_id) params.set("class_id", filters.class_id);
	if (filters.submission_status)
		params.set("submission_status", filters.submission_status);
	const query = params.toString();
	return query ? `?${query}` : "";
}

export async function listStudentAssignments(
	filters?: StudentAssignmentListFilters,
): Promise<StudentAssignmentSummary[]> {
	const response = await apiClient<
		ApiResponse<StudentAssignmentSummary[] | StudentAssignmentListResult>
	>(`/students/assignments${buildStudentAssignmentQuery(filters)}`);
	if (Array.isArray(response.data)) return response.data;
	return response.data?.items ?? [];
}

export async function listStudentAssignmentsPage(
	filters: StudentAssignmentListFilters = {},
): Promise<StudentAssignmentListResult> {
	const response = await apiClient<ApiResponse<StudentAssignmentListResult>>(
		`/students/assignments${buildStudentAssignmentQuery(filters)}`,
	);
	return response.data;
}

export async function getStudentAssignment(
	assignmentId: string,
): Promise<StudentAssignmentSummary> {
	const response = await apiClient<ApiResponse<StudentAssignmentSummary>>(
		`/students/assignments/${encodeURIComponent(assignmentId)}`,
	);
	return response.data;
}

export async function submitStudentAssignment(
	assignmentId: string,
	payload: SubmitStudentAssignmentPayload,
): Promise<StudentAssignmentSubmission> {
	const response = await apiClient<ApiResponse<StudentAssignmentSubmission>>(
		`/students/assignments/${encodeURIComponent(assignmentId)}/submit`,
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
	return response.data;
}

export interface DashboardStats {
	total_lessons: number;
	completed_lessons: number;
	completion_percentage: number;
	average_quiz_score: number | null;
	total_study_time_minutes: number;
	current_streak_days: number;
	longest_streak_days: number;
	points?: StudentPointSummary;
}

export interface TopicMastery {
	id?: string;
	_id?: string;
	student_id?: string;
	topic: string;
	grade_level?: number;
	mastery_level: number | string;
	total_attempts?: number;
	correct_attempts?: number;
	strength_label?: string | null;
	last_practiced_at?: string | null;
	createdAt?: string;
	updatedAt?: string;
}

export interface AdaptiveRecommendation {
	new_lesson: {
		lesson_id: string;
		title: string;
		topic?: string | null;
		reason: string;
	} | null;
	review_items: Array<{
		lesson_id: string;
		title: string;
		topic: string;
		effective_mastery?: number;
		days_since_practice?: number;
		reason: string;
	}>;
	reinforce_items: Array<{
		lesson_id: string;
		title: string;
		topic: string;
		recent_error_count?: number;
		error_types?: string[];
		reason: string;
	}>;
	session_structure: {
		review_ratio: number;
		new_ratio: number;
		reinforce_ratio: number;
	};
	signals: {
		last_quiz_score: number | null;
		hint_usage_rate: number;
		avg_time_per_question: number | null;
		recurring_error_topics: string[];
		stability_last_5: number;
		forgetting_risk_topics: string[];
	};
	learning_tips: string[];
	fallback_reason: string | null;
	stats: {
		total_lessons: number;
		completed_lessons: number;
		remaining_lessons: number;
		current_streak: number;
	};
}

export async function getDashboardStats(): Promise<DashboardStats> {
	const response =
		await apiClient<ApiResponse<DashboardStats>>("/dashboard/stats");
	return response.data;
}

export async function getDashboardProgress(): Promise<DashboardStats | null> {
	const response = await apiClient<ApiResponse<DashboardStats | null>>(
		"/dashboard/progress",
	);
	return response.data ?? null;
}

export async function getTopicMastery(): Promise<TopicMastery[]> {
	const response =
		await apiClient<ApiResponse<TopicMastery[]>>("/dashboard/mastery");
	return response.data ?? [];
}

export async function getTodayRecommendation(): Promise<AdaptiveRecommendation> {
	const response = await apiClient<ApiResponse<AdaptiveRecommendation>>(
		"/lessons/today-recommendation",
	);
	return response.data;
}

export interface CurriculumModule {
	id?: string;
	_id?: string;
	curriculum_id?: string;
	module_title: string;
	module_description?: string | null;
	topic?: string | null;
	order_index?: number;
	stage?: "foundation" | "consolidation" | "advanced" | "practice" | null;
	estimated_sessions?: number | null;
	target_mastery?: number | string | null;
	status?: "locked" | "active" | "completed" | string;
	lessons?: LessonSummary[];
}

export interface Curriculum {
	id?: string;
	_id?: string;
	student_id?: string;
	title: string;
	input_level?: string | null;
	ai_summary?: string | null;
	target_goal?: string | null;
	estimated_total_sessions?: number | null;
	status?: "draft" | "active" | "archived" | "completed" | string;
	created_by_ai?: boolean;
	created_at?: string;
	updated_at?: string;
	createdAt?: string;
	updatedAt?: string;
	modules?: CurriculumModule[];
}

export interface LessonSummary {
	id?: string;
	_id?: string;
	curriculum_id?: string;
	module_id?: string | null;
	student_id?: string;
	lesson_title: string;
	lesson_date?: string | null;
	theory_content?: string;
	lesson_objective?: string | null;
	ai_tutor_id?: string | null;
	estimated_minutes?: number | null;
	order_index?: number;
	status?: "scheduled" | "available" | "completed" | "skipped" | string;
	created_at?: string;
	createdAt?: string;
}

export interface GenerateCurriculumPayload {
	title?: string;
	total_modules?: number;
	lessons_per_module?: number;
	exercises_per_lesson?: number;
	target_goal?: string;
	estimated_weekly_hours?: number;
	skill_strengths?: string[];
	skill_weaknesses?: string[];
	include_end_of_lesson_quiz?: boolean;
}

export async function listCurricula(): Promise<Curriculum[]> {
	const response = await apiClient<ApiResponse<Curriculum[]>>("/curriculum");
	return response.data ?? [];
}

export async function getActiveCurriculum(): Promise<Curriculum | null> {
	const response =
		await apiClient<ApiResponse<Curriculum | null>>("/curricula/active");
	return response.data ?? null;
}

export async function listLessons(
	curriculumId?: string,
): Promise<LessonSummary[]> {
	const query = curriculumId
		? `?curriculum_id=${encodeURIComponent(curriculumId)}`
		: "";
	const response = await apiClient<ApiResponse<LessonSummary[]>>(
		`/lessons${query}`,
	);
	return response.data ?? [];
}

export async function getCurriculumDetail(
	curriculumId: string,
): Promise<Curriculum> {
	const response = await apiClient<ApiResponse<Curriculum>>(
		`/curriculum/${encodeURIComponent(curriculumId)}`,
	);
	return response.data;
}

export async function generateCurriculum(
	payload: GenerateCurriculumPayload = {},
): Promise<Curriculum> {
	const response = await apiClient<ApiResponse<Curriculum>>(
		"/curriculum/generate",
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
	return response.data;
}

export interface ParentChild {
	student_id: string;
	full_name: string;
}

export interface LinkParentChildPayload {
	student_email: string;
	date_of_birth: string;
}

export interface LinkParentChildResult extends ParentChild {
	already_linked: boolean;
}

export type ParentNotificationType =
	| "session_start"
	| "session_complete"
	| "absent"
	| "daily_summary"
	| "weekly_summary"
	| "risk_alert"
	| "achievement"
	| "quiz_result"
	| "streak_milestone"
	| "intervention_suggestion";

export type NotificationSeverity = "info" | "warning" | "critical";
export type NotificationChannel = "in_app" | "push" | "email" | "sms";
export type ParentRiskLevel = "low" | "medium" | "high";

export interface ParentDashboardData {
	student: {
		id?: string;
		name: string;
		grade_level: number | null;
	};
	today_schedule: {
		lesson_title: string;
		scheduled_time: string | null;
		expected_duration_minutes: number;
		status: "present" | "partial" | "absent" | "scheduled";
	} | null;
	attendance_summary: {
		present: number;
		partial: number;
		absent: number;
		total: number;
	};
	study_stats: {
		avg_active_minutes_per_session: number;
		avg_focus_ratio: number;
		total_sessions_7d: number;
	};
	recent_quiz_results: Array<{
		lesson_title: string;
		score: number;
		max_score: number;
		date: string;
	}>;
	risk: {
		score: number;
		level: ParentRiskLevel;
	};
	alerts: Array<{
		type: ParentNotificationType;
		severity: NotificationSeverity;
		title: string;
		content: string;
		created_at: string;
	}>;
	intervention_suggestions: string[];
}

export interface ParentWeeklyReportStudent {
	student_id: string;
	student_name: string;
	grade_level: number | null;
	sessions: number;
	active_minutes: number;
	attendance_rate: number | null;
	avg_quiz_score: number | null;
	risk_level: ParentRiskLevel;
	alerts: number;
	intervention_suggestions: string[];
}

export interface ParentWeeklyReport {
	generated_at: string;
	range_days: number;
	totals: {
		students: number;
		sessions: number;
		active_minutes: number;
		alerts: number;
	};
	students: ParentWeeklyReportStudent[];
	follow_up_actions: string[];
}

export interface ParentNotification {
	id?: string;
	_id?: string;
	parent_user_id: string;
	student_id: string;
	type: ParentNotificationType;
	title: string;
	content: string | null;
	payload: Record<string, unknown> | null;
	severity: NotificationSeverity;
	is_read: boolean;
	read_at: string | null;
	channel: NotificationChannel;
	delivered_at: string | null;
	created_at?: string;
	createdAt?: string;
}

export interface ParentNotificationPreference {
	id?: string;
	_id?: string;
	parent_user_id: string;
	notify_session_start?: boolean;
	notify_session_complete?: boolean;
	notify_absent?: boolean;
	notify_absence?: boolean;
	notify_daily_summary?: boolean;
	notify_weekly_summary?: boolean;
	notify_risk_alert?: boolean;
	notify_achievement?: boolean;
	notify_quiz_result?: boolean;
	notify_quiz_failure?: boolean;
	notify_low_engagement?: boolean;
	notify_streak_break?: boolean;
	preferred_channel?: NotificationChannel;
	quiet_hours_start?: string | null;
	quiet_hours_end?: string | null;
	created_at?: string;
	updated_at?: string;
	createdAt?: string;
	updatedAt?: string;
}

export async function getParentChildren(): Promise<ParentChild[]> {
	const response =
		await apiClient<ApiResponse<ParentChild[]>>("/parent/children");
	return response.data ?? [];
}

export async function getParentChildDashboard(
	studentId: string,
): Promise<ParentDashboardData> {
	const response = await apiClient<ApiResponse<ParentDashboardData>>(
		PARENT_ROUTES.childDashboard(studentId),
	);
	return response.data;
}

export async function getParentWeeklyReport(
	rangeDays = 7,
): Promise<ParentWeeklyReport> {
	const response = await apiClient<ApiResponse<ParentWeeklyReport>>(
		PARENT_ROUTES.weeklyReport(rangeDays),
	);
	return response.data;
}

export async function linkParentChild(
	payload: LinkParentChildPayload,
): Promise<LinkParentChildResult> {
	const response = await apiClient<ApiResponse<LinkParentChildResult>>(
		"/parent/children/link",
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
	return response.data;
}

export async function unlinkParentChild(
	studentId: string,
): Promise<ParentChild> {
	const response = await apiClient<ApiResponse<ParentChild>>(
		`/parent/children/${encodeURIComponent(studentId)}`,
		{
			method: "DELETE",
		},
	);
	return response.data;
}

export async function getParentNotifications(
	limit = 20,
): Promise<ParentNotification[]> {
	const response = await apiClient<ApiResponse<ParentNotification[]>>(
		`/parent/notifications?limit=${encodeURIComponent(String(limit))}`,
	);
	return response.data ?? [];
}

export async function getUnreadParentNotifications(): Promise<
	ParentNotification[]
> {
	const response = await apiClient<ApiResponse<ParentNotification[]>>(
		"/parent/notifications/unread",
	);
	return response.data ?? [];
}

export async function markParentNotificationRead(
	notificationId: string,
): Promise<void> {
	await apiClient<ApiResponse<null>>(
		`/parent/notifications/${encodeURIComponent(notificationId)}/read`,
		{
			method: "POST",
		},
	);
}

export async function markAllParentNotificationsRead(): Promise<void> {
	await apiClient<ApiResponse<null>>("/parent/notifications/read-all", {
		method: "POST",
	});
}

export async function getParentPreferences(): Promise<ParentNotificationPreference | null> {
	const response = await apiClient<
		ApiResponse<ParentNotificationPreference | null>
	>(PARENT_ROUTES.preferences);
	return response.data ?? null;
}

export async function updateParentPreferences(
	payload: Partial<ParentNotificationPreference>,
): Promise<ParentNotificationPreference> {
	const response = await apiClient<ApiResponse<ParentNotificationPreference>>(
		PARENT_ROUTES.preferences,
		{
			method: "PUT",
			body: JSON.stringify(payload),
		},
	);
	return response.data;
}
