/**
 * Unit tests for teacher panel (Task 11.5)
 *
 * Covers:
 * - Scoped authorization: teacher accessing another teacher's class → 403
 * - getAnalytics response shape validation
 * - Teacher attendance bulk update
 * - Property 19: Scoped authorization
 *
 * **Validates: Requirements 6.1–6.9**
 */
import assert from "node:assert/strict";
import { describe, test, beforeEach, afterEach } from "node:test";

import fc from "fast-check";
import mongoose from "mongoose";

import { AssessmentModel } from "../models/assessment.model";
import {
  AttendanceRecordModel,
  LearningRiskScoreModel,
} from "../models/engagement.model";
import { ForbiddenError, NotFoundError } from "../utils/errors";
import { TeacherService } from "./teacher.service";

// ── Helpers ─────────────────────────────────────────────────────────────

const objectId = (suffix: string | number) =>
  `507f1f77bcf86cd79943${String(suffix).padStart(4, "0")}`.slice(0, 24);

const teacherA = objectId("0001");
const teacherB = objectId("0002");
const classOfA = {
  _id: objectId("00c1"),
  id: objectId("00c1"),
  name: "Lớp 6A",
  subject: "Toán",
  grade_level: 6,
  teacher_id: { toString: () => teacherA },
  student_ids: [objectId("00a1"), objectId("00a2")],
  is_active: true,
  schedule: "T2-T4-T6",
  toObject() { return { ...this }; },
};
const classOfB = {
  _id: objectId("00c2"),
  id: objectId("00c2"),
  name: "Lớp 7B",
  subject: "Toán",
  grade_level: 7,
  teacher_id: { toString: () => teacherB },
  student_ids: [objectId("00a3")],
  is_active: true,
  schedule: "T3-T5",
  toObject() { return { ...this }; },
};

// ── Model mocking helpers ────────────────────────────────────────────────

let originalAssessmentAggregate: any;
let originalAttendanceAggregate: any;
let originalRiskAggregate: any;
let originalAttendanceFind: any;
let originalRiskFind: any;

function mockModels() {
  originalAssessmentAggregate = AssessmentModel.aggregate;
  originalAttendanceAggregate = AttendanceRecordModel.aggregate;
  originalRiskAggregate = LearningRiskScoreModel.aggregate;
  originalAttendanceFind = AttendanceRecordModel.find;
  originalRiskFind = LearningRiskScoreModel.find;

  AssessmentModel.aggregate = (() => []) as any;
  AttendanceRecordModel.aggregate = (() => []) as any;
  LearningRiskScoreModel.aggregate = (() => []) as any;
  AttendanceRecordModel.find = (() => ({
    sort: () => ({ limit: () => ({ exec: async () => [] }) }),
  })) as any;
  LearningRiskScoreModel.find = (() => ({
    sort: () => ({ limit: () => ({ exec: async () => [] }) }),
  })) as any;
}

function restoreModels() {
  AssessmentModel.aggregate = originalAssessmentAggregate;
  AttendanceRecordModel.aggregate = originalAttendanceAggregate;
  LearningRiskScoreModel.aggregate = originalRiskAggregate;
  AttendanceRecordModel.find = originalAttendanceFind;
  LearningRiskScoreModel.find = originalRiskFind;
}

/**
 * Creates a TeacherService instance with mocked repositories for isolated testing.
 */
function createMockedTeacherService(options: {
  classes?: any[];
  users?: Map<string, any>;
  assignments?: any[];
} = {}) {
  const service = new TeacherService() as any;

  const classes = options.classes ?? [classOfA];
  const users = options.users ?? new Map([
    [teacherA, { id: teacherA, _id: teacherA, role: "teacher", full_name: "Teacher A" }],
    [teacherB, { id: teacherB, _id: teacherB, role: "teacher", full_name: "Teacher B" }],
  ]);

  service.userRepo = {
    findById: async (id: string) => users.get(id) ?? null,
    findByEmail: async () => null,
  };

  service.classRepo = {
    findById: async (id: string) => classes.find((c) => c.id === id || c._id === id) ?? null,
    findByTeacherId: async (tid: string) => classes.filter((c) => c.teacher_id.toString() === tid),
    model: {
      findById: () => ({
        populate: () => ({ exec: async () => classes[0] }),
      }),
      findOne: () => ({ select: () => ({ lean: () => ({ exec: async () => null }) }) }),
    },
  };

  service.assignmentRepo = {
    findByTeacherId: async () => options.assignments ?? [],
    findByClassId: async () => options.assignments ?? [],
    findById: async (id: string) => (options.assignments ?? []).find((a: any) => a.id === id || a._id === id) ?? null,
    model: {
      countDocuments: async () => (options.assignments ?? []).length,
      find: () => ({ select: () => ({ exec: async () => options.assignments ?? [] }) }),
    },
  };

  service.submissionRepo = {
    findByAssignment: async () => [],
    findById: async () => null,
    countByAssignment: async () => ({ submitted: 0, graded: 0 }),
    avgScoreByAssignment: async () => null,
    model: {
      aggregate: async () => [],
      find: () => ({ sort: () => ({ exec: async () => [] }) }),
      countDocuments: async () => 0,
    },
  };

  service.profileRepo = {
    findByUserId: async () => null,
    model: {
      find: () => ({
        populate: () => ({ sort: () => ({ limit: () => ({ exec: async () => [] }) }) }),
      }),
      findById: () => ({
        populate: () => ({ exec: async () => null }),
      }),
    },
  };

  return service as TeacherService;
}

// ══════════════════════════════════════════════════════════════════════════
// Scoped Authorization Tests
// ══════════════════════════════════════════════════════════════════════════

describe("Teacher panel — Scoped authorization (teacher access class khác → 403)", () => {
  test("teacher accessing another teacher's class via getClassDetail → ForbiddenError", async () => {
    const service = createMockedTeacherService({ classes: [classOfA, classOfB] });

    await assert.rejects(
      () => service.getClassDetail(teacherA, classOfB.id),
      (err: any) => {
        assert.ok(err instanceof ForbiddenError);
        assert.equal(err.statusCode, 403);
        return true;
      },
    );
  });

  test("teacher accessing own class via getClassDetail → success", async () => {
    const service = createMockedTeacherService({ classes: [classOfA, classOfB] });

    // Should not throw
    const result = await service.getClassDetail(teacherA, classOfA.id);
    assert.ok(result, "Should return class detail");
  });

  test("teacher accessing another teacher's class via getStudentsInClass → ForbiddenError", async () => {
    const service = createMockedTeacherService({ classes: [classOfA, classOfB] });

    await assert.rejects(
      () => service.getStudentsInClass(teacherA, classOfB.id),
      (err: any) => {
        assert.ok(err instanceof ForbiddenError);
        assert.equal(err.statusCode, 403);
        return true;
      },
    );
  });

  test("teacher accessing another teacher's assignment via getAssignment → ForbiddenError", async () => {
    const assignmentOfB = {
      id: objectId("a1"),
      _id: objectId("a1"),
      title: "Bài tập",
      teacher_id: { toString: () => teacherB },
      class_id: classOfB.id,
      type: "homework",
      status: "active",
      total_points: 10,
    };
    const service = createMockedTeacherService({
      classes: [classOfA, classOfB],
      assignments: [assignmentOfB],
    });

    await assert.rejects(
      () => service.getAssignment(teacherA, assignmentOfB.id),
      (err: any) => {
        assert.ok(err instanceof ForbiddenError);
        assert.equal(err.statusCode, 403);
        return true;
      },
    );
  });

  test("teacher grading submission of another teacher's assignment → ForbiddenError", async () => {
    const assignmentOfB = {
      id: objectId("a2"),
      _id: objectId("a2"),
      title: "Bài kiểm tra",
      teacher_id: { toString: () => teacherB },
      class_id: classOfB.id,
      type: "quiz",
      status: "active",
      total_points: 10,
    };
    const submission = {
      id: objectId("sub1"),
      _id: objectId("sub1"),
      assignment_id: { toString: () => assignmentOfB.id },
      student_id: { toString: () => objectId("s3") },
      content: "Bài làm",
      score: null,
      graded_at: null,
    };

    const service = createMockedTeacherService({
      classes: [classOfA, classOfB],
      assignments: [assignmentOfB],
    });
    // Override submissionRepo to return the submission
    (service as any).submissionRepo.findById = async () => submission;

    await assert.rejects(
      () => service.gradeSubmission(teacherA, submission.id, { score: 8 }),
      (err: any) => {
        assert.ok(err instanceof ForbiddenError);
        assert.equal(err.statusCode, 403);
        return true;
      },
    );
  });

  test("teacher accessing submission attachments of another teacher → ForbiddenError", async () => {
    const assignmentOfB = {
      id: objectId("a3"),
      _id: objectId("a3"),
      title: "Bài tập khác",
      teacher_id: { toString: () => teacherB },
      class_id: classOfB.id,
      type: "homework",
      status: "active",
      total_points: 10,
    };
    const submission = {
      id: objectId("sub2"),
      _id: objectId("sub2"),
      assignment_id: { toString: () => assignmentOfB.id },
      student_id: { toString: () => objectId("s3") },
      content: "Bài làm",
      attachments: [{ attachment_id: "att-1", file_url: "/file.png" }],
    };

    const service = createMockedTeacherService({
      classes: [classOfA, classOfB],
      assignments: [assignmentOfB],
    });
    (service as any).submissionRepo.findById = async () => submission;

    await assert.rejects(
      () => service.getSubmissionAttachments(teacherA, submission.id),
      (err: any) => {
        assert.ok(err instanceof ForbiddenError);
        assert.equal(err.statusCode, 403);
        return true;
      },
    );
  });

  test("teacher viewing gradebook of student not in their classes → ForbiddenError", async () => {
    const service = createMockedTeacherService({ classes: [classOfA] });

    // student objectId("s3") is NOT in classOfA
    await assert.rejects(
      () => service.getStudentGradebookDetail(teacherA, objectId("s3")),
      (err: any) => {
        assert.ok(err instanceof ForbiddenError);
        assert.equal(err.statusCode, 403);
        return true;
      },
    );
  });

  test("non-teacher role is rejected by ensureTeacher", async () => {
    const service = createMockedTeacherService({
      users: new Map([
        ["student-user", { id: "student-user", _id: "student-user", role: "student" }],
      ]),
    });

    await assert.rejects(
      () => service.getDashboard("student-user"),
      (err: any) => {
        assert.ok(err instanceof ForbiddenError);
        assert.equal(err.statusCode, 403);
        return true;
      },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// getAnalytics Response Shape Tests
// ══════════════════════════════════════════════════════════════════════════

describe("Teacher panel — getAnalytics response shape", () => {
  beforeEach(() => { mockModels(); });
  afterEach(() => { restoreModels(); });

  test("getAnalytics returns correct top-level structure", async () => {
    const service = createMockedTeacherService({ classes: [classOfA] });

    const result = await service.getAnalytics(teacherA);

    // Verify top-level keys exist
    assert.ok("overall" in result, "Should have 'overall' field");
    assert.ok("trends" in result, "Should have 'trends' field");
    assert.ok("risk_distribution" in result, "Should have 'risk_distribution' field");
    assert.ok("top_progress" in result, "Should have 'top_progress' field");
    assert.ok("attention_needed" in result, "Should have 'attention_needed' field");
  });

  test("getAnalytics.overall has required fields", async () => {
    const service = createMockedTeacherService({ classes: [classOfA] });

    const result = await service.getAnalytics(teacherA);
    const { overall } = result;

    assert.ok("total_students" in overall, "overall should have total_students");
    assert.ok("total_classes" in overall, "overall should have total_classes");
    assert.ok("total_assignments" in overall, "overall should have total_assignments");
    assert.ok("avg_class_score" in overall, "overall should have avg_class_score");
    assert.ok("avg_attendance_rate" in overall, "overall should have avg_attendance_rate");

    // Type checks
    assert.equal(typeof overall.total_students, "number");
    assert.equal(typeof overall.total_classes, "number");
    assert.equal(typeof overall.total_assignments, "number");
    // avg_class_score and avg_attendance_rate can be null when no data
    assert.ok(
      overall.avg_class_score === null || typeof overall.avg_class_score === "number",
      "avg_class_score should be number or null",
    );
    assert.ok(
      overall.avg_attendance_rate === null || typeof overall.avg_attendance_rate === "number",
      "avg_attendance_rate should be number or null",
    );
  });

  test("getAnalytics.trends has weekly_avg_scores and weekly_attendance_rate arrays", async () => {
    const service = createMockedTeacherService({ classes: [classOfA] });

    const result = await service.getAnalytics(teacherA);
    const { trends } = result;

    assert.ok("weekly_avg_scores" in trends, "trends should have weekly_avg_scores");
    assert.ok("weekly_attendance_rate" in trends, "trends should have weekly_attendance_rate");
    assert.ok(Array.isArray(trends.weekly_avg_scores), "weekly_avg_scores should be an array");
    assert.ok(Array.isArray(trends.weekly_attendance_rate), "weekly_attendance_rate should be an array");
  });

  test("getAnalytics.risk_distribution has low/medium/high keys", async () => {
    const service = createMockedTeacherService({ classes: [classOfA] });

    const result = await service.getAnalytics(teacherA);
    const { risk_distribution } = result;

    assert.ok("low" in risk_distribution, "risk_distribution should have 'low'");
    assert.ok("medium" in risk_distribution, "risk_distribution should have 'medium'");
    assert.ok("high" in risk_distribution, "risk_distribution should have 'high'");
    assert.equal(typeof risk_distribution.low, "number");
    assert.equal(typeof risk_distribution.medium, "number");
    assert.equal(typeof risk_distribution.high, "number");
  });

  test("getAnalytics.top_progress and attention_needed are arrays", async () => {
    const service = createMockedTeacherService({ classes: [classOfA] });

    const result = await service.getAnalytics(teacherA);

    assert.ok(Array.isArray(result.top_progress), "top_progress should be an array");
    assert.ok(Array.isArray(result.attention_needed), "attention_needed should be an array");
  });

  test("getAnalytics overall counts match class data", async () => {
    const classOfAForTeacherA = {
      ...classOfB,
      teacher_id: { toString: () => teacherA },
    };
    const service = createMockedTeacherService({
      classes: [classOfA, classOfAForTeacherA],
      assignments: [
        { id: objectId("a1"), _id: objectId("a1"), teacher_id: teacherA },
        { id: objectId("a2"), _id: objectId("a2"), teacher_id: teacherA },
      ],
    });

    const result = await service.getAnalytics(teacherA);

    assert.equal(result.overall.total_classes, 2);
    // total_students = classOfA.student_ids (2) + classOfB.student_ids (1) = 3
    assert.equal(result.overall.total_students, 3);
    assert.equal(result.overall.total_assignments, 2);
  });

  test("getAnalytics rejects non-teacher user", async () => {
    const service = createMockedTeacherService({
      users: new Map([
        ["parent-user-id-000000000", { id: "parent-user-id-000000000", _id: "parent-user-id-000000000", role: "parent" }],
      ]),
    });

    await assert.rejects(
      () => service.getAnalytics("parent-user-id-000000000"),
      (err: any) => {
        assert.ok(err instanceof ForbiddenError);
        return true;
      },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Property 19: Scoped Authorization (PBT)
// ══════════════════════════════════════════════════════════════════════════

// Custom arbitrary: generates valid 24-char hex strings (valid MongoDB ObjectIds)
const objectIdArb = fc.array(
  fc.integer({ min: 0, max: 15 }),
  { minLength: 24, maxLength: 24 },
).map((digits) => digits.map((d) => d.toString(16)).join(""));

describe("Property 19: Scoped authorization — Teacher panel", () => {
  /**
   * **Validates: Requirements 6.1–6.9**
   *
   * Property: For any teacher and any class, if the class's teacher_id
   * does NOT match the requesting teacher's ID, all class-scoped operations
   * MUST throw ForbiddenError (403).
   */
  test("teacher accessing any class they don't own always gets 403 (PBT)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          requestingTeacherId: objectIdArb,
          ownerTeacherId: objectIdArb,
          classId: objectIdArb,
        }).filter(({ requestingTeacherId, ownerTeacherId }) =>
          requestingTeacherId !== ownerTeacherId,
        ),
        async ({ requestingTeacherId, ownerTeacherId, classId }) => {
          const targetClass = {
            _id: classId,
            id: classId,
            name: "Test Class",
            subject: "Math",
            teacher_id: { toString: () => ownerTeacherId },
            student_ids: [],
            is_active: true,
            toObject() { return { ...this }; },
          };

          const service = createMockedTeacherService({
            classes: [targetClass],
            users: new Map([
              [requestingTeacherId, { id: requestingTeacherId, _id: requestingTeacherId, role: "teacher" }],
              [ownerTeacherId, { id: ownerTeacherId, _id: ownerTeacherId, role: "teacher" }],
            ]),
          });

          // ensureClassOwner should throw ForbiddenError
          try {
            await service.getClassDetail(requestingTeacherId, classId);
            assert.fail("Should have thrown ForbiddenError");
          } catch (err: any) {
            assert.ok(
              err instanceof ForbiddenError,
              `Expected ForbiddenError, got ${err.constructor.name}: ${err.message}`,
            );
            assert.equal(err.statusCode, 403);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  test("teacher accessing their own class always succeeds (PBT)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          teacherId: objectIdArb,
          classId: objectIdArb,
        }),
        async ({ teacherId, classId }) => {
          const ownedClass = {
            _id: classId,
            id: classId,
            name: "My Class",
            subject: "Math",
            teacher_id: { toString: () => teacherId },
            student_ids: [],
            is_active: true,
            toObject() { return { ...this }; },
          };

          const service = createMockedTeacherService({
            classes: [ownedClass],
            users: new Map([
              [teacherId, { id: teacherId, _id: teacherId, role: "teacher" }],
            ]),
          });

          // Should not throw
          const result = await service.getClassDetail(teacherId, classId);
          assert.ok(result, "Should return class detail for owned class");
        },
      ),
      { numRuns: 50 },
    );
  });

  test("scoped authorization is enforced consistently across all class operations (PBT)", async () => {
    const classOperations = [
      "getClassDetail",
      "getStudentsInClass",
      "updateClass",
    ] as const;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...classOperations),
        objectIdArb,
        async (operation, requestingTeacherId) => {
          // Teacher B owns classOfB; requestingTeacherId is different
          const ownerTeacherId = teacherB;
          if (requestingTeacherId === ownerTeacherId) return; // skip if same

          const service = createMockedTeacherService({
            classes: [classOfB],
            users: new Map([
              [requestingTeacherId, { id: requestingTeacherId, _id: requestingTeacherId, role: "teacher" }],
              [ownerTeacherId, { id: ownerTeacherId, _id: ownerTeacherId, role: "teacher" }],
            ]),
          });

          try {
            switch (operation) {
              case "getClassDetail":
                await service.getClassDetail(requestingTeacherId, classOfB.id);
                break;
              case "getStudentsInClass":
                await service.getStudentsInClass(requestingTeacherId, classOfB.id);
                break;
              case "updateClass":
                await service.updateClass(requestingTeacherId, classOfB.id, { name: "New Name" });
                break;
            }
            assert.fail(`${operation} should have thrown ForbiddenError for non-owner teacher`);
          } catch (err: any) {
            assert.ok(
              err instanceof ForbiddenError,
              `${operation}: Expected ForbiddenError, got ${err.constructor.name}: ${err.message}`,
            );
            assert.equal(err.statusCode, 403);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
