import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	getLessonDetailEndpoint,
	getLessonExerciseGenerationEndpoint,
} from "./lesson-endpoints";

describe("lesson endpoints", () => {
	test("returns null endpoints for namespaced fallback lesson ids", () => {
		for (const id of ["demo-1", "demo-2", "demo-3", "demo-4", "demo-5", "demo-6"]) {
			assert.equal(getLessonDetailEndpoint(id), null);
			assert.equal(getLessonExerciseGenerationEndpoint(id), null);
		}
	});

	test("returns backend endpoints for bare numeric ids", () => {
		assert.equal(getLessonDetailEndpoint("1"), "/lessons/1");
		assert.equal(getLessonExerciseGenerationEndpoint("1"), "/lessons/1/exercises/generate");
	});

	test("returns backend endpoints for ObjectId-like lesson ids", () => {
		const id = "507f1f77bcf86cd799439011";

		assert.equal(getLessonDetailEndpoint(id), `/lessons/${id}`);
		assert.equal(
			getLessonExerciseGenerationEndpoint(id),
			`/lessons/${id}/exercises/generate`,
		);
	});
});