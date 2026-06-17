import assert from "node:assert/strict";
import { test } from "node:test";

import {
	type ParentWeeklyReportSchedulerDeps,
	ParentWeeklyReportSchedulerService,
} from "./parent-weekly-report-scheduler.service";

function createDeps(
	overrides: Partial<ParentWeeklyReportSchedulerDeps> = {},
): ParentWeeklyReportSchedulerDeps {
	return {
		listActiveParents: async () => [
			{ id: "parent-1", email: "p1@example.com", full_name: "Parent One" },
			{ id: "parent-2", email: "p2@example.com", full_name: "Parent Two" },
		],
		getNotificationPreference: async () => null,
		buildWeeklyReport: async (parentUserId: string) => ({
			generated_at: "2026-05-12T00:00:00.000Z",
			range_days: 7,
			totals: {
				students: 1,
				sessions: parentUserId === "parent-1" ? 4 : 2,
				active_minutes: parentUserId === "parent-1" ? 120 : 60,
				alerts: 0,
			},
			students: [
				{
					student_id: `${parentUserId}-student`,
					student_name: "Student",
					grade_level: 6,
					sessions: 4,
					active_minutes: 120,
					attendance_rate: 100,
					avg_quiz_score: 80,
					risk_level: "low",
					alerts: 0,
					intervention_suggestions: [],
				},
			],
			follow_up_actions: [],
		}),
		hasExistingDelivery: async () => false,
		deliverWeeklyReport: async () => true,
		logger: {
			log: () => undefined,
			warn: () => undefined,
			error: () => undefined,
		},
		...overrides,
	};
}

test("weekly parent report scheduler skips parents opted out of weekly summaries", async () => {
	const delivered: string[] = [];
	const service = new ParentWeeklyReportSchedulerService(
		createDeps({
			getNotificationPreference: async (parentUserId) =>
				parentUserId === "parent-1"
					? ({ notify_weekly_summary: false } as any)
					: ({ notify_weekly_summary: true } as any),
			deliverWeeklyReport: async ({ parent }) => {
				delivered.push(parent.id);
				return true;
			},
		}),
	);

	const summary = await service.run({ periodKey: "2026-W20" });

	assert.deepEqual(delivered, ["parent-2"]);
	assert.equal(summary.scanned, 2);
	assert.equal(summary.skippedOptOut, 1);
	assert.equal(summary.delivered, 1);
	assert.equal(summary.failed, 0);
});

test("weekly parent report scheduler is idempotent by period key", async () => {
	const delivered: string[] = [];
	const checked: string[] = [];
	const service = new ParentWeeklyReportSchedulerService(
		createDeps({
			hasExistingDelivery: async (parentUserId, periodKey) => {
				checked.push(`${parentUserId}:${periodKey}`);
				return parentUserId === "parent-1";
			},
			deliverWeeklyReport: async ({ parent }) => {
				delivered.push(parent.id);
				return true;
			},
		}),
	);

	const summary = await service.run({ periodKey: "2026-W20" });

	assert.deepEqual(checked, ["parent-1:2026-W20", "parent-2:2026-W20"]);
	assert.deepEqual(delivered, ["parent-2"]);
	assert.equal(summary.skippedExisting, 1);
	assert.equal(summary.delivered, 1);
});

test("weekly parent report scheduler continues after per-parent failures", async () => {
	const delivered: string[] = [];
	const warnings: string[] = [];
	const service = new ParentWeeklyReportSchedulerService(
		createDeps({
			buildWeeklyReport: async (parentUserId) => {
				if (parentUserId === "parent-1") {
					throw new Error("dashboard unavailable");
				}
				return {
					generated_at: "2026-05-12T00:00:00.000Z",
					range_days: 7,
					totals: { students: 1, sessions: 2, active_minutes: 60, alerts: 0 },
					students: [
						{
							student_id: "student-2",
							student_name: "Student Two",
							grade_level: 6,
							sessions: 2,
							active_minutes: 60,
							attendance_rate: 100,
							avg_quiz_score: 80,
							risk_level: "low",
							alerts: 0,
							intervention_suggestions: [],
						},
					],
					follow_up_actions: [],
				};
			},
			deliverWeeklyReport: async ({ parent }) => {
				delivered.push(parent.id);
				return true;
			},
			logger: {
				log: () => undefined,
				warn: (message) => warnings.push(String(message)),
				error: () => undefined,
			},
		}),
	);

	const summary = await service.run({ periodKey: "2026-W20" });

	assert.deepEqual(delivered, ["parent-2"]);
	assert.equal(summary.failed, 1);
	assert.equal(summary.delivered, 1);
	assert.equal(summary.failures[0]?.parentUserId, "parent-1");
	assert.match(warnings[0] ?? "", /Failed to send weekly report/);
});

test("weekly parent report scheduler only increments delivered when a notification is persisted", async () => {
	const service = new ParentWeeklyReportSchedulerService(
		createDeps({
			listActiveParents: async () => [
				{
					id: "parent-empty",
					email: "empty@example.com",
					full_name: "Empty Parent",
				},
			],
			buildWeeklyReport: async () => ({
				generated_at: "2026-05-12T00:00:00.000Z",
				range_days: 7,
				totals: { students: 0, sessions: 0, active_minutes: 0, alerts: 0 },
				students: [],
				follow_up_actions: [],
			}),
			deliverWeeklyReport: async () => false,
		}),
	);

	const summary = await service.run({ periodKey: "2026-W20" });

	assert.equal(summary.delivered, 0);
	assert.equal(summary.skippedEmptyReport, 1);
	assert.equal(summary.failed, 0);
});

test("weekly summary notification delivery uses an atomic upsert keyed by parent type and period", async () => {
	const { createWeeklySummaryNotification } = await import(
		"./parent-weekly-report-scheduler.service"
	);
	const { ParentNotificationModel } = await import(
		"../models/engagement.model"
	);
	const originalFindOneAndUpdate = ParentNotificationModel.findOneAndUpdate;
	const calls: Array<{ filter: any; update: any; options: any }> = [];

	try {
		(ParentNotificationModel as any).findOneAndUpdate = (
			filter: any,
			update: any,
			options: any,
		) => {
			calls.push({ filter, update, options });
			return {
				exec: async () => ({
					lastErrorObject: { updatedExisting: false },
				}),
			};
		};

		const persisted = await createWeeklySummaryNotification({
			parent: {
				id: "parent-1",
				email: "p1@example.com",
				full_name: "Parent One",
			},
			periodKey: "2026-W20",
			report: await createDeps().buildWeeklyReport("parent-1", 7),
		});

		assert.equal(persisted, true);
		assert.equal(calls.length, 1);
		assert.deepEqual(calls[0]?.filter, {
			parent_user_id: "parent-1",
			type: "weekly_summary",
			"payload.period_key": "2026-W20",
		});
		assert.equal(calls[0]?.options.upsert, true);
		assert.equal(calls[0]?.options.includeResultMetadata, true);
		assert.equal(calls[0]?.update.$setOnInsert.payload.period_key, "2026-W20");
	} finally {
		(ParentNotificationModel as any).findOneAndUpdate =
			originalFindOneAndUpdate;
	}
});
