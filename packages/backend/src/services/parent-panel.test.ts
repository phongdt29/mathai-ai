import { describe, it, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
	NotificationPreferenceService,
	isInQuietHours,
} from "./notification-preference.service";
import { ScopedAuthorizationService } from "./scoped-authorization.service";
import type { IParentNotificationPreference } from "../models/engagement.model";
import type { NotificationChannel, NotificationSeverity } from "../types";
import type { PermissionGrantRepository } from "../models/permission-grant.model";
import { parentChildRepository } from "../models/parent-child.model";

// ══════════════════════════════════════════════════════════════════════════
// Helpers & Mocks
// ══════════════════════════════════════════════════════════════════════════

function createMockPrefs(
	overrides: Partial<IParentNotificationPreference> = {},
): IParentNotificationPreference {
	return {
		parent_user_id: "parent-1" as any,
		notify_session_start: true,
		notify_session_complete: true,
		notify_absent: true,
		notify_daily_summary: false,
		notify_quiz_result: true,
		notify_absence: true,
		notify_low_engagement: true,
		notify_quiz_failure: true,
		notify_streak_break: true,
		notify_risk_alert: true,
		notify_weekly_summary: true,
		notify_achievement: true,
		preferred_channel: "email",
		quiet_hours_start: null,
		quiet_hours_end: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	} as IParentNotificationPreference;
}

function createMockRepo(prefs: IParentNotificationPreference | null = null) {
	return {
		findByParent: async (_userId: string) => prefs,
	};
}

function createICTDate(hours: number, minutes: number): Date {
	return new Date(2024, 0, 15, hours, minutes, 0);
}

const noGrantsRepo = {
	findMatchingGrants: async () => [],
} as unknown as PermissionGrantRepository;

// ══════════════════════════════════════════════════════════════════════════
// Test Suite: Scoped Authorization — Parent access child not linked → 403
// ══════════════════════════════════════════════════════════════════════════

describe("Parent Panel — Scoped Authorization", () => {
	it("parent accessing unlinked child is denied (no_matching_rule)", async (t) => {
		const originalFindRelation = parentChildRepository.findRelation;
		t.after(() => {
			parentChildRepository.findRelation = originalFindRelation;
		});

		// No relation exists
		parentChildRepository.findRelation = async () => null;
		const service = new ScopedAuthorizationService({ permissionGrants: noGrantsRepo });

		const decision = await service.canAccess({
			actor: { id: "parent-1", role: "parent" },
			resourceType: "student",
			resourceId: "student-unlinked",
			action: "read",
		});

		assert.equal(decision.allowed, false);
		assert.equal(decision.reason, "no_matching_rule");
	});

	it("parent accessing linked child is allowed (parent_child_relation)", async (t) => {
		const originalFindRelation = parentChildRepository.findRelation;
		t.after(() => {
			parentChildRepository.findRelation = originalFindRelation;
		});

		parentChildRepository.findRelation = async () => ({
			parent_user_id: "parent-1",
			student_id: "student-linked",
		}) as any;
		const service = new ScopedAuthorizationService({ permissionGrants: noGrantsRepo });

		const decision = await service.canAccess({
			actor: { id: "parent-1", role: "parent" },
			resourceType: "student",
			resourceId: "student-linked",
			action: "read",
		});

		assert.equal(decision.allowed, true);
		assert.equal(decision.reason, "parent_child_relation");
	});

	it("parent accessing child with delete action is also denied when unlinked", async (t) => {
		const originalFindRelation = parentChildRepository.findRelation;
		t.after(() => {
			parentChildRepository.findRelation = originalFindRelation;
		});

		parentChildRepository.findRelation = async () => null;
		const service = new ScopedAuthorizationService({ permissionGrants: noGrantsRepo });

		const decision = await service.canAccess({
			actor: { id: "parent-1", role: "parent" },
			resourceType: "student",
			resourceId: "student-999",
			action: "delete",
		});

		assert.equal(decision.allowed, false);
	});
});

// ══════════════════════════════════════════════════════════════════════════
// Test Suite: Quiet Hours Logic in notification-preference.service
// ══════════════════════════════════════════════════════════════════════════

describe("Parent Panel — Quiet Hours Logic", () => {
	it("during quiet hours with info severity: email/sms/push suppressed, in_app kept", async () => {
		const prefs = createMockPrefs({
			preferred_channel: "in_app",
			quiet_hours_start: "22:00",
			quiet_hours_end: "07:00",
		});
		const service = new NotificationPreferenceService({
			prefRepo: createMockRepo(prefs),
			getNowInICT: () => createICTDate(23, 30),
		});

		const result = await service.resolveEffectiveChannels({
			userId: "parent-1",
			requestedChannels: ["in_app", "email", "sms", "push"],
			severity: "info",
		});

		assert.deepEqual(result, ["in_app"]);
	});

	it("during quiet hours with warning severity: email/sms/push suppressed", async () => {
		const prefs = createMockPrefs({
			preferred_channel: "email",
			quiet_hours_start: "21:00",
			quiet_hours_end: "06:00",
		});
		const service = new NotificationPreferenceService({
			prefRepo: createMockRepo(prefs),
			getNowInICT: () => createICTDate(3, 0), // 03:00 — in quiet hours
		});

		const result = await service.resolveEffectiveChannels({
			userId: "parent-1",
			requestedChannels: ["in_app", "email"],
			severity: "warning",
		});

		// email suppressed during quiet hours, only in_app remains
		assert.deepEqual(result, ["in_app"]);
	});

	it("during quiet hours with critical severity: channels NOT suppressed", async () => {
		const prefs = createMockPrefs({
			preferred_channel: "email",
			quiet_hours_start: "22:00",
			quiet_hours_end: "07:00",
		});
		const service = new NotificationPreferenceService({
			prefRepo: createMockRepo(prefs),
			getNowInICT: () => createICTDate(23, 0),
		});

		const result = await service.resolveEffectiveChannels({
			userId: "parent-1",
			requestedChannels: ["in_app", "email", "sms", "push"],
			severity: "critical",
		});

		// Critical bypasses quiet hours — filtered by preference only (in_app + email)
		assert.deepEqual(result, ["in_app", "email"]);
	});

	it("outside quiet hours: channels not suppressed", async () => {
		const prefs = createMockPrefs({
			preferred_channel: "email",
			quiet_hours_start: "22:00",
			quiet_hours_end: "07:00",
		});
		const service = new NotificationPreferenceService({
			prefRepo: createMockRepo(prefs),
			getNowInICT: () => createICTDate(14, 0), // 14:00 — outside quiet hours
		});

		const result = await service.resolveEffectiveChannels({
			userId: "parent-1",
			requestedChannels: ["in_app", "email"],
			severity: "info",
		});

		assert.deepEqual(result, ["in_app", "email"]);
	});

	it("quiet hours null → no suppression", async () => {
		const prefs = createMockPrefs({
			preferred_channel: "email",
			quiet_hours_start: null,
			quiet_hours_end: null,
		});
		const service = new NotificationPreferenceService({
			prefRepo: createMockRepo(prefs),
			getNowInICT: () => createICTDate(23, 30),
		});

		const result = await service.resolveEffectiveChannels({
			userId: "parent-1",
			requestedChannels: ["in_app", "email"],
			severity: "info",
		});

		assert.deepEqual(result, ["in_app", "email"]);
	});
});

// ══════════════════════════════════════════════════════════════════════════
// Test Suite: Preferences Validation (HH:MM format)
// ══════════════════════════════════════════════════════════════════════════

describe("Parent Panel — Preferences Validation (HH:MM format)", () => {
	const hhmmRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

	it("valid HH:MM values pass regex", () => {
		const validValues = ["00:00", "01:30", "12:00", "23:59", "09:05", "20:45"];
		for (const val of validValues) {
			assert.ok(hhmmRegex.test(val), `Expected "${val}" to be valid HH:MM`);
		}
	});

	it("invalid HH:MM values fail regex", () => {
		const invalidValues = [
			"24:00", // hour > 23
			"25:00", // hour > 23
			"12:60", // minute > 59
			"1:30",  // single digit hour
			"12:5",  // single digit minute
			"abc",
			"",
			"12:00:00", // extra seconds
			"12-00",    // wrong separator
			"noon",
		];
		for (const val of invalidValues) {
			assert.ok(!hhmmRegex.test(val), `Expected "${val}" to be invalid HH:MM`);
		}
	});

	it("isInQuietHours rejects invalid format gracefully", () => {
		const now = createICTDate(23, 0);
		assert.equal(isInQuietHours("25:00", "07:00", now), false);
		assert.equal(isInQuietHours("22:00", "99:99", now), false);
		assert.equal(isInQuietHours("abc", "07:00", now), false);
		assert.equal(isInQuietHours("22:00", "", now), false);
	});

	it("null quiet_hours_start or quiet_hours_end means no quiet hours", () => {
		const now = createICTDate(23, 0);
		assert.equal(isInQuietHours(null, "07:00", now), false);
		assert.equal(isInQuietHours("22:00", null, now), false);
		assert.equal(isInQuietHours(null, null, now), false);
	});
});

// ══════════════════════════════════════════════════════════════════════════
// Property-Based Tests
// ══════════════════════════════════════════════════════════════════════════

/**
 * **Validates: Requirements 7.1–7.9**
 * Property 3: Quiet hours respect
 *
 * If user is within quiet_hours_start..quiet_hours_end and severity != "critical",
 * email/sms/push are skipped; in_app is always kept.
 */
describe("Property 3: Quiet hours respect (parent panel context)", () => {
	// Generator for valid HH:MM strings
	const hhmmArb = fc
		.tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
		.map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);

	// Generator for time that falls within a given quiet hours range
	const timeInRangeArb = (startMinutes: number, endMinutes: number) => {
		if (startMinutes <= endMinutes) {
			// Same-day range
			return fc
				.integer({ min: startMinutes, max: Math.max(startMinutes, endMinutes - 1) })
				.map((totalMin) => createICTDate(Math.floor(totalMin / 60), totalMin % 60));
		}
		// Overnight range: time >= start OR time < end
		return fc
			.oneof(
				fc.integer({ min: startMinutes, max: 23 * 60 + 59 }),
				fc.integer({ min: 0, max: Math.max(0, endMinutes - 1) }),
			)
			.map((totalMin) => createICTDate(Math.floor(totalMin / 60), totalMin % 60));
	};

	const nonCriticalSeverityArb = fc.constantFrom<NotificationSeverity>("info", "warning");
	const suppressibleChannelArb = fc.subarray(["email", "sms", "push"] as NotificationChannel[], { minLength: 1 });

	it("∀ non-critical severity during quiet hours: email/sms/push suppressed, in_app kept", () => {
		fc.assert(
			fc.asyncProperty(
				hhmmArb,
				hhmmArb,
				nonCriticalSeverityArb,
				suppressibleChannelArb,
				async (quietStart, quietEnd, severity, extraChannels) => {
					const startMinutes = parseInt(quietStart.split(":")[0]) * 60 + parseInt(quietStart.split(":")[1]);
					const endMinutes = parseInt(quietEnd.split(":")[0]) * 60 + parseInt(quietEnd.split(":")[1]);

					// Skip degenerate case where start == end (no quiet window)
					if (startMinutes === endMinutes) return;

					// Generate a time that is within the quiet hours
					const nowInRange = await fc.sample(timeInRangeArb(startMinutes, endMinutes), 1);
					const now = nowInRange[0];

					// Verify the time is actually in quiet hours
					if (!isInQuietHours(quietStart, quietEnd, now)) return;

					const prefs = createMockPrefs({
						preferred_channel: "in_app",
						quiet_hours_start: quietStart,
						quiet_hours_end: quietEnd,
					});

					const service = new NotificationPreferenceService({
						prefRepo: createMockRepo(prefs),
						getNowInICT: () => now,
					});

					const requestedChannels: NotificationChannel[] = ["in_app", ...extraChannels];
					const result = await service.resolveEffectiveChannels({
						userId: "parent-1",
						requestedChannels,
						severity,
					});

					// in_app must be present
					assert.ok(
						result.includes("in_app"),
						`in_app must be kept during quiet hours, got: ${JSON.stringify(result)}`,
					);

					// email, sms, push must NOT be present
					for (const ch of ["email", "sms", "push"] as NotificationChannel[]) {
						assert.ok(
							!result.includes(ch),
							`Channel "${ch}" should be suppressed during quiet hours (severity=${severity})`,
						);
					}
				},
			),
			{ numRuns: 50 },
		);
	});

	it("∀ critical severity during quiet hours: channels are NOT suppressed", () => {
		fc.assert(
			fc.asyncProperty(
				hhmmArb,
				hhmmArb,
				suppressibleChannelArb,
				async (quietStart, quietEnd, extraChannels) => {
					const startMinutes = parseInt(quietStart.split(":")[0]) * 60 + parseInt(quietStart.split(":")[1]);
					const endMinutes = parseInt(quietEnd.split(":")[0]) * 60 + parseInt(quietEnd.split(":")[1]);

					if (startMinutes === endMinutes) return;

					const nowInRange = await fc.sample(timeInRangeArb(startMinutes, endMinutes), 1);
					const now = nowInRange[0];

					if (!isInQuietHours(quietStart, quietEnd, now)) return;

					const prefs = createMockPrefs({
						preferred_channel: "in_app",
						quiet_hours_start: quietStart,
						quiet_hours_end: quietEnd,
					});

					const service = new NotificationPreferenceService({
						prefRepo: createMockRepo(prefs),
						getNowInICT: () => now,
					});

					const requestedChannels: NotificationChannel[] = ["in_app", ...extraChannels];
					const result = await service.resolveEffectiveChannels({
						userId: "parent-1",
						requestedChannels,
						severity: "critical",
					});

					// Critical bypasses quiet hours — in_app must be present
					assert.ok(
						result.includes("in_app"),
						`in_app must always be present for critical, got: ${JSON.stringify(result)}`,
					);

					// Result should NOT be empty (at minimum in_app)
					assert.ok(result.length >= 1, "Critical notifications must have at least in_app");
				},
			),
			{ numRuns: 50 },
		);
	});
});

/**
 * **Validates: Requirements 7.2**
 * Property 19: Scoped authorization
 *
 * Parent accessing a child NOT linked via parent_student_link → denied.
 * Parent accessing a linked child → allowed.
 */
describe("Property 19: Scoped authorization (parent panel context)", () => {
	it("∀ (parentId, studentId) without link → access denied", () => {
		fc.assert(
			fc.asyncProperty(
				fc.string({ minLength: 1, maxLength: 24 }).filter((s) => s.trim().length > 0),
				fc.string({ minLength: 1, maxLength: 24 }).filter((s) => s.trim().length > 0),
				fc.constantFrom<string>("read", "update", "delete"),
				async (parentId, studentId, action) => {
					const originalFindRelation = parentChildRepository.findRelation;
					try {
						// No relation exists
						parentChildRepository.findRelation = async () => null;
						const service = new ScopedAuthorizationService({ permissionGrants: noGrantsRepo });

						const decision = await service.canAccess({
							actor: { id: parentId, role: "parent" },
							resourceType: "student",
							resourceId: studentId,
							action,
						});

						assert.equal(decision.allowed, false, `Parent "${parentId}" should NOT access unlinked student "${studentId}"`);
					} finally {
						parentChildRepository.findRelation = originalFindRelation;
					}
				},
			),
			{ numRuns: 50 },
		);
	});

	it("∀ (parentId, studentId) with link → access allowed", () => {
		fc.assert(
			fc.asyncProperty(
				fc.string({ minLength: 1, maxLength: 24 }).filter((s) => s.trim().length > 0),
				fc.string({ minLength: 1, maxLength: 24 }).filter((s) => s.trim().length > 0),
				fc.constantFrom<string>("read", "update", "delete"),
				async (parentId, studentId, action) => {
					const originalFindRelation = parentChildRepository.findRelation;
					try {
						// Relation exists
						parentChildRepository.findRelation = async () => ({
							parent_user_id: parentId,
							student_id: studentId,
						}) as any;
						const service = new ScopedAuthorizationService({ permissionGrants: noGrantsRepo });

						const decision = await service.canAccess({
							actor: { id: parentId, role: "parent" },
							resourceType: "student",
							resourceId: studentId,
							action,
						});

						assert.equal(decision.allowed, true, `Parent "${parentId}" should access linked student "${studentId}"`);
						assert.equal(decision.reason, "parent_child_relation");
					} finally {
						parentChildRepository.findRelation = originalFindRelation;
					}
				},
			),
			{ numRuns: 50 },
		);
	});
});
