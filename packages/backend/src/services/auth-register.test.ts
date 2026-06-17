import assert from "node:assert/strict";
import { test } from "node:test";

import { AuthService } from "./auth.service";

test("public register always creates a student account even when payload includes a privileged role", async () => {
	let createdUserPayload: Record<string, unknown> | null = null;

	const userRepository = {
		findByEmail: async () => null,
		findById: async () => null,
		update: async () => {
			throw new Error("not used");
		},
		transaction: async <T>(callback: (session: unknown) => Promise<T>) =>
			callback({}),
		create: async (payload: Record<string, unknown>) => {
			createdUserPayload = payload;
			return {
				id: "user-1",
				email: String(payload.email),
				full_name: String(payload.full_name),
				password_hash: String(payload.password_hash),
				role: payload.role,
				is_active: true,
				created_at: new Date("2026-05-01T00:00:00.000Z"),
				updated_at: new Date("2026-05-01T00:00:00.000Z"),
			};
		},
	};
	const studentProfileRepository = {
		findByUserId: async () => null,
		create: async (payload: Record<string, unknown>) => ({
			id: "student-1",
			...payload,
			created_at: new Date("2026-05-01T00:00:00.000Z"),
			updated_at: new Date("2026-05-01T00:00:00.000Z"),
		}),
	};
	const studentThemeRepository = {
		create: async (payload: Record<string, unknown>) => ({
			id: "theme-1",
			...payload,
		}),
	};
	const service = new AuthService({
		userRepository: userRepository as any,
		studentProfileRepository: studentProfileRepository as any,
		studentThemeRepository: studentThemeRepository as any,
	});

	const result = await service.register({
		email: "learner@example.com",
		password: "strong-password",
		full_name: "Learner One",
		grade_level: 6,
		role: "admin",
	} as any);

	assert.ok(createdUserPayload);
	assert.equal((createdUserPayload as Record<string, unknown>).role, "student");
	assert.equal(result.user.role, "student");
	assert.equal(result.profile.initial_classification, "trung_binh");
	assert.ok(result.tokens.access_token);
});
