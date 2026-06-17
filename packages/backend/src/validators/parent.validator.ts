import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

/**
 * HH:MM format regex — validates 00:00 through 23:59.
 */
const hhmmRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const linkChildSchema = z.object({
	body: z.object({
		student_email: z.string().email("Email học sinh không hợp lệ"),
		date_of_birth: z
			.string()
			.regex(dateRegex, "Ngày sinh phải đúng định dạng YYYY-MM-DD"),
	}),
});

export const updatePreferencesSchema = z.object({
	body: z.object({
		notify_session_start: z.boolean().optional(),
		notify_session_complete: z.boolean().optional(),
		notify_absent: z.boolean().optional(),
		notify_daily_summary: z.boolean().optional(),
		notify_weekly_summary: z.boolean().optional(),
		notify_quiz_result: z.boolean().optional(),
		notify_risk_alert: z.boolean().optional(),
		notify_achievement: z.boolean().optional(),
		notify_low_engagement: z.boolean().optional(),
		notify_streak_break: z.boolean().optional(),
		preferred_channel: z
			.enum(["in_app", "email", "sms", "push"])
			.optional(),
		quiet_hours_start: z
			.string()
			.regex(hhmmRegex, "quiet_hours_start phải đúng định dạng HH:MM (00:00–23:59)")
			.nullable()
			.optional(),
		quiet_hours_end: z
			.string()
			.regex(hhmmRegex, "quiet_hours_end phải đúng định dạng HH:MM (00:00–23:59)")
			.nullable()
			.optional(),
	}),
});
