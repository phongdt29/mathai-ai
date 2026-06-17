import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
	NotificationPreferenceService,
	isInQuietHours,
} from "./notification-preference.service";
import type { IParentNotificationPreference } from "../models/engagement.model";
import type { NotificationChannel } from "../types";

// ── Mock preference repository ─────────────────────────────────────────

function createMockPrefs(
	overrides: Partial<IParentNotificationPreference> = {},
): IParentNotificationPreference {
	return {
		parent_user_id: "user-123" as any,
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
	const d = new Date(2024, 0, 15, hours, minutes, 0);
	return d;
}

// ── Tests: isInQuietHours helper ────────────────────────────────────────

describe("isInQuietHours", () => {
	it("returns false when quietStart is null", () => {
		const now = createICTDate(23, 0);
		assert.equal(isInQuietHours(null, "07:00", now), false);
	});

	it("returns false when quietEnd is null", () => {
		const now = createICTDate(23, 0);
		assert.equal(isInQuietHours("22:00", null, now), false);
	});

	it("returns false when both are null", () => {
		const now = createICTDate(23, 0);
		assert.equal(isInQuietHours(null, null, now), false);
	});

	it("returns false for invalid format", () => {
		const now = createICTDate(23, 0);
		assert.equal(isInQuietHours("invalid", "07:00", now), false);
		assert.equal(isInQuietHours("22:00", "bad", now), false);
	});

	it("detects same-day range correctly (09:00 to 17:00)", () => {
		assert.equal(isInQuietHours("09:00", "17:00", createICTDate(10, 0)), true);
		assert.equal(isInQuietHours("09:00", "17:00", createICTDate(9, 0)), true);
		assert.equal(isInQuietHours("09:00", "17:00", createICTDate(16, 59)), true);
		assert.equal(isInQuietHours("09:00", "17:00", createICTDate(17, 0)), false);
		assert.equal(isInQuietHours("09:00", "17:00", createICTDate(8, 59)), false);
	});

	it("detects overnight range correctly (22:00 to 07:00)", () => {
		assert.equal(isInQuietHours("22:00", "07:00", createICTDate(23, 0)), true);
		assert.equal(isInQuietHours("22:00", "07:00", createICTDate(22, 0)), true);
		assert.equal(isInQuietHours("22:00", "07:00", createICTDate(0, 0)), true);
		assert.equal(isInQuietHours("22:00", "07:00", createICTDate(6, 59)), true);
		assert.equal(isInQuietHours("22:00", "07:00", createICTDate(7, 0)), false);
		assert.equal(isInQuietHours("22:00", "07:00", createICTDate(12, 0)), false);
		assert.equal(isInQuietHours("22:00", "07:00", createICTDate(21, 59)), false);
	});

	it("handles midnight boundary (00:00 to 06:00)", () => {
		assert.equal(isInQuietHours("00:00", "06:00", createICTDate(0, 0)), true);
		assert.equal(isInQuietHours("00:00", "06:00", createICTDate(3, 30)), true);
		assert.equal(isInQuietHours("00:00", "06:00", createICTDate(5, 59)), true);
		assert.equal(isInQuietHours("00:00", "06:00", createICTDate(6, 0)), false);
	});
});

// ── Tests: NotificationPreferenceService ────────────────────────────────

describe("NotificationPreferenceService", () => {
	describe("resolveEffectiveChannels", () => {
		it("returns all requested channels when no preferences exist", async () => {
			const service = new NotificationPreferenceService({
				prefRepo: createMockRepo(null),
				getNowInICT: () => createICTDate(10, 0),
			});

			const result = await service.resolveEffectiveChannels({
				userId: "user-123",
				requestedChannels: ["in_app", "email", "push"],
			});

			assert.deepEqual(result, ["in_app", "email", "push"]);
		});

		it("returns empty array when requestedChannels is empty", async () => {
			const service = new NotificationPreferenceService({
				prefRepo: createMockRepo(createMockPrefs()),
				getNowInICT: () => createICTDate(10, 0),
			});

			const result = await service.resolveEffectiveChannels({
				userId: "user-123",
				requestedChannels: [],
			});

			assert.deepEqual(result, []);
		});

		it("filters channels based on preferred_channel", async () => {
			const prefs = createMockPrefs({ preferred_channel: "email" });
			const service = new NotificationPreferenceService({
				prefRepo: createMockRepo(prefs),
				getNowInICT: () => createICTDate(10, 0),
			});

			const result = await service.resolveEffectiveChannels({
				userId: "user-123",
				requestedChannels: ["in_app", "email", "sms", "push"],
			});

			// Should keep in_app (always) + email (preferred)
			assert.deepEqual(result, ["in_app", "email"]);
		});

		it("keeps in_app when preferred_channel is push", async () => {
			const prefs = createMockPrefs({ preferred_channel: "push" });
			const service = new NotificationPreferenceService({
				prefRepo: createMockRepo(prefs),
				getNowInICT: () => createICTDate(10, 0),
			});

			const result = await service.resolveEffectiveChannels({
				userId: "user-123",
				requestedChannels: ["in_app", "email", "push"],
			});

			assert.deepEqual(result, ["in_app", "push"]);
		});

		it("suppresses email/sms/push during quiet hours (non-critical)", async () => {
			const prefs = createMockPrefs({
				preferred_channel: "email",
				quiet_hours_start: "22:00",
				quiet_hours_end: "07:00",
			});
			const service = new NotificationPreferenceService({
				prefRepo: createMockRepo(prefs),
				getNowInICT: () => createICTDate(23, 30), // 23:30 ICT — in quiet hours
			});

			const result = await service.resolveEffectiveChannels({
				userId: "user-123",
				requestedChannels: ["in_app", "email", "sms", "push"],
				severity: "info",
			});

			// Only in_app should remain
			assert.deepEqual(result, ["in_app"]);
		});

		it("does NOT suppress channels during quiet hours when severity is critical", async () => {
			const prefs = createMockPrefs({
				preferred_channel: "email",
				quiet_hours_start: "22:00",
				quiet_hours_end: "07:00",
			});
			const service = new NotificationPreferenceService({
				prefRepo: createMockRepo(prefs),
				getNowInICT: () => createICTDate(23, 30), // in quiet hours
			});

			const result = await service.resolveEffectiveChannels({
				userId: "user-123",
				requestedChannels: ["in_app", "email", "sms", "push"],
				severity: "critical",
			});

			// Critical bypasses quiet hours — filtered by preference only
			assert.deepEqual(result, ["in_app", "email"]);
		});

		it("does NOT suppress channels outside quiet hours", async () => {
			const prefs = createMockPrefs({
				preferred_channel: "email",
				quiet_hours_start: "22:00",
				quiet_hours_end: "07:00",
			});
			const service = new NotificationPreferenceService({
				prefRepo: createMockRepo(prefs),
				getNowInICT: () => createICTDate(12, 0), // noon — outside quiet hours
			});

			const result = await service.resolveEffectiveChannels({
				userId: "user-123",
				requestedChannels: ["in_app", "email"],
				severity: "info",
			});

			assert.deepEqual(result, ["in_app", "email"]);
		});

		it("handles quiet hours with no severity specified (defaults to non-critical)", async () => {
			const prefs = createMockPrefs({
				preferred_channel: "email",
				quiet_hours_start: "22:00",
				quiet_hours_end: "07:00",
			});
			const service = new NotificationPreferenceService({
				prefRepo: createMockRepo(prefs),
				getNowInICT: () => createICTDate(23, 0), // in quiet hours
			});

			const result = await service.resolveEffectiveChannels({
				userId: "user-123",
				requestedChannels: ["in_app", "email"],
			});

			// No severity = not critical → suppress email
			assert.deepEqual(result, ["in_app"]);
		});

		it("returns in_app only when preferred_channel is in_app", async () => {
			const prefs = createMockPrefs({ preferred_channel: "in_app" });
			const service = new NotificationPreferenceService({
				prefRepo: createMockRepo(prefs),
				getNowInICT: () => createICTDate(10, 0),
			});

			const result = await service.resolveEffectiveChannels({
				userId: "user-123",
				requestedChannels: ["in_app", "email", "sms", "push"],
			});

			assert.deepEqual(result, ["in_app"]);
		});

		it("handles warning severity during quiet hours (suppressed)", async () => {
			const prefs = createMockPrefs({
				preferred_channel: "sms",
				quiet_hours_start: "21:00",
				quiet_hours_end: "08:00",
			});
			const service = new NotificationPreferenceService({
				prefRepo: createMockRepo(prefs),
				getNowInICT: () => createICTDate(5, 0), // 05:00 — in quiet hours
			});

			const result = await service.resolveEffectiveChannels({
				userId: "user-123",
				requestedChannels: ["in_app", "sms"],
				severity: "warning",
			});

			// warning != critical → suppress sms, keep in_app
			assert.deepEqual(result, ["in_app"]);
		});
	});
});
