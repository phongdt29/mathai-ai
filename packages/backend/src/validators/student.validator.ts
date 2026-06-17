import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const colorRegex = /^#[0-9A-Fa-f]{6}$/;
const objectIdString = z
	.string()
	.regex(/^[a-f\d]{24}$/i, "Tutor ID không hợp lệ");

export const updateProfileSchema = z.object({
	body: z.object({
		full_name: z.string().min(2, "Họ tên phải có ít nhất 2 ký tự").optional(),
		date_of_birth: z
			.string()
			.regex(dateRegex, "Ngày sinh phải đúng định dạng YYYY-MM-DD")
			.optional(),
		phone: z.string().optional(),
		address: z.string().optional(),
		school_name: z.string().optional(),
		grade_level: z
			.number()
			.int("Khối lớp phải là số nguyên")
			.min(1)
			.max(12)
			.optional(),
		self_assessed_level: z
			.enum(["weak", "average", "good", "excellent"])
			.optional(),
		math_average_score: z.number().min(0).max(10).optional(),
		selected_tutor_id: objectIdString.optional(),
		interests: z.string().optional(),
	}),
});

export const updateThemeSchema = z.object({
	body: z.object({
		favorite_color: z
			.string()
			.regex(colorRegex, "Màu sắc phải đúng định dạng #RRGGBB")
			.optional(),
		font_size: z.enum(["small", "medium", "large"]).optional(),
		theme_mode: z.enum(["light", "dark"]).optional(),
	}),
});

export const submitAssignmentSchema = z.object({
	body: z.object({
		content: z
			.string()
			.trim()
			.min(1, "Nội dung bài nộp không được để trống")
			.max(20000, "Nội dung bài nộp không được vượt quá 20000 ký tự"),
	}),
});
