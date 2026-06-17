import assert from "node:assert/strict";
import test from "node:test";

import {
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "../utils/errors";
import { StudentAssignmentService } from "./student-assignment.service";

const profile = { id: "student-profile-1", _id: "student-profile-1" };
const activeClass = {
	id: "class-1",
	_id: "class-1",
	name: "Lớp 6A",
	teacher_id: "teacher-user-1",
	student_ids: ["student-profile-1"],
};
const otherClass = {
	id: "class-2",
	_id: "class-2",
	name: "Lớp 7B",
	teacher_id: "teacher-user-2",
	student_ids: ["student-profile-2"],
};
const assignment = {
	id: "assignment-1",
	_id: "assignment-1",
	class_id: "class-1",
	title: "Bài tập phân số",
	description: "Làm bài 1-5",
	type: "homework",
	status: "active",
	due_date: new Date("2026-05-20T00:00:00.000Z"),
	total_points: 10,
	createdAt: new Date("2026-05-01T00:00:00.000Z"),
};

function createService(
	options: {
		existingSubmission?: any;
		existingSubmissionsByAssignmentId?: Record<string, any>;
		assignmentOverride?: any;
		assignmentsOverride?: any[];
		classOverride?: any;
		profileOverride?: any;
		notificationService?: any;
	} = {},
) {
	const created: any[] = [];
	const updated: any[] = [];
	const notifications: any[] = [];
	const mockNotificationService = options.notificationService ?? {
		send: async (input: any) => {
			notifications.push(input);
			return { delivery_id: "delivery-1", channel_results: [] };
		},
	};
	const service = new StudentAssignmentService({
		notificationService: mockNotificationService,
	}) as any;
	service.studentProfileRepository = {
		findByUserId: async () =>
			"profileOverride" in options ? options.profileOverride : profile,
	};
	service.classRepository = {
		findClassesByStudentId: async () => [activeClass],
		findById: async (id: string) => {
			if (id === "class-1") return options.classOverride ?? activeClass;
			if (id === "class-2") return otherClass;
			return null;
		},
	};
	service.assignmentRepository = {
		findByClassId: async () =>
			options.assignmentsOverride ?? [options.assignmentOverride ?? assignment],
		findById: async () => options.assignmentOverride ?? assignment,
	};
	service.submissionRepository = {
		findByAssignmentAndStudent: async (assignmentId: string) =>
			options.existingSubmissionsByAssignmentId?.[assignmentId] ??
			options.existingSubmission ??
			null,
		create: async (payload: any) => {
			created.push(payload);
			return {
				id: "submission-1",
				_id: "submission-1",
				...payload,
				score: null,
				feedback: null,
				rubric_score: null,
				graded_at: null,
			};
		},
		update: async (id: string, payload: any) => {
			updated.push({ id, payload });
			return {
				...(options.existingSubmission ?? {}),
				id,
				_id: id,
				...payload,
			};
		},
	};
	return { service: service as StudentAssignmentService, created, updated, notifications };
}

test("listAssignments returns active class assignments with the student's submission state", async () => {
	const submittedAt = new Date("2026-05-10T10:00:00.000Z");
	const gradedAt = new Date("2026-05-11T00:00:00.000Z");
	const { service } = createService({
		existingSubmission: {
			id: "submission-1",
			_id: "submission-1",
			assignment_id: "assignment-1",
			student_id: "student-profile-1",
			content: "Lời giải của em",
			score: 8,
			feedback: "Tốt",
			rubric_score: null,
			graded_at: gradedAt,
			submitted_at: submittedAt,
		},
	});

	const result = await service.listAssignments("student-user-1");

	assert.equal(result.length, 1);
	assert.deepEqual(result[0], {
		id: "assignment-1",
		title: "Bài tập phân số",
		description: "Làm bài 1-5",
		type: "homework",
		status: "active",
		due_date: assignment.due_date,
		total_points: 10,
		class_id: "class-1",
		class_name: "Lớp 6A",
		submission_id: "submission-1",
		submission_content: "Lời giải của em",
		submitted_at: submittedAt,
		score: 8,
		feedback: "Tốt",
		graded_at: gradedAt,
	});
});

test("listAssignmentsPage filters by status and submission state with pagination metadata", async () => {
	const assignments = [
		assignment,
		{
			...assignment,
			id: "assignment-2",
			_id: "assignment-2",
			title: "Bài đang chấm",
			status: "grading",
			due_date: new Date("2026-05-21T00:00:00.000Z"),
		},
		{
			...assignment,
			id: "assignment-3",
			_id: "assignment-3",
			title: "Bài đã chấm",
			status: "closed",
			due_date: new Date("2026-05-22T00:00:00.000Z"),
		},
	];
	const gradedAt = new Date("2026-05-23T00:00:00.000Z");
	const { service } = createService({
		assignmentsOverride: assignments,
		existingSubmissionsByAssignmentId: {
			"assignment-2": {
				id: "submission-2",
				_id: "submission-2",
				content: "Đã nộp",
				score: null,
				feedback: null,
				graded_at: null,
				submitted_at: new Date("2026-05-20T00:00:00.000Z"),
			},
			"assignment-3": {
				id: "submission-3",
				_id: "submission-3",
				content: "Đã chấm",
				score: 9,
				feedback: "Tốt",
				graded_at: gradedAt,
				submitted_at: new Date("2026-05-20T00:00:00.000Z"),
			},
		},
	});

	const submitted = await service.listAssignmentsPage("student-user-1", {
		submission_status: "submitted",
		page: 1,
		limit: 1,
	});
	const closed = await service.listAssignmentsPage("student-user-1", {
		status: "closed",
		page: 1,
		limit: 5,
	});

	assert.equal(submitted.total, 1);
	assert.equal(submitted.total_pages, 1);
	assert.equal(submitted.items[0]?.id, "assignment-2");
	assert.equal(submitted.filters.submission_status, "submitted");
	assert.equal(closed.total, 1);
	assert.equal(closed.items[0]?.id, "assignment-3");
	assert.equal(closed.items[0]?.score, 9);
});

test("submitAssignment creates a new submission for an enrolled student", async () => {
	const { service, created } = createService();

	const result = await service.submitAssignment(
		"student-user-1",
		"assignment-1",
		{
			content: "  Đây là lời giải của em.  ",
		},
	);

	assert.equal(created.length, 1);
	assert.equal(created[0].assignment_id, "assignment-1");
	assert.equal(created[0].student_id, "student-profile-1");
	assert.equal(created[0].content, "Đây là lời giải của em.");
	assert.equal(result.content, "Đây là lời giải của em.");
	assert.equal(result.score, null);
});

test("submitAssignment updates an existing ungraded submission", async () => {
	const existingSubmission = {
		id: "submission-1",
		_id: "submission-1",
		assignment_id: "assignment-1",
		student_id: "student-profile-1",
		content: "Bản cũ",
		score: null,
		feedback: null,
		graded_at: null,
		submitted_at: new Date("2026-05-10T10:00:00.000Z"),
	};
	const { service, created, updated } = createService({ existingSubmission });

	const result = await service.submitAssignment(
		"student-user-1",
		"assignment-1",
		{
			content: "Bản mới",
		},
	);

	assert.equal(created.length, 0);
	assert.equal(updated.length, 1);
	assert.equal(updated[0].id, "submission-1");
	assert.equal(updated[0].payload.content, "Bản mới");
	assert.equal(result.content, "Bản mới");
});

test("submitAssignment rejects closed, graded, or non-enrolled submissions", async () => {
	await assert.rejects(
		() =>
			createService({
				assignmentOverride: { ...assignment, status: "closed" },
			}).service.submitAssignment("student-user-1", "assignment-1", {
				content: "Bài làm",
			}),
		ValidationError,
	);

	await assert.rejects(
		() =>
			createService({
				existingSubmission: {
					id: "submission-1",
					score: 9,
					graded_at: new Date(),
				},
			}).service.submitAssignment("student-user-1", "assignment-1", {
				content: "Bài làm",
			}),
		ValidationError,
	);

	await assert.rejects(
		() =>
			createService({ classOverride: otherClass }).service.submitAssignment(
				"student-user-1",
				"assignment-1",
				{ content: "Bài làm" },
			),
		ForbiddenError,
	);

	await assert.rejects(
		() =>
			createService({ profileOverride: null }).service.listAssignments(
				"student-user-1",
			),
		NotFoundError,
	);
});


// ── Task 4.3: Attachments + Late + Resubmit + Notification ──────────────

test("submitAssignment sets is_late = true when submitted_at > assignment.due_date", async () => {
	// Assignment due_date is 2026-05-20, we simulate submitting after that
	const pastDueAssignment = {
		...assignment,
		due_date: new Date("2024-01-01T00:00:00.000Z"), // already past
	};
	const { service, created } = createService({
		assignmentOverride: pastDueAssignment,
	});

	const result = await service.submitAssignment(
		"student-user-1",
		"assignment-1",
		{ content: "Bài nộp trễ" },
	);

	assert.equal(created.length, 1);
	assert.equal(created[0].is_late, true);
});

test("submitAssignment sets is_late = false when submitted_at <= assignment.due_date", async () => {
	// Assignment due_date is far in the future
	const futureDueAssignment = {
		...assignment,
		due_date: new Date("2099-12-31T23:59:59.000Z"),
	};
	const { service, created } = createService({
		assignmentOverride: futureDueAssignment,
	});

	const result = await service.submitAssignment(
		"student-user-1",
		"assignment-1",
		{ content: "Bài nộp đúng hạn" },
	);

	assert.equal(created.length, 1);
	assert.equal(created[0].is_late, false);
});

test("submitAssignment sets is_late = false when due_date is null", async () => {
	const noDueDateAssignment = {
		...assignment,
		due_date: null,
	};
	const { service, created } = createService({
		assignmentOverride: noDueDateAssignment,
	});

	const result = await service.submitAssignment(
		"student-user-1",
		"assignment-1",
		{ content: "Bài không có hạn" },
	);

	assert.equal(created.length, 1);
	assert.equal(created[0].is_late, false);
});

test("submitAssignment validates attachment_ids ownership and rejects invalid ones", async () => {
	const existingSubmission = {
		id: "submission-1",
		_id: "submission-1",
		assignment_id: "assignment-1",
		student_id: "student-profile-1",
		content: "Bản cũ",
		score: null,
		feedback: null,
		graded_at: null,
		submitted_at: new Date("2026-05-10T10:00:00.000Z"),
		resubmit_count: 0,
		attachments: [
			{
				attachment_id: "att-1",
				file_url: "/uploads/att-1.png",
				file_name: "bai-giai.png",
				mime_type: "image/png",
				size_bytes: 1024,
				uploaded_at: new Date("2026-05-10T09:00:00.000Z"),
			},
		],
	};
	const { service } = createService({ existingSubmission });

	// Try to submit with an attachment_id that doesn't belong to the student
	await assert.rejects(
		() =>
			service.submitAssignment("student-user-1", "assignment-1", {
				content: "Bài mới",
				attachment_ids: ["att-nonexistent"],
			}),
		(err: any) => {
			assert.ok(err instanceof ValidationError);
			assert.ok(err.message.includes("att-nonexistent"));
			return true;
		},
	);
});

test("submitAssignment accepts valid attachment_ids from existing submission", async () => {
	const existingSubmission = {
		id: "submission-1",
		_id: "submission-1",
		assignment_id: "assignment-1",
		student_id: "student-profile-1",
		content: "Bản cũ",
		score: null,
		feedback: null,
		graded_at: null,
		submitted_at: new Date("2026-05-10T10:00:00.000Z"),
		resubmit_count: 0,
		attachments: [
			{
				attachment_id: "att-1",
				file_url: "/uploads/att-1.png",
				file_name: "bai-giai.png",
				mime_type: "image/png",
				size_bytes: 1024,
				uploaded_at: new Date("2026-05-10T09:00:00.000Z"),
			},
			{
				attachment_id: "att-2",
				file_url: "/uploads/att-2.pdf",
				file_name: "bai-giai.pdf",
				mime_type: "application/pdf",
				size_bytes: 2048,
				uploaded_at: new Date("2026-05-10T09:30:00.000Z"),
			},
		],
	};
	const { service, updated } = createService({ existingSubmission });

	const result = await service.submitAssignment(
		"student-user-1",
		"assignment-1",
		{
			content: "Bài mới với attachments",
			attachment_ids: ["att-1", "att-2"],
		},
	);

	assert.equal(updated.length, 1);
	assert.deepEqual(updated[0].payload.attachments, existingSubmission.attachments);
});

test("submitAssignment increments resubmit_count on resubmit", async () => {
	const existingSubmission = {
		id: "submission-1",
		_id: "submission-1",
		assignment_id: "assignment-1",
		student_id: "student-profile-1",
		content: "Bản cũ",
		score: null,
		feedback: null,
		graded_at: null,
		submitted_at: new Date("2026-05-10T10:00:00.000Z"),
		resubmit_count: 2,
		attachments: [],
	};
	const { service, updated } = createService({ existingSubmission });

	await service.submitAssignment("student-user-1", "assignment-1", {
		content: "Bản mới lần 3",
	});

	assert.equal(updated.length, 1);
	assert.equal(updated[0].payload.resubmit_count, 3);
});

test("submitAssignment dispatches assignment_resubmitted notification to teacher on resubmit", async () => {
	const existingSubmission = {
		id: "submission-1",
		_id: "submission-1",
		assignment_id: "assignment-1",
		student_id: "student-profile-1",
		content: "Bản cũ",
		score: null,
		feedback: null,
		graded_at: null,
		submitted_at: new Date("2026-05-10T10:00:00.000Z"),
		resubmit_count: 0,
		attachments: [],
	};
	const { service, notifications } = createService({ existingSubmission });

	await service.submitAssignment("student-user-1", "assignment-1", {
		content: "Bản mới",
	});

	assert.equal(notifications.length, 1);
	assert.equal(notifications[0].type, "assignment_resubmitted");
	assert.equal(notifications[0].recipient.user_id, "teacher-user-1");
	assert.deepEqual(notifications[0].channels, ["in_app"]);
	assert.equal(notifications[0].payload.assignment_id, "assignment-1");
	assert.equal(notifications[0].payload.student_id, "student-profile-1");
	assert.equal(notifications[0].payload.resubmit_count, 1);
});

test("submitAssignment does NOT dispatch notification on first submission (not a resubmit)", async () => {
	const { service, notifications } = createService();

	await service.submitAssignment("student-user-1", "assignment-1", {
		content: "Bài nộp lần đầu",
	});

	assert.equal(notifications.length, 0);
});

test("submitAssignment succeeds even if notification dispatch fails (fail-soft)", async () => {
	const existingSubmission = {
		id: "submission-1",
		_id: "submission-1",
		assignment_id: "assignment-1",
		student_id: "student-profile-1",
		content: "Bản cũ",
		score: null,
		feedback: null,
		graded_at: null,
		submitted_at: new Date("2026-05-10T10:00:00.000Z"),
		resubmit_count: 0,
		attachments: [],
	};
	const failingNotificationService = {
		send: async () => {
			throw new Error("Notification service unavailable");
		},
	};
	const { service, updated } = createService({
		existingSubmission,
		notificationService: failingNotificationService,
	});

	// Should not throw even though notification fails
	const result = await service.submitAssignment(
		"student-user-1",
		"assignment-1",
		{ content: "Bản mới" },
	);

	assert.equal(updated.length, 1);
	assert.equal(updated[0].payload.resubmit_count, 1);
});
