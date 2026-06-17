import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

import { mathRubricContractRepository } from "../models/content-library.model";
import { studentSubmissionRepository, teacherAssignmentRepository } from "../models/teacher.model";
import { auditService } from "./audit.service";
import { gradebookService } from "./gradebook.service";
import { pointService } from "./point.service";
import { TeacherService } from "./teacher.service";

const teacherId = "507f1f77bcf86cd799439013";
const classId = "507f1f77bcf86cd799439012";
const studentId = "507f1f77bcf86cd799439011";
const assignmentId = "507f1f77bcf86cd799439015";
const submissionId = "507f1f77bcf86cd799439016";
const rubricId = "507f1f77bcf86cd799439017";

function makeSubmission(overrides: Record<string, unknown> = {}) {
	return {
		_id: new Types.ObjectId(submissionId),
		id: submissionId,
		assignment_id: new Types.ObjectId(assignmentId),
		student_id: new Types.ObjectId(studentId),
		content: "answer",
		score: null,
		feedback: null,
		rubric_score: null,
		graded_at: null,
		submitted_at: new Date("2026-01-01T00:00:00.000Z"),
		toObject() { return { ...this }; },
		...overrides,
	} as any;
}

function makeAssignment(overrides: Record<string, unknown> = {}) {
	return {
		_id: new Types.ObjectId(assignmentId),
		id: assignmentId,
		teacher_id: new Types.ObjectId(teacherId),
		class_id: new Types.ObjectId(classId),
		title: "Rubric homework",
		total_points: 10,
		rubric_contract_id: new Types.ObjectId(rubricId),
		...overrides,
	} as any;
}

function makeRubricContract() {
	return {
		_id: new Types.ObjectId(rubricId),
		total_points: 10,
		criteria: [
			{ key: "method", title: "Method", max_points: 6, scoring: "points" },
			{ key: "answer", title: "Answer", max_points: 4, scoring: "levels", levels: [
				{ label: "full", points: 4 },
				{ label: "partial", points: 2 },
				{ label: "none", points: 0 },
			] },
		],
	} as any;
}

test("TeacherService gradeSubmission uses rubric scores and updates gradebook/audit", async () => {
	const originalSubmissionFindById = studentSubmissionRepository.findById;
	const originalSubmissionUpdate = studentSubmissionRepository.update;
	const originalAssignmentFindById = teacherAssignmentRepository.findById;
	const originalRubricFindActiveById = mathRubricContractRepository.findActiveById;
	const originalPointRecord = pointService.recordTeacherAssignmentResult;
	const originalGradebookUpsert = gradebookService.upsertTeacherAssignmentEntry;
	const originalAuditRecord = auditService.record;
	const updatedPayloads: any[] = [];
	const pointInputs: any[] = [];
	const gradebookInputs: any[] = [];
	const auditInputs: any[] = [];

	try {
		studentSubmissionRepository.findById = async () => makeSubmission();
		studentSubmissionRepository.update = async (_id: string, payload: any) => {
			updatedPayloads.push(payload);
			return makeSubmission({ ...payload });
		};
		teacherAssignmentRepository.findById = async () => makeAssignment();
		mathRubricContractRepository.findActiveById = async () => makeRubricContract();
		pointService.recordTeacherAssignmentResult = async (input: any) => {
			pointInputs.push(input);
			return {} as any;
		};
		gradebookService.upsertTeacherAssignmentEntry = async (input: any) => {
			gradebookInputs.push(input);
			return { _id: new Types.ObjectId(), ...input } as any;
		};
		auditService.record = async (input: any) => {
			auditInputs.push(input);
			return null;
		};

		const result = await new TeacherService().gradeSubmission(teacherId, submissionId, {
			score: 1,
			feedback: "Good work",
			rubric_scores: [
				{ criterion_key: "method", points: 5 },
				{ criterion_key: "answer", level_label: "partial" },
			],
		});

		assert.equal(updatedPayloads[0].score, 7);
		assert.equal(updatedPayloads[0].rubric_score.earned_points, 7);
		assert.equal(pointInputs[0].earned_points, 7);
		assert.equal(pointInputs[0].metadata.scoring_method, "rubric");
		assert.equal(gradebookInputs[0].earned_points, 7);
		assert.equal(gradebookInputs[0].metadata.scoring_method, "rubric");
		assert.equal(auditInputs[0].action, "gradebook.teacher_assignment_update");
		assert.equal(auditInputs[0].result, "success");
		assert.equal(result.score, 7);
	} finally {
		studentSubmissionRepository.findById = originalSubmissionFindById;
		studentSubmissionRepository.update = originalSubmissionUpdate;
		teacherAssignmentRepository.findById = originalAssignmentFindById;
		mathRubricContractRepository.findActiveById = originalRubricFindActiveById;
		pointService.recordTeacherAssignmentResult = originalPointRecord;
		gradebookService.upsertTeacherAssignmentEntry = originalGradebookUpsert;
		auditService.record = originalAuditRecord;
	}
});

test("TeacherService gradeSubmission falls back to legacy score on invalid rubric and audits gradebook failure safely", async () => {
	const originalSubmissionFindById = studentSubmissionRepository.findById;
	const originalSubmissionUpdate = studentSubmissionRepository.update;
	const originalAssignmentFindById = teacherAssignmentRepository.findById;
	const originalRubricFindActiveById = mathRubricContractRepository.findActiveById;
	const originalPointRecord = pointService.recordTeacherAssignmentResult;
	const originalGradebookUpsert = gradebookService.upsertTeacherAssignmentEntry;
	const originalAuditRecord = auditService.record;
	const pointInputs: any[] = [];
	const auditInputs: any[] = [];

	try {
		studentSubmissionRepository.findById = async () => makeSubmission();
		studentSubmissionRepository.update = async (_id: string, payload: any) => makeSubmission({ ...payload });
		teacherAssignmentRepository.findById = async () => makeAssignment();
		mathRubricContractRepository.findActiveById = async () => makeRubricContract();
		pointService.recordTeacherAssignmentResult = async (input: any) => {
			pointInputs.push(input);
			return {} as any;
		};
		gradebookService.upsertTeacherAssignmentEntry = async () => {
			throw new Error("gradebook unavailable");
		};
		auditService.record = async (input: any) => {
			auditInputs.push(input);
			return null;
		};

		const result = await new TeacherService().gradeSubmission(teacherId, submissionId, {
			score: 6,
			rubric_scores: [{ criterion_key: "method", points: 5 }],
		});

		assert.equal(result.score, 6);
		assert.equal(result.rubric_score, null);
		assert.equal(pointInputs[0].earned_points, 6);
		assert.equal(pointInputs[0].metadata.scoring_method, "legacy_fallback");
		assert.match(pointInputs[0].metadata.rubric_error, /Rubric score for criterion answer is required/);
		assert.equal(auditInputs[0].result, "failure");
		assert.equal(auditInputs[0].errorCode, "GRADEBOOK_UPDATE_FAILED");
	} finally {
		studentSubmissionRepository.findById = originalSubmissionFindById;
		studentSubmissionRepository.update = originalSubmissionUpdate;
		teacherAssignmentRepository.findById = originalAssignmentFindById;
		mathRubricContractRepository.findActiveById = originalRubricFindActiveById;
		pointService.recordTeacherAssignmentResult = originalPointRecord;
		gradebookService.upsertTeacherAssignmentEntry = originalGradebookUpsert;
		auditService.record = originalAuditRecord;
	}
});
