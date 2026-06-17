import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

import {
	GradebookEntryRepository,
	type IGradebookEntry,
	type UpsertGradebookEntryInput,
} from "../models/gradebook.model";
import { GradebookService } from "./gradebook.service";

function makeEntry(overrides: Partial<IGradebookEntry> = {}): IGradebookEntry {
	return {
		_id: new Types.ObjectId(),
		student_id: new Types.ObjectId("507f1f77bcf86cd799439011"),
		class_id: new Types.ObjectId("507f1f77bcf86cd799439012"),
		teacher_id: new Types.ObjectId("507f1f77bcf86cd799439013"),
		source_type: "teacher_assignment",
		source_id: "assignment-1",
		attempt_id: "submission-1",
		title: "Homework 1",
		earned_points: 8,
		max_points: 10,
		percentage: 80,
		status: "graded",
		graded_at: new Date(),
		submitted_at: new Date(),
		metadata: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	} as unknown as IGradebookEntry;
}

test("GradebookService upserts bounded teacher assignment entries", async () => {
	const calls: UpsertGradebookEntryInput[] = [];
	class FakeGradebookEntryRepository extends GradebookEntryRepository {
		public override async upsertEntry(input: UpsertGradebookEntryInput): Promise<IGradebookEntry> {
			calls.push(input);
			return makeEntry(input as Partial<IGradebookEntry>);
		}
	}

	const service = new GradebookService(new FakeGradebookEntryRepository());
	const entry = await service.upsertTeacherAssignmentEntry({
		teacher_id: "507f1f77bcf86cd799439013",
		class_id: "507f1f77bcf86cd799439012",
		assignment_id: "assignment-1",
		submission_id: "submission-1",
		student_id: "507f1f77bcf86cd799439011",
		title: "Homework 1",
		earned_points: 8.236,
		max_points: 10,
		metadata: { scoring_method: "rubric" },
	});

	assert.equal(calls.length, 1);
	assert.equal(String(calls[0]?.teacher_id), "507f1f77bcf86cd799439013");
	assert.equal(calls[0]?.source_type, "teacher_assignment");
	assert.equal(calls[0]?.source_id, "assignment-1");
	assert.equal(calls[0]?.attempt_id, "submission-1");
	assert.equal(calls[0]?.earned_points, 8.24);
	assert.equal(calls[0]?.percentage, 82.4);
	assert.equal(entry.earned_points, 8.24);
});

test("GradebookService rejects entries above max points before repository writes", async () => {
	class FakeGradebookEntryRepository extends GradebookEntryRepository {
		public override async upsertEntry(): Promise<IGradebookEntry> {
			throw new Error("repository should not be called");
		}
	}

	const service = new GradebookService(new FakeGradebookEntryRepository());
	await assert.rejects(
		() => service.upsertEntry({
			student_id: "507f1f77bcf86cd799439011",
			source_type: "teacher_assignment",
			source_id: "assignment-1",
			attempt_id: "submission-1",
			title: "Homework 1",
			earned_points: 11,
			max_points: 10,
		}),
		/Earned points must be between 0 and max points/,
	);
});

test("GradebookService summarizes by student and source type with teacher filters", async () => {
	const studentA = new Types.ObjectId("507f1f77bcf86cd799439011");
	const studentB = new Types.ObjectId("507f1f77bcf86cd799439014");
	const entries = [
		makeEntry({ student_id: studentA, earned_points: 8, max_points: 10, source_type: "teacher_assignment" }),
		makeEntry({ student_id: studentA, earned_points: 15, max_points: 20, source_type: "assessment", source_id: "assessment-1" }),
		makeEntry({ student_id: studentB, earned_points: 5, max_points: 10, source_type: "teacher_assignment", source_id: "assignment-2" }),
	];
	class FakeGradebookEntryRepository extends GradebookEntryRepository {
		public override async findByTeacherClass(teacherId: string, classId?: string): Promise<IGradebookEntry[]> {
			assert.equal(teacherId, "507f1f77bcf86cd799439013");
			assert.equal(classId, "507f1f77bcf86cd799439012");
			return entries;
		}
	}

	const service = new GradebookService(new FakeGradebookEntryRepository());
	const summary = await service.getSummary({
		teacher_id: "507f1f77bcf86cd799439013",
		class_id: "507f1f77bcf86cd799439012",
	});

	assert.equal(summary.earned_points, 28);
	assert.equal(summary.max_points, 40);
	assert.equal(summary.percentage, 70);
	assert.equal(summary.entries, 3);
	assert.equal(summary.students.length, 2);
	const studentSummary = summary.students.find((item) => item.student_id === String(studentA));
	assert.ok(studentSummary);
	assert.equal(studentSummary.earned_points, 23);
	assert.equal(studentSummary.max_points, 30);
	assert.equal(studentSummary.percentage, 76.67);
	assert.equal(studentSummary.by_source_type.assessment.percentage, 75);
	assert.equal(studentSummary.gradebook_entries.length, 2);
});

test("GradebookService keeps student filters scoped to teacher entries", async () => {
	const studentA = "507f1f77bcf86cd799439011";
	const studentB = "507f1f77bcf86cd799439014";
	const entries = [
		makeEntry({ student_id: new Types.ObjectId(studentA), earned_points: 8, max_points: 10 }),
		makeEntry({ student_id: new Types.ObjectId(studentB), earned_points: 5, max_points: 10, source_id: "assignment-2" }),
	];
	class FakeGradebookEntryRepository extends GradebookEntryRepository {
		public override async findByTeacherClass(): Promise<IGradebookEntry[]> {
			return entries;
		}
	}

	const service = new GradebookService(new FakeGradebookEntryRepository());
	const summary = await service.getSummary({
		teacher_id: "507f1f77bcf86cd799439013",
		student_id: studentB,
	});

	assert.equal(summary.entries, 1);
	assert.equal(summary.students[0]?.student_id, studentB);
	assert.equal(summary.students[0]?.earned_points, 5);
});
