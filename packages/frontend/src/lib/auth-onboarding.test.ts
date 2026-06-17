import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
	AGE_THEME_GRADE_CHANGED_EVENT,
	type AuthSessionUser,
	completeAuthSession,
	getInitialAgeThemeGrade,
	persistStudentPersonalization,
} from "./auth-onboarding";

class MemoryStorage implements Storage {
	private values = new Map<string, string>();

	get length(): number {
		return this.values.size;
	}

	clear(): void {
		this.values.clear();
	}

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	key(index: number): string | null {
		return Array.from(this.values.keys())[index] ?? null;
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}
}

const student: AuthSessionUser = {
	id: "user-1",
	email: "student@example.com",
	full_name: "Student One",
	role: "student",
};

const teacher: AuthSessionUser = {
	id: "teacher-1",
	email: "teacher@example.com",
	full_name: "Teacher One",
	role: "teacher",
};

describe("completeAuthSession", () => {
	test("hydrates student profile after login, persists personalization, and redirects incomplete onboarding to settings", async () => {
		const storage = new MemoryStorage();
		let fetched = false;

		const redirect = await completeAuthSession({
			user: student,
			accessToken: "access-token",
			refreshToken: "refresh-token",
			storage,
			studentCompleteRedirect: "/dashboard",
			fetchStudentProfile: async () => {
				fetched = true;
				assert.equal(storage.getItem("token"), "access-token");
				return {
					user: student,
					profile: {
						user_id: "user-1",
						date_of_birth: null,
						address: null,
						school_name: null,
						grade_level: 8,
						self_assessed_level: null,
					},
					theme: {
						favorite_color: "#2563eb",
						font_size: "large",
						theme_mode: "light",
					},
					onboarding: {
						completed: false,
						completion_percentage: 67,
						required_fields: [
							"full_name",
							"grade_level",
							"self_assessed_level",
						],
						missing_fields: ["self_assessed_level"],
					},
				};
			},
		});

		assert.equal(fetched, true);
		assert.equal(redirect, "/dashboard/settings");
		assert.deepEqual(JSON.parse(storage.getItem("user") ?? "null"), student);
		assert.deepEqual(
			JSON.parse(storage.getItem("mathai-user") ?? "null"),
			student,
		);
		assert.equal(storage.getItem("mathai-refresh-token"), "refresh-token");
		assert.equal(storage.getItem("mathai-student-grade"), "8");
		assert.equal(
			JSON.parse(storage.getItem("mathai-student-profile") ?? "{}").grade_level,
			8,
		);
		assert.equal(
			JSON.parse(storage.getItem("mathai-student-theme") ?? "{}")
				.favorite_color,
			"#2563eb",
		);
		assert.equal(
			JSON.parse(storage.getItem("mathai-student-onboarding") ?? "{}")
				.completed,
			false,
		);
	});

	test("keeps non-student role redirects and does not fetch student profile", async () => {
		const storage = new MemoryStorage();
		let fetchCount = 0;

		const redirect = await completeAuthSession({
			user: teacher,
			accessToken: "teacher-token",
			storage,
			fetchStudentProfile: async () => {
				fetchCount += 1;
				throw new Error("should not fetch for non-student");
			},
		});

		assert.equal(redirect, "/teacher");
		assert.equal(fetchCount, 0);
		assert.equal(storage.getItem("mathai-student-profile"), null);
	});

	test("uses returned register personalization and preserves assessment redirect when onboarding is complete", async () => {
		const storage = new MemoryStorage();
		let fetchCount = 0;

		const redirect = await completeAuthSession({
			user: student,
			accessToken: "new-token",
			storage,
			studentCompleteRedirect: "/dashboard/assessment",
			studentProfile: {
				user: student,
				profile: {
					user_id: "user-1",
					date_of_birth: "2011-01-01",
					address: "HN",
					school_name: "Math School",
					grade_level: 9,
					self_assessed_level: "good",
				},
				theme: {
					favorite_color: "#16a34a",
					font_size: "medium",
					theme_mode: "light",
				},
				onboarding: {
					completed: true,
					completion_percentage: 100,
					required_fields: ["full_name", "grade_level", "self_assessed_level"],
					missing_fields: [],
				},
			},
			fetchStudentProfile: async () => {
				fetchCount += 1;
				throw new Error("returned profile should be enough");
			},
		});

		assert.equal(redirect, "/dashboard/assessment");
		assert.equal(fetchCount, 0);
		assert.equal(storage.getItem("mathai-student-grade"), "9");
	});
});

describe("getInitialAgeThemeGrade", () => {
	test("prefers profile grade over stale grade storage", () => {
		const storage = new MemoryStorage();
		storage.setItem("mathai-student-grade", "7");
		storage.setItem(
			"mathai-student-profile",
			JSON.stringify({ user_id: "user-1", grade_level: 11 }),
		);

		assert.equal(getInitialAgeThemeGrade(storage), 11);
	});
});

describe("persistStudentPersonalization", () => {
	test("emits a grade sync event when a valid profile grade is persisted", () => {
		const storage = new MemoryStorage();
		const events = new EventTarget();
		let syncedGrade: number | null = null;
		events.addEventListener(AGE_THEME_GRADE_CHANGED_EVENT, (event) => {
			syncedGrade = (event as CustomEvent<{ grade: number }>).detail.grade;
		});

		persistStudentPersonalization(
			storage,
			{
				profile: {
					user_id: "user-1",
					grade_level: 10,
				},
			},
			events,
		);

		assert.equal(storage.getItem("mathai-student-grade"), "10");
		assert.equal(syncedGrade, 10);
	});

	test("does not emit a grade sync event for invalid or missing profile grades", () => {
		const storage = new MemoryStorage();
		const events = new EventTarget();
		let eventCount = 0;
		events.addEventListener(AGE_THEME_GRADE_CHANGED_EVENT, () => {
			eventCount += 1;
		});

		persistStudentPersonalization(
			storage,
			{
				profile: {
					user_id: "user-1",
					grade_level: 13,
				},
			},
			events,
		);

		assert.equal(storage.getItem("mathai-student-grade"), null);
		assert.equal(eventCount, 0);
	});
});
