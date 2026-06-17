import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const objectIdString = z
	.string()
	.regex(/^[a-f\d]{24}$/i, "Tutor ID không hợp lệ");

export const registerSchema = z.object({
	body: z.object({
		email: z.string().email("Email không hợp lệ"),
		password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
		full_name: z.string().min(2, "Họ tên phải có ít nhất 2 ký tự"),
		grade_level: z.number().int("Khối lớp phải là số nguyên").min(1).max(12),
		date_of_birth: z
			.string()
			.regex(dateRegex, "Ngày sinh phải đúng định dạng YYYY-MM-DD")
			.optional(),
		phone: z.string().optional(),
		address: z.string().optional(),
		school_name: z.string().optional(),
		self_assessed_level: z
			.enum(["weak", "average", "good", "excellent"])
			.optional(),
		math_average_score: z.number().min(0).max(10).optional(),
		preferred_teacher_gender: z.enum(["thay", "co"]).optional(),
		selected_tutor_id: objectIdString.optional(),
		favorite_color: z.string().optional(),
		interests: z.string().optional(),
		role: z.enum(["student", "teacher", "admin", "parent", "staff"]).optional(),
	}),
});

export const loginSchema = z.object({
	body: z.object({
		email: z.string().email("Email không hợp lệ"),
		password: z.string().min(1, "Mật khẩu không được để trống"),
	}),
});

export const forgotPasswordSchema = z.object({
	body: z.object({
		email: z.string().email("Email không hợp lệ"),
	}),
});

export const resetPasswordSchema = z.object({
	body: z.object({
		token: z.string().min(1, "Token đặt lại mật khẩu không được để trống"),
		password: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự"),
	}),
});

export const refreshSchema = z.object({
	body: z.object({
		refresh_token: z.string().min(1, "Refresh token không được để trống"),
	}),
});
