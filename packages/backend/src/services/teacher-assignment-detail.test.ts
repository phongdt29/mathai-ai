import assert from "node:assert/strict";
import { test } from "node:test";

import { ForbiddenError, NotFoundError } from "../utils/errors";
import { TeacherService } from "./teacher.service";

const teacherId = "teacher-1";
const assignmentId = "assignment-1";
const classId = "class-1";

const assignment = {
	id: assignmentId,
	_id: assignmentId,
	teacher_id: { toString: () => teacherId },
	class_id: classId,
	title: "Bài tập phân số",
	description: "Làm bài 1-5",
	type: "homework",
	status: "active",
	due_date: new Date("2026-05-20T00:00:00.000Z"),
	total_points: 10,
	rubric_contract_id: null,
	createdAt: new Date("2026-05-01T00:00:00.000Z"),
	updatedAt: new Date("2026-05-02T00:00:00.000Z"),
};

function createService(overrides: {
	assignmentOverride?: any;
	classOverride?: any;
} = {}) {
	const service = new TeacherService() as any;
	service.assignmentRepo = {
		findById: async () => ("assignmentOverride" in overrides ? overrides.assignmentOverride : assignment),
	};
	service.classRepo = {
		findById: async () => overrides.classOverride ?? {
			id: classId,
			_id: classId,
			name: "Lớp 6A",
			student_ids: ["student-1", "student-2"],
		},
	};
	service.submissionRepo = {
		countByAssignment: async () => ({ submitted: 1, graded: 1 }),
		avgScoreByAssignment: async () => 8.5,
	};
	return service;
}

test("getAssignment returns teacher-owned assignment detail with class and grading summary", async () => {
	const result = await createService().getAssignment(teacherId, assignmentId);

	assert.equal(result.id, assignmentId);
	assert.equal(result.title, "Bài tập phân số");
	assert.equal(result.class_id, classId);
	assert.equal(result.class_name, "Lớp 6A");
	assert.equal(result.total_students, 2);
	assert.equal(result.submitted, 1);
	assert.equal(result.graded, 1);
	assert.equal(result.avg_score, 8.5);
	assert.equal(result.rubric_contract_id, null);
	assert.equal(result.updatedAt, assignment.updatedAt);
});

test("getAssignment rejects missing or non-owned assignments", async () => {
	await assert.rejects(
		() => createService({ assignmentOverride: null }).getAssignment(teacherId, assignmentId),
		NotFoundError,
	);

	await assert.rejects(
		() => createService({
			assignmentOverride: {
				...assignment,
				teacher_id: { toString: () => "teacher-2" },
			},
		}).getAssignment(teacherId, assignmentId),
		ForbiddenError,
	);
});

