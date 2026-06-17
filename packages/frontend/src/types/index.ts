export interface User {
	id?: string;
	_id?: string;
	email: string;
	full_name?: string;
	phone?: string;
	role: string;
	is_active: boolean;
	created_at?: string;
	updated_at?: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface StudentProfile {
	id?: string;
	_id?: string;
	user_id: string;
	full_name?: string;
	date_of_birth: string | null;
	phone?: string | null;
	address: string | null;
	school_name: string | null;
	grade_level: number | null;
	self_assessed_level?: "weak" | "average" | "good" | "excellent" | null;
	math_average_score?: number | string | null;
	preferred_teacher_gender?: "thay" | "co" | null;
	selected_tutor_id?: string | null;
	favorite_color?: string | null;
	interests?: string | null;
	initial_classification?: string | null;
	personality_summary?: string;
	learning_goal?: string;
}

export interface ApiResponse<T> {
	success: boolean;
	message?: string;
	data: T;
}

// AI Teacher types
export interface AITutor {
	id: string;
	code: string;
	name: string;
	display_name: string;
	avatar_url: string | null;
	avatar_emoji: string;
	gender_style: "nam" | "nu" | null;
	tone_style: string;
	teaching_style: string | null;
	personality: string | null;
	description: string | null;
	is_active: boolean;
}

export interface Conversation {
	id: string;
	student_id: string;
	ai_tutor_id: string;
	title: string | null;
	status: "active" | "archived" | "closed";
	created_at: string;
	updated_at: string;
}

export interface ChatMessage {
	id: string;
	conversation_id: string;
	role: "student" | "tutor" | "system";
	content: string;
	message_type: string;
	created_at: string;
}
