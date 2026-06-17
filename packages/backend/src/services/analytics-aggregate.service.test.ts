import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { AnalyticsAggregateService } from "./analytics-aggregate.service";

// ── Helpers ─────────────────────────────────────────────────────────────

function objectId(hex?: string): mongoose.Types.ObjectId {
  return hex
    ? new mongoose.Types.ObjectId(hex)
    : new mongoose.Types.ObjectId();
}

/**
 * Build a chainable query mock that supports .select().lean() and .session()
 */
function buildQueryChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.lean = () => chain;
  chain.session = () => chain;
  chain.exec = () => Promise.resolve(result);
  // Make it thenable so await works directly
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

/**
 * Create a mock model with find/aggregate/countDocuments support.
 */
function createMockModel(options: {
  findResults?: Record<string, unknown[]>;
  aggregateResults?: unknown[][];
  countResults?: number[];
}) {
  let aggregateCallIndex = 0;
  let countCallIndex = 0;

  const model = {
    find: mock.fn((_filter?: unknown) => {
      // Return the first matching result set or empty
      return buildQueryChain(options.findResults?.default ?? []);
    }),
    aggregate: mock.fn((_pipeline?: unknown[]) => {
      const result = options.aggregateResults?.[aggregateCallIndex] ?? [];
      aggregateCallIndex++;
      return Promise.resolve(result);
    }),
    countDocuments: mock.fn((_filter?: unknown) => {
      const result = options.countResults?.[countCallIndex] ?? 0;
      countCallIndex++;
      return Promise.resolve(result);
    }),
  };

  return model as unknown as typeof mongoose.Model;
}

// ── Mock the repo singletons ────────────────────────────────────────────

// We need to mock the repo modules that the service imports.
// Since the service calls repo methods directly (analyticsDailyUserActivityRepo.upsertDaily etc.),
// we'll mock those at the module level using node:test mock.module isn't available,
// so we'll intercept by mocking the imported repos.

// Instead, we'll use a different approach: spy on the repo methods after import.
import { analyticsDailyUserActivityRepo } from "../models/analytics-daily-user-activity.model";
import { analyticsDailyRevenueRepo } from "../models/analytics-daily-revenue.model";
import { analyticsCohortRetentionRepo } from "../models/analytics-cohort-retention.model";
import { analyticsLessonEngagementRepo } from "../models/analytics-lesson-engagement.model";

// ── Tests ───────────────────────────────────────────────────────────────

describe("AnalyticsAggregateService", () => {
  const TEST_DATE = "2024-06-15";
  const TEST_COHORT_WEEK = "2024-W24";

  let service: AnalyticsAggregateService;

  // Student IDs
  const student1 = objectId("aaaaaaaaaaaaaaaaaaaaaaaa");
  const student2 = objectId("bbbbbbbbbbbbbbbbbbbbbbbb");
  const student3 = objectId("cccccccccccccccccccccccc");

  // Lesson IDs
  const lesson1 = objectId("dddddddddddddddddddddddd");
  const lesson2 = objectId("eeeeeeeeeeeeeeeeeeeeeeee");

  // Mock repos
  let upsertDailyActivityMock: ReturnType<typeof mock.fn>;
  let upsertDailyRevenueMock: ReturnType<typeof mock.fn>;
  let upsertCohortMock: ReturnType<typeof mock.fn>;
  let upsertLessonEngagementMock: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    // Reset repo mocks
    upsertDailyActivityMock = mock.fn(async () => ({}));
    upsertDailyRevenueMock = mock.fn(async () => ({}));
    upsertCohortMock = mock.fn(async () => ({}));
    upsertLessonEngagementMock = mock.fn(async () => ({}));

    // Patch the singleton repos
    (analyticsDailyUserActivityRepo as any).upsertDaily = upsertDailyActivityMock;
    (analyticsDailyRevenueRepo as any).upsertDaily = upsertDailyRevenueMock;
    (analyticsCohortRetentionRepo as any).upsertCohort = upsertCohortMock;
    (analyticsLessonEngagementRepo as any).upsertDaily = upsertLessonEngagementMock;
  });

  describe("refreshDailyUserActivity", () => {
    it("should compute correct counts per role — students with sessions", async () => {
      // Mock UserModel: 3 students, 1 created today
      const mockUserModel = {
        find: mock.fn((_filter?: any) => {
          const filter = _filter as { role: string; is_active: boolean };
          if (filter.role === "student") {
            return buildQueryChain([
              { _id: student1, createdAt: new Date("2024-05-01T00:00:00Z") },
              { _id: student2, createdAt: new Date("2024-06-15T02:00:00Z") }, // created today (ICT)
              { _id: student3, createdAt: new Date("2024-04-10T00:00:00Z") },
            ]);
          }
          // Other roles: empty
          return buildQueryChain([]);
        }),
      };

      // Mock EngagementSessionModel: student1 and student3 had sessions today
      const mockEngagementModel = {
        aggregate: mock.fn(async (_pipeline?: unknown[]) => {
          return [{ _id: student1 }, { _id: student3 }];
        }),
      };

      service = new AnalyticsAggregateService({
        userModel: mockUserModel as any,
        engagementSessionModel: mockEngagementModel as any,
        billingTransactionModel: createMockModel({}) as any,
        subscriptionModel: createMockModel({}) as any,
      });

      await service.refreshDailyUserActivity(TEST_DATE);

      // Should have called upsertDaily for student role
      const studentCall = upsertDailyActivityMock.mock.calls.find(
        (c: any) => c.arguments[1] === "student",
      );
      assert.ok(studentCall, "upsertDaily called for student role");
      const data = studentCall.arguments[2] as any;
      assert.equal(data.active_users, 2, "2 students had sessions");
      assert.equal(data.new_users, 1, "1 student created today");
      assert.equal(data.returning_users, 2, "2 returning users (student1 & student3 active but not new)");
    });

    it("should compute correct counts for non-student roles", async () => {
      const mockUserModel = {
        find: mock.fn((_filter?: any) => {
          const filter = _filter as { role: string; is_active: boolean };
          if (filter.role === "teacher") {
            return buildQueryChain([
              { _id: objectId(), createdAt: new Date("2024-01-01T00:00:00Z") },
              { _id: objectId(), createdAt: new Date("2024-06-15T05:00:00Z") }, // created today ICT
              { _id: objectId(), createdAt: new Date("2024-03-01T00:00:00Z") },
            ]);
          }
          return buildQueryChain([]);
        }),
      };

      service = new AnalyticsAggregateService({
        userModel: mockUserModel as any,
        engagementSessionModel: createMockModel({}) as any,
        billingTransactionModel: createMockModel({}) as any,
        subscriptionModel: createMockModel({}) as any,
      });

      await service.refreshDailyUserActivity(TEST_DATE);

      // For teacher role: active_users = total (3), new_users = 1, returning = 2
      const teacherCall = upsertDailyActivityMock.mock.calls.find(
        (c: any) => c.arguments[1] === "teacher",
      );
      assert.ok(teacherCall, "upsertDaily called for teacher role");
      const data = teacherCall.arguments[2] as any;
      assert.equal(data.active_users, 3, "all active teachers counted");
      assert.equal(data.new_users, 1, "1 teacher created today");
      assert.equal(data.returning_users, 2, "returning = active - new");
    });

    it("should handle roles with zero users", async () => {
      const mockUserModel = {
        find: mock.fn(() => buildQueryChain([])),
      };

      service = new AnalyticsAggregateService({
        userModel: mockUserModel as any,
        engagementSessionModel: createMockModel({}) as any,
        billingTransactionModel: createMockModel({}) as any,
        subscriptionModel: createMockModel({}) as any,
      });

      await service.refreshDailyUserActivity(TEST_DATE);

      // All 5 roles should get upserted with zeros
      assert.equal(upsertDailyActivityMock.mock.calls.length, 5, "5 roles upserted");
      for (const call of upsertDailyActivityMock.mock.calls) {
        const data = call.arguments[2] as any;
        assert.equal(data.active_users, 0);
        assert.equal(data.new_users, 0);
        assert.equal(data.returning_users, 0);
      }
    });
  });

  describe("refreshDailyRevenue", () => {
    it("should correctly aggregate billing transactions", async () => {
      // Mock BillingTransactionModel: aggregate returns revenue and refunds
      let aggregateCallIdx = 0;
      const mockBillingModel = {
        aggregate: mock.fn(async (_pipeline?: unknown[]) => {
          aggregateCallIdx++;
          if (aggregateCallIdx === 1) {
            // payment_received aggregate
            return [{ _id: null, total: 500000 }];
          }
          if (aggregateCallIdx === 2) {
            // refund aggregate
            return [{ _id: null, total: -50000 }]; // negative stored, Math.abs applied
          }
          return [];
        }),
      };

      // Mock SubscriptionModel
      let countCallIdx = 0;
      const mockSubscriptionModel = {
        countDocuments: mock.fn(async (_filter?: unknown) => {
          countCallIdx++;
          if (countCallIdx === 1) return 3; // new_subs
          if (countCallIdx === 2) return 1; // churned_subs
          return 0;
        }),
      };

      service = new AnalyticsAggregateService({
        userModel: createMockModel({}) as any,
        engagementSessionModel: createMockModel({}) as any,
        billingTransactionModel: mockBillingModel as any,
        subscriptionModel: mockSubscriptionModel as any,
      });

      await service.refreshDailyRevenue(TEST_DATE);

      assert.equal(upsertDailyRevenueMock.mock.calls.length, 1);
      const data = upsertDailyRevenueMock.mock.calls[0].arguments[1] as any;
      assert.equal(data.gross_revenue_vnd, 500000, "gross revenue from payment_received");
      assert.equal(data.refunds_vnd, 50000, "refunds absolute value");
      assert.equal(data.mrr_vnd, 450000, "mrr = gross - refunds");
      assert.equal(data.new_subs, 3, "3 new subscriptions");
      assert.equal(data.churned_subs, 1, "1 churned subscription");
    });

    it("should handle zero transactions gracefully", async () => {
      const mockBillingModel = {
        aggregate: mock.fn(async () => []),
      };
      const mockSubscriptionModel = {
        countDocuments: mock.fn(async () => 0),
      };

      service = new AnalyticsAggregateService({
        userModel: createMockModel({}) as any,
        engagementSessionModel: createMockModel({}) as any,
        billingTransactionModel: mockBillingModel as any,
        subscriptionModel: mockSubscriptionModel as any,
      });

      await service.refreshDailyRevenue(TEST_DATE);

      assert.equal(upsertDailyRevenueMock.mock.calls.length, 1);
      const data = upsertDailyRevenueMock.mock.calls[0].arguments[1] as any;
      assert.equal(data.gross_revenue_vnd, 0);
      assert.equal(data.refunds_vnd, 0);
      assert.equal(data.mrr_vnd, 0);
      assert.equal(data.new_subs, 0);
      assert.equal(data.churned_subs, 0);
    });
  });

  describe("refreshCohortRetention", () => {
    it("should compute correct retention for a cohort", async () => {
      // Cohort week 2024-W24 starts Monday 2024-06-10
      const cohortStart = new Date("2024-06-10T00:00:00Z");

      const mockUserModel = {
        find: mock.fn(() =>
          buildQueryChain([
            { _id: student1 },
            { _id: student2 },
            { _id: student3 },
          ]),
        ),
      };

      // Mock engagement: week 0 all 3 retained, week 1 only 2
      let aggCallIdx = 0;
      const mockEngagementModel = {
        aggregate: mock.fn(async (_pipeline?: unknown[]) => {
          aggCallIdx++;
          // We need to figure out which week offset this is for
          // The service iterates from offset 0 to maxOffset
          if (aggCallIdx === 1) return [{ retained: 3 }]; // week 0: all 3
          if (aggCallIdx === 2) return [{ retained: 2 }]; // week 1: 2 retained
          return []; // subsequent weeks: 0
        }),
      };

      // Freeze "now" to be 2 weeks after cohort start
      const originalDateNow = Date.now;
      const fakeNow = new Date("2024-06-24T12:00:00Z").getTime();
      Date.now = () => fakeNow;
      // Also need to override new Date() — but the service uses `new Date()` directly
      // We'll work around by accepting the test may compute more offsets

      service = new AnalyticsAggregateService({
        userModel: mockUserModel as any,
        engagementSessionModel: mockEngagementModel as any,
        billingTransactionModel: createMockModel({}) as any,
        subscriptionModel: createMockModel({}) as any,
      });

      await service.refreshCohortRetention(TEST_COHORT_WEEK);

      // Restore
      Date.now = originalDateNow;

      // Should have called upsertCohort at least for offset 0 and 1
      assert.ok(upsertCohortMock.mock.calls.length >= 2, "at least 2 offsets computed");

      // Check offset 0
      const offset0Call = upsertCohortMock.mock.calls[0];
      assert.equal(offset0Call.arguments[0], TEST_COHORT_WEEK);
      assert.equal(offset0Call.arguments[1], 0, "week_offset = 0");
      assert.equal(offset0Call.arguments[2], 3, "3 retained in week 0");

      // Check offset 1
      const offset1Call = upsertCohortMock.mock.calls[1];
      assert.equal(offset1Call.arguments[1], 1, "week_offset = 1");
      assert.equal(offset1Call.arguments[2], 2, "2 retained in week 1");
    });

    it("should handle empty cohort (no users signed up that week)", async () => {
      const mockUserModel = {
        find: mock.fn(() => buildQueryChain([])),
      };

      service = new AnalyticsAggregateService({
        userModel: mockUserModel as any,
        engagementSessionModel: createMockModel({}) as any,
        billingTransactionModel: createMockModel({}) as any,
        subscriptionModel: createMockModel({}) as any,
      });

      await service.refreshCohortRetention(TEST_COHORT_WEEK);

      // Should upsert offset 0 with 0 retained
      assert.equal(upsertCohortMock.mock.calls.length, 1);
      assert.equal(upsertCohortMock.mock.calls[0].arguments[1], 0);
      assert.equal(upsertCohortMock.mock.calls[0].arguments[2], 0);
    });
  });

  describe("refreshLessonEngagement", () => {
    it("should correctly aggregate engagement per lesson", async () => {
      const mockEngagementModel = {
        aggregate: mock.fn(async (_pipeline?: unknown[]) => {
          return [
            {
              _id: lesson1,
              student_count: 5,
              avg_active_minutes: 25.678,
              avg_focus_ratio: 0.8234,
            },
            {
              _id: lesson2,
              student_count: 3,
              avg_active_minutes: 15.123,
              avg_focus_ratio: 0.7567,
            },
          ];
        }),
      };

      service = new AnalyticsAggregateService({
        userModel: createMockModel({}) as any,
        engagementSessionModel: mockEngagementModel as any,
        billingTransactionModel: createMockModel({}) as any,
        subscriptionModel: createMockModel({}) as any,
      });

      await service.refreshLessonEngagement(TEST_DATE);

      assert.equal(upsertLessonEngagementMock.mock.calls.length, 2, "2 lessons upserted");

      // Lesson 1
      const call1 = upsertLessonEngagementMock.mock.calls[0];
      assert.equal(call1.arguments[0], TEST_DATE);
      assert.equal(call1.arguments[1], lesson1.toString());
      assert.equal((call1.arguments[2] as any).student_count, 5);
      assert.equal((call1.arguments[2] as any).avg_active_minutes, 25.68); // rounded to 2 decimals
      assert.equal((call1.arguments[2] as any).avg_focus_ratio, 0.823); // rounded to 3 decimals

      // Lesson 2
      const call2 = upsertLessonEngagementMock.mock.calls[1];
      assert.equal(call2.arguments[1], lesson2.toString());
      assert.equal((call2.arguments[2] as any).student_count, 3);
      assert.equal((call2.arguments[2] as any).avg_active_minutes, 15.12);
      assert.equal((call2.arguments[2] as any).avg_focus_ratio, 0.757);
    });

    it("should handle no engagement sessions for the date", async () => {
      const mockEngagementModel = {
        aggregate: mock.fn(async () => []),
      };

      service = new AnalyticsAggregateService({
        userModel: createMockModel({}) as any,
        engagementSessionModel: mockEngagementModel as any,
        billingTransactionModel: createMockModel({}) as any,
        subscriptionModel: createMockModel({}) as any,
      });

      await service.refreshLessonEngagement(TEST_DATE);

      assert.equal(upsertLessonEngagementMock.mock.calls.length, 0, "no lessons to upsert");
    });
  });

  describe("refreshAll", () => {
    it("should call all 4 refresh methods", async () => {
      const mockUserModel = {
        find: mock.fn(() => buildQueryChain([])),
      };
      const mockEngagementModel = {
        aggregate: mock.fn(async () => []),
      };
      const mockBillingModel = {
        aggregate: mock.fn(async () => []),
      };
      const mockSubscriptionModel = {
        countDocuments: mock.fn(async () => 0),
      };

      service = new AnalyticsAggregateService({
        userModel: mockUserModel as any,
        engagementSessionModel: mockEngagementModel as any,
        billingTransactionModel: mockBillingModel as any,
        subscriptionModel: mockSubscriptionModel as any,
      });

      await service.refreshAll(TEST_DATE);

      // refreshDailyUserActivity: 5 roles upserted
      assert.ok(
        upsertDailyActivityMock.mock.calls.length === 5,
        "refreshDailyUserActivity called (5 roles)",
      );

      // refreshDailyRevenue: 1 call
      assert.ok(
        upsertDailyRevenueMock.mock.calls.length === 1,
        "refreshDailyRevenue called",
      );

      // refreshLessonEngagement: aggregate called (may be 0 upserts if no data)
      assert.ok(
        mockEngagementModel.aggregate.mock.calls.length >= 1,
        "engagement aggregate called",
      );

      // refreshCohortRetention: at least 1 upsert (empty cohort → offset 0)
      // UserModel.find is called for cohort retention too
      assert.ok(
        upsertCohortMock.mock.calls.length >= 1,
        "refreshCohortRetention called",
      );
    });
  });

  describe("idempotency", () => {
    it("running twice produces same state — upsert semantics", async () => {
      const mockUserModel = {
        find: mock.fn((_filter?: any) => {
          const filter = _filter as { role: string };
          if (filter.role === "student") {
            return buildQueryChain([
              { _id: student1, createdAt: new Date("2024-05-01T00:00:00Z") },
            ]);
          }
          return buildQueryChain([]);
        }),
      };

      const mockEngagementModel = {
        aggregate: mock.fn(async (_pipeline?: unknown[]) => {
          // For refreshDailyUserActivity student sessions
          const pipeline = _pipeline as any[];
          if (pipeline?.[0]?.$match?.student_id) {
            return [{ _id: student1 }];
          }
          // For refreshLessonEngagement
          if (pipeline?.[0]?.$match?.lesson_id) {
            return [
              { _id: lesson1, student_count: 2, avg_active_minutes: 10.0, avg_focus_ratio: 0.8 },
            ];
          }
          return [];
        }),
      };

      let billingAggIdx = 0;
      const mockBillingModel = {
        aggregate: mock.fn(async () => {
          billingAggIdx++;
          if (billingAggIdx === 1 || billingAggIdx === 3) return [{ _id: null, total: 100000 }];
          return [];
        }),
      };

      const mockSubscriptionModel = {
        countDocuments: mock.fn(async () => 1),
      };

      service = new AnalyticsAggregateService({
        userModel: mockUserModel as any,
        engagementSessionModel: mockEngagementModel as any,
        billingTransactionModel: mockBillingModel as any,
        subscriptionModel: mockSubscriptionModel as any,
      });

      // Run once
      await service.refreshDailyUserActivity(TEST_DATE);
      const firstRunCalls = upsertDailyActivityMock.mock.calls.length;
      const firstStudentCall = upsertDailyActivityMock.mock.calls.find(
        (c: any) => c.arguments[1] === "student",
      );

      // Reset mock call tracking but keep same behavior
      upsertDailyActivityMock.mock.resetCalls();

      // Run again — same inputs should produce same upsert calls
      await service.refreshDailyUserActivity(TEST_DATE);
      const secondRunCalls = upsertDailyActivityMock.mock.calls.length;
      const secondStudentCall = upsertDailyActivityMock.mock.calls.find(
        (c: any) => c.arguments[1] === "student",
      );

      assert.equal(firstRunCalls, secondRunCalls, "same number of upsert calls");
      assert.deepEqual(
        firstStudentCall?.arguments[2],
        secondStudentCall?.arguments[2],
        "same data upserted for student role",
      );
    });
  });
});
