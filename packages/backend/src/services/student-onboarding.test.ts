import assert from "node:assert/strict";
import { test } from "node:test";

import { StudentService } from "./student.service";

function createService(
	overrides: {
		user?: Record<string, unknown>;
		profile?: Record<string, unknown>;
	} = {},
) {
	const service = new StudentService() as any;
	service.userRepository = {
		findById: async () => ({
			id: "user-1",
			email: "student@example.com",
			full_name: "An Nguyễn",
			password_hash: "hidden",
			role: "student",
			is_active: true,
			created_at: new Date("2026-05-01T00:00:00.000Z"),
			updated_at: new Date("2026-05-01T00:00:00.000Z"),
			...overrides.user,
		}),
	};
	service.studentProfileRepository = {
		findByUserId: async () => ({
			id: "student-1",
			user_id: "user-1",
			date_of_birth: null,
			phone: null,
			address: null,
			school_name: null,
			grade_level: 6,
			self_assessed_level: "average",
			math_average_score: null,
			preferred_teacher_gender: null,
			selected_tutor_id: null,
			favorite_color: "#4F46E5",
			interests: null,
			initial_classification: "trung_binh",
			created_at: new Date("2026-05-01T00:00:00.000Z"),
			updated_at: new Date("2026-05-01T00:00:00.000Z"),
			...overrides.profile,
		}),
	};
	service.studentThemeRepository = {
		findByStudentId: async () => ({
			id: "theme-1",
			student_id: "student-1",
			favorite_color: "#4F46E5",
			font_size: "medium",
			theme_mode: "light",
		}),
	};

	return service as StudentService;
}

test("getProfile includes completed onboarding status for a filled learner profile", async () => {
	const result = await createService().getProfile("user-1");

	assert.equal(result.onboarding.completed, true);
	assert.equal(result.onboarding.completion_percentage, 100);
	assert.deepEqual(result.onboarding.required_fields, [
		"full_name",
		"grade_level",
		"self_assessed_level",
	]);
	assert.deepEqual(result.onboarding.missing_fields, []);
});

test("getProfile reports missing onboarding fields for incomplete learner profiles", async () => {
	const result = await createService({
		user: { full_name: "   " },
		profile: { grade_level: null, self_assessed_level: null },
	}).getProfile("user-1");

	assert.equal(result.onboarding.completed, false);
	assert.equal(result.onboarding.completion_percentage, 0);
	assert.deepEqual(result.onboarding.missing_fields, [
		"full_name",
		"grade_level",
		"self_assessed_level",
	]);
});
