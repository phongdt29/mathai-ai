export type DatabaseDate = Date | string;
export type DatabaseTimestamp = Date | string;
export type NumericValue = number | string;
export type SortOrder = "asc" | "desc";

export type UserRole = "student" | "admin" | "teacher" | "parent" | "staff";
export type AcademicSelfRating = "weak" | "average" | "good" | "excellent";
export type PreferredTeacherGender = "thay" | "co";
export type AssessmentType =
	| "diagnostic"
	| "lesson_quiz"
	| "weekly_review"
	| "monthly_review";
export type AssessmentStatus = "draft" | "published" | "completed";
export type AssessmentAttemptStatus = "in_progress" | "submitted" | "graded";
export type AssessmentQuestionType =
	| "multiple_choice"
	| "short_answer"
	| "essay";
export type CurriculumStatus = "draft" | "active" | "archived" | "completed";
export type CurriculumModuleStatus = "locked" | "active" | "completed";
export type LessonStatus = "scheduled" | "available" | "completed" | "skipped";
export type LessonExerciseAnswerType =
	| "multiple_choice"
	| "short_answer"
	| "essay";
export type SolverInputType = "text" | "image";
export type TopicStrengthLabel = "weak" | "average" | "strong" | "mastered";
export type RecommendationType =
	| "next_lesson"
	| "review"
	| "practice"
	| "challenge";
export type ConversationStatus = "active" | "archived" | "closed";
export type MessageRole = "student" | "tutor" | "system";
export type MessageType = "text" | "math" | "image" | "hint";
export type AIGenerationStatus =
	| "success"
	| "error"
	| "timeout"
	| "rate_limited";
export type ClassificationLevel = "yeu" | "trung_binh" | "kha" | "gioi";
export type AbilityLevel = 1 | 2 | 3 | 4 | 5; // 1=very weak, 5=excellent
export type ProcessingSpeed = "slow" | "normal" | "fast";
export type SelfStudyLevel =
	| "needs_guidance"
	| "semi_independent"
	| "independent";

/** Multi-dimensional classification output from the enhanced pipeline */
export interface MultiDimensionalClassification {
	general_ability: AbilityLevel;
	topic_abilities: Record<string, AbilityLevel>;
	self_study_level: SelfStudyLevel;
	processing_speed: ProcessingSpeed;
	stability_score: number; // 0-1, how consistent performance is across easy/hard
	overall_level: ClassificationLevel;
	confidence: number; // 0-1
	reasoning: string;
	skill_gaps: string[];
	recommendations: string[];
}
export type NotificationType =
	| "reminder"
	| "achievement"
	| "recommendation"
	| "system";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export interface JsonObject {
	[key: string]: JsonValue;
}

export interface JsonArray extends Array<JsonValue> {}

export interface User {
	id?: string;
	email: string;
	password_hash: string | null;
	full_name: string;
	role: UserRole;
	is_active: boolean;
	created_at: DatabaseTimestamp;
	updated_at: DatabaseTimestamp;
}

export interface StudentProfile {
	id?: string;
	user_id: string;
	date_of_birth: DatabaseDate | null;
	phone: string | null;
	address: string | null;
	school_name: string | null;
	grade_level: number | null;
	self_assessed_level: AcademicSelfRating | null;
	math_average_score: NumericValue | null;
	preferred_teacher_gender: PreferredTeacherGender | null;
	selected_tutor_id: string | null;
	favorite_color: string | null;
	interests: string | null;
	initial_classification: string | null;
	created_at: DatabaseTimestamp;
	updated_at: DatabaseTimestamp;
}

export interface StudentThemePreference {
	id?: string;
	student_id: string;
	favorite_color: string | null;
	font_size: "small" | "medium" | "large" | null;
	theme_mode: "light" | "dark" | null;
	created_at: DatabaseTimestamp;
	updated_at: DatabaseTimestamp;
}

export interface AITutor {
	id?: string;
	code: string;
	name: string;
	display_name: string;
	avatar_emoji: string;
	avatar_url: string | null;
	gender_style: "nam" | "nu" | null;
	tone_style: string | null;
	teaching_style: string | null;
	personality: string | null;
	description: string | null;
	system_prompt: string | null;
	is_active: boolean;
	created_at: DatabaseTimestamp;
}

export interface Assessment {
	id?: string;
	student_id: string;
	type: AssessmentType;
	title: string;
	grade_level: number;
	target_difficulty: string | null;
	generated_by_ai: boolean;
	total_questions: number;
	total_score: NumericValue | null;
	duration_minutes: number | null;
	status: AssessmentStatus;
	created_at: DatabaseTimestamp;
	updated_at: DatabaseTimestamp;
}

export interface AssessmentQuestion {
	id?: string;
	assessment_id: string;
	question_type: AssessmentQuestionType;
	topic: string;
	difficulty_level: string;
	question_text: string;
	choices: JsonValue | null;
	correct_answer: string | null;
	solution_steps: JsonValue | null;
	explanation: string | null;
	score: NumericValue;
	order_index: number;
}

export interface AssessmentAttempt {
	id?: string;
	assessment_id: string;
	student_id: string;
	started_at: DatabaseTimestamp;
	submitted_at: DatabaseTimestamp | null;
	total_score: NumericValue | null;
	max_score: NumericValue | null;
	percentage: NumericValue | null;
	ai_feedback: string | null;
	ai_analysis: JsonValue | null;
	status: AssessmentAttemptStatus;
	created_at: DatabaseTimestamp;
	updated_at: DatabaseTimestamp;
}

export interface AssessmentAnswer {
	id?: string;
	attempt_id: string;
	question_id: string;
	student_answer: string | null;
	selected_choice: string | null;
	is_correct: boolean | null;
	score: NumericValue | null;
	ai_comment: string | null;
	answered_at: DatabaseTimestamp | null;
}

export interface Curriculum {
	id?: string;
	student_id: string;
	title: string;
	input_level: string;
	ai_summary: string;
	target_goal: string | null;
	estimated_total_sessions: number | null;
	status: CurriculumStatus;
	created_by_ai: boolean;
	created_at: DatabaseTimestamp;
	updated_at: DatabaseTimestamp;
}

export interface CurriculumModule {
	id?: string;
	curriculum_id: string;
	module_title: string;
	module_description: string | null;
	topic: string;
	order_index: number;
	/** Giai đoạn lộ trình (Module 3): foundation/consolidation/advanced/practice. */
	stage?: "foundation" | "consolidation" | "advanced" | "practice" | null;
	estimated_sessions: number | null;
	target_mastery: NumericValue | null;
	status: CurriculumModuleStatus;
}

export interface Lesson {
	id?: string;
	curriculum_id: string;
	module_id: string | null;
	student_id: string;
	lesson_title: string;
	lesson_date: DatabaseDate | null;
	theory_content: string;
	lesson_objective: string | null;
	ai_tutor_id: string | null;
	estimated_minutes: number | null;
	order_index: number;
	status: LessonStatus;
	created_at: DatabaseTimestamp;
}

export interface LessonExercise {
	id?: string;
	lesson_id: string;
	topic: string;
	difficulty_level: string;
	question_text: string;
	answer_type: LessonExerciseAnswerType;
	choices: JsonValue | null;
	correct_answer: string | null;
	solution_steps: JsonValue | null;
	explanation: string | null;
	order_index: number;
}

export interface LessonExerciseAnswer {
	id?: string;
	exercise_id: string;
	lesson_id?: string | null;
	student_id: string;
	quiz_result_id?: string | null;
	student_answer: string | null;
	selected_choice: string | null;
	is_correct: boolean | null;
	score: NumericValue | null;
	ai_comment: string | null;
	exercise_snapshot?: JsonValue | null;
	answered_at: DatabaseTimestamp;
}

export interface LessonQuizResult {
	id?: string;
	lesson_id: string;
	student_id: string;
	idempotency_key?: string | null;
	total_questions: number;
	correct_answers: number;
	score: NumericValue | null;
	max_score: NumericValue | null;
	percentage: NumericValue | null;
	duration_seconds: number | null;
	ai_feedback: string | null;
	passed: boolean;
	started_at: DatabaseTimestamp | null;
	submitted_at: DatabaseTimestamp | null;
	created_at: DatabaseTimestamp;
}

export interface TopicMastery {
	id?: string;
	student_id: string;
	topic: string;
	grade_level: number;
	mastery_level: NumericValue;
	total_attempts: number;
	correct_attempts: number;
	strength_label: TopicStrengthLabel | null;
	last_practiced_at: DatabaseTimestamp | null;
	created_at: DatabaseTimestamp;
	updated_at: DatabaseTimestamp;
}

export interface StudentProgress {
	id?: string;
	student_id: string;
	curriculum_id: string | null;
	total_lessons: number;
	completed_lessons: number;
	completion_percentage: NumericValue;
	average_quiz_score: NumericValue | null;
	total_study_time_minutes: number;
	current_streak_days: number;
	longest_streak_days: number;
	last_study_date: DatabaseDate | null;
	ai_progress_summary: string | null;
	predicted_improvement: NumericValue | null;
	created_at: DatabaseTimestamp;
	updated_at: DatabaseTimestamp;
}

export interface LessonRecommendation {
	id?: string;
	student_id: string;
	lesson_id: string;
	recommendation_type: RecommendationType;
	reason: string | null;
	priority: number;
	is_completed: boolean;
	recommended_date: DatabaseDate;
	created_at: DatabaseTimestamp;
}

export interface SolverRequest {
	id?: string;
	student_id: string;
	lesson_id: string | null;
	input_type: SolverInputType;
	input_text: string | null;
	image_url: string | null;
	parsed_text: string | null;
	ai_response: string | null;
	solution_steps: JsonValue | null;
	explanation: string | null;
	common_mistakes: string | null;
	ai_model: string | null;
	tokens_used: number | null;
	related_topic: string | null;
	created_at: DatabaseTimestamp;
}

export interface AITutorConversation {
	id?: string;
	student_id: string;
	ai_tutor_id: string;
	lesson_id: string | null;
	title: string | null;
	context_summary: string | null;
	status: ConversationStatus;
	created_at: DatabaseTimestamp;
	updated_at: DatabaseTimestamp;
}

export interface AITutorMessage {
	id?: string;
	conversation_id: string;
	role: MessageRole;
	content: string;
	message_type: MessageType;
	ai_model: string | null;
	tokens_used: number | null;
	created_at: DatabaseTimestamp;
}

export interface SystemSetting {
	id?: string;
	key: string;
	value: string;
	created_at: DatabaseTimestamp;
	updated_at: DatabaseTimestamp;
}

export interface AIGenerationLog {
	id?: string;
	student_id: string | null;
	generation_type: string;
	prompt_template: string | null;
	prompt_version: string | null;
	ai_model: string;
	input_data: JsonValue | null;
	output_data: JsonValue | null;
	tokens_input: number | null;
	tokens_output: number | null;
	cost_usd: NumericValue | null;
	response_time_ms: number | null;
	status: AIGenerationStatus;
	error_message: string | null;
	created_at: DatabaseTimestamp;
}

export interface Notification {
	id?: string;
	user_id: string;
	title: string;
	content: string | null;
	type: NotificationType;
	is_read: boolean;
	read_at: DatabaseTimestamp | null;
	created_at: DatabaseTimestamp;
}

export interface CreateUserDTO {
	email: string;
	phone?: string;
	password_hash?: string;
	role?: UserRole;
	is_active?: boolean;
}

export interface LoginDTO {
	email: string;
	password: string;
}

export interface RegisterDTO {
	email: string;
	password: string;
	full_name: string;
	grade_level: number;
	date_of_birth?: DatabaseDate;
	phone?: string;
	address?: string;
	school_name?: string;
	self_assessed_level?: AcademicSelfRating;
	math_average_score?: number;
	preferred_teacher_gender?: PreferredTeacherGender;
	selected_tutor_id?: string;
	favorite_color?: string;
	interests?: string;
	role?: UserRole;
}

export interface CreateStudentProfileDTO {
	user_id: string;
	date_of_birth?: DatabaseDate;
	phone?: string;
	address?: string;
	school_name?: string;
	grade_level?: number;
	self_assessed_level?: AcademicSelfRating;
	math_average_score?: number;
	preferred_teacher_gender?: PreferredTeacherGender;
	selected_tutor_id?: string;
	favorite_color?: string;
	interests?: string;
	initial_classification?: string;
}

export interface UpdateStudentProfileDTO {
	full_name?: string;
	date_of_birth?: DatabaseDate;
	phone?: string;
	address?: string;
	school_name?: string;
	grade_level?: number;
	self_assessed_level?: AcademicSelfRating;
	math_average_score?: number;
	selected_tutor_id?: string;
	interests?: string;
}

export interface UpdateThemeDTO {
	favorite_color?: string;
	font_size?: "small" | "medium" | "large";
	theme_mode?: "light" | "dark";
}

export interface CreateAssessmentQuestionDTO {
	question_type: AssessmentQuestionType;
	topic: string;
	difficulty_level: string;
	question_text: string;
	choices?: JsonValue;
	correct_answer?: string;
	solution_steps?: JsonValue;
	explanation?: string;
	score?: number;
	order_index?: number;
}

export interface CreateAssessmentDTO {
	student_id: string;
	type: AssessmentType;
	title: string;
	grade_level: number;
	target_difficulty?: string;
	generated_by_ai?: boolean;
	total_questions?: number;
	total_score?: number;
	duration_minutes?: number;
	status?: AssessmentStatus;
	questions?: CreateAssessmentQuestionDTO[];
}

export interface SubmitAssessmentAnswerDTO {
	question_id: string;
	student_answer?: string;
	selected_choice?: string;
}

export interface SubmitAssessmentDTO {
	assessment_id: string;
	student_id: string;
	answers: SubmitAssessmentAnswerDTO[];
}

export interface CreateCurriculumDTO {
	student_id: string;
	title: string;
	input_level: string;
	ai_summary: string;
	target_goal?: string;
	estimated_total_sessions?: number;
	status?: CurriculumStatus;
	created_by_ai?: boolean;
}

export interface SubmitExerciseDTO {
	exercise_id: string;
	student_id?: string;
	student_answer?: string;
	selected_choice?: string;
}

export interface SubmitLessonExerciseAttemptDTO {
	answers: SubmitExerciseDTO[];
	duration_seconds?: number | null;
	started_at?: DatabaseTimestamp | null;
	submitted_at?: DatabaseTimestamp | null;
	idempotency_key?: string | null;
	attempt_id?: string | null;
}

export interface SolverRequestDTO {
	student_id: string;
	lesson_id?: string;
	input_type: SolverInputType;
	input_text?: string;
	image_url?: string;
	parsed_text?: string;
}

export interface CreateConversationDTO {
	student_id: string;
	ai_tutor_id: string;
	lesson_id?: string;
	title?: string;
	context_summary?: string;
}

export interface SendMessageDTO {
	conversation_id: string;
	role: MessageRole;
	content: string;
	message_type?: MessageType;
	ai_model?: string;
}

export interface PaginationQuery {
	page?: number;
	limit?: number;
	sort?: string;
	order?: SortOrder;
}

export interface ApiResponse<T> {
	success: boolean;
	message: string;
	data: T | null;
	meta?: Record<string, unknown>;
}

export interface PaginatedMeta {
	total: number;
	page: number;
	limit: number;
	totalPages: number;
	[key: string]: unknown;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
	data: T[];
	meta: PaginatedMeta;
}

// ── Engagement & Session Tracking ──────────────────────────────────────

export type EngagementSessionStatus = "active" | "completed" | "abandoned";

export type EngagementEventType =
	| "session_start"
	| "session_end"
	| "lesson_view"
	| "scroll"
	| "click"
	| "exercise_start"
	| "exercise_answer"
	| "exercise_correct"
	| "exercise_wrong"
	| "hint_request"
	| "chat_message"
	| "quiz_start"
	| "quiz_submit"
	| "tab_away"
	| "tab_return"
	| "idle_start"
	| "idle_end";

export interface EngagementSession {
	id?: string;
	student_id: string;
	lesson_id: string | null;
	curriculum_id: string | null;
	started_at: DatabaseTimestamp;
	ended_at: DatabaseTimestamp | null;
	total_duration_seconds: number;
	active_duration_seconds: number;
	idle_duration_seconds: number;
	focus_ratio: NumericValue;
	scroll_count: number;
	click_count: number;
	answer_count: number;
	correct_answer_count: number;
	hint_request_count: number;
	chat_message_count: number;
	tab_away_count: number;
	tab_away_total_seconds: number;
	quiz_completed: boolean;
	quiz_score: NumericValue | null;
	lessons_viewed: number;
	exercises_attempted: number;
	exercises_completed: number;
	status: EngagementSessionStatus;
	created_at: DatabaseTimestamp;
	updated_at: DatabaseTimestamp;
}

export interface EngagementEvent {
	id?: string;
	session_id: string;
	student_id: string;
	event_type: EngagementEventType;
	payload: JsonValue | null;
	lesson_id: string | null;
	exercise_id: string | null;
	created_at: DatabaseTimestamp;
}

// ── Attendance ─────────────────────────────────────────────────────────

export type AttendanceStatus = "present" | "partial" | "absent_pending" | "absent";

export interface AttendanceRecord {
	id?: string;
	student_id: string;
	lesson_id: string;
	curriculum_id: string | null;
	session_id: string | null;
	scheduled_date: DatabaseDate;
	scheduled_start_time: string | null;
	actual_start_time: DatabaseTimestamp | null;
	actual_end_time: DatabaseTimestamp | null;
	status: AttendanceStatus;
	expected_duration_minutes: number;
	active_duration_seconds: number;
	focus_ratio: NumericValue;
	quiz_completed: boolean;
	status_reason: string | null;
	created_at: DatabaseTimestamp;
	updated_at: DatabaseTimestamp;
}

// ── Learning Risk ──────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";

export interface LearningRiskScore {
	id?: string;
	student_id: string;
	score_date: DatabaseDate;
	absenteeism_rate: NumericValue;
	incomplete_session_rate: NumericValue;
	low_engagement_rate: NumericValue;
	quiz_decline_rate: NumericValue;
	missed_recommendation_rate: NumericValue;
	risk_score: NumericValue;
	risk_level: RiskLevel;
	details: JsonValue | null;
	created_at: DatabaseTimestamp;
}

// ── Parent Notifications ───────────────────────────────────────────────

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

export interface ParentNotification {
	id?: string;
	parent_user_id: string;
	student_id: string;
	type: ParentNotificationType;
	title: string;
	content: string | null;
	payload: JsonValue | null;
	severity: NotificationSeverity;
	is_read: boolean;
	read_at: DatabaseTimestamp | null;
	channel: NotificationChannel;
	delivered_at: DatabaseTimestamp | null;
	created_at: DatabaseTimestamp;
}

export interface ParentNotificationPreference {
	id?: string;
	parent_user_id: string;
	notify_session_start: boolean;
	notify_session_complete: boolean;
	notify_absent: boolean;
	notify_daily_summary: boolean;
	notify_weekly_summary: boolean;
	notify_risk_alert: boolean;
	notify_achievement: boolean;
	notify_quiz_result: boolean;
	notify_low_engagement: boolean;
	notify_streak_break: boolean;
	preferred_channel: NotificationChannel;
	quiet_hours_start: string | null;
	quiet_hours_end: string | null;
	created_at: DatabaseTimestamp;
	updated_at: DatabaseTimestamp;
}

// ── DTOs for new features ──────────────────────────────────────────────

export interface TrackEngagementEventDTO {
	session_id: string;
	event_type: EngagementEventType;
	payload?: JsonValue;
	lesson_id?: string;
	exercise_id?: string;
}

export interface StartEngagementSessionDTO {
	student_id: string;
	lesson_id?: string;
	curriculum_id?: string;
}

export interface EndEngagementSessionDTO {
	session_id: string;
}

export interface AdaptiveRecommendation {
	/** New content lesson to study (60% of session) */
	new_lesson: {
		lesson_id: string;
		title: string;
		topic: string;
		reason: string;
	} | null;
	/** Review items for forgotten/decayed topics (20% of session) */
	review_items: Array<{
		lesson_id: string;
		title: string;
		topic: string;
		effective_mastery: number;
		days_since_practice: number;
		reason: string;
	}>;
	/** Reinforce items for recent errors (20% of session) */
	reinforce_items: Array<{
		lesson_id: string;
		title: string;
		topic: string;
		recent_error_count: number;
		error_types: string[];
		reason: string;
	}>;
	/** Session structure ratios (sum = 1.0) */
	session_structure: {
		review_ratio: number;
		new_ratio: number;
		reinforce_ratio: number;
	};
	/** Signals used for this recommendation */
	signals: {
		last_quiz_score: number | null;
		hint_usage_rate: number;
		avg_time_per_question: number | null;
		recurring_error_topics: string[];
		stability_last_5: number;
		forgetting_risk_topics: string[];
	};
	/** AI-generated tips */
	learning_tips: string[];
	/** Stable fallback reason when there is no actionable recommendation */
	fallback_reason: string | null;
	/** Overall stats */
	stats: {
		total_lessons: number;
		completed_lessons: number;
		remaining_lessons: number;
		current_streak: number;
	};
}

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
		status: AttendanceStatus | "scheduled";
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
		level: RiskLevel;
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
