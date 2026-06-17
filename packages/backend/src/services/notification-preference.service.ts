import type { NotificationChannel, NotificationSeverity } from "../types";
import { parentNotificationPrefRepo } from "../models/engagement.model";
import type { IParentNotificationPreference } from "../models/engagement.model";

// ── Types ──────────────────────────────────────────────────────────────

export interface ResolveChannelsOptions {
	userId: string;
	requestedChannels: NotificationChannel[];
	severity?: NotificationSeverity;
}

export interface NotificationPreferenceServiceDependencies {
	prefRepo?: { findByParent(userId: string): Promise<IParentNotificationPreference | null> };
	getNowInICT?: () => Date;
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Get current time in ICT (Asia/Ho_Chi_Minh, UTC+7).
 * Returns a Date object representing the current moment in ICT.
 */
function defaultGetNowInICT(): Date {
	const now = new Date();
	// Convert to ICT by creating a date string in that timezone
	const ictString = now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" });
	return new Date(ictString);
}

/**
 * Parse "HH:MM" string into total minutes since midnight.
 * Returns null if format is invalid.
 */
function parseHHMM(time: string): number | null {
	const match = /^(\d{2}):(\d{2})$/.exec(time);
	if (!match) return null;
	const hours = parseInt(match[1], 10);
	const minutes = parseInt(match[2], 10);
	if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
	return hours * 60 + minutes;
}

/**
 * Check if the current ICT time falls within quiet hours.
 *
 * Handles overnight ranges (e.g., 22:00 to 07:00) by checking
 * if current time is >= start OR <= end.
 *
 * @param quietStart - "HH:MM" format or null
 * @param quietEnd - "HH:MM" format or null
 * @param nowInICT - current Date in ICT timezone
 * @returns true if currently in quiet hours
 */
export function isInQuietHours(
	quietStart: string | null,
	quietEnd: string | null,
	nowInICT: Date,
): boolean {
	if (!quietStart || !quietEnd) return false;

	const startMinutes = parseHHMM(quietStart);
	const endMinutes = parseHHMM(quietEnd);

	if (startMinutes === null || endMinutes === null) return false;

	const currentMinutes = nowInICT.getHours() * 60 + nowInICT.getMinutes();

	if (startMinutes <= endMinutes) {
		// Same-day range (e.g., 09:00 to 17:00)
		return currentMinutes >= startMinutes && currentMinutes < endMinutes;
	}

	// Overnight range (e.g., 22:00 to 07:00)
	return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

// ── Service Implementation ─────────────────────────────────────────────

/**
 * NotificationPreferenceService resolves effective notification channels
 * for a user based on their stored preferences and quiet hours settings.
 *
 * Quiet hours logic (Requirement 7.6):
 * - If current ICT time is within [quiet_hours_start, quiet_hours_end]
 *   AND severity !== "critical":
 *   → Remove email, sms, push from effective channels
 *   → Keep in_app to not lose events
 */
export class NotificationPreferenceService {
	private readonly prefRepo: { findByParent(userId: string): Promise<IParentNotificationPreference | null> };
	private readonly getNowInICT: () => Date;

	constructor(dependencies: NotificationPreferenceServiceDependencies = {}) {
		this.prefRepo = dependencies.prefRepo ?? parentNotificationPrefRepo;
		this.getNowInICT = dependencies.getNowInICT ?? defaultGetNowInICT;
	}

	/**
	 * Resolve effective channels for a notification dispatch.
	 *
	 * Steps:
	 * 1. Look up user's notification preferences
	 * 2. Filter requestedChannels based on user's preferred_channel
	 * 3. Apply quiet hours logic (suppress email/sms/push during quiet hours unless critical)
	 *
	 * @param options - userId, requestedChannels, and optional severity
	 * @returns Filtered array of effective channels
	 */
	public async resolveEffectiveChannels(options: ResolveChannelsOptions): Promise<NotificationChannel[]> {
		const { userId, requestedChannels, severity } = options;

		if (requestedChannels.length === 0) return [];

		// ── Step 1: Look up user preferences ─────────────────────────────
		const prefs = await this.prefRepo.findByParent(userId);

		// ── Step 2: Filter by preferred channel ──────────────────────────
		let effectiveChannels = this.filterByPreference(requestedChannels, prefs);

		// ── Step 3: Apply quiet hours ────────────────────────────────────
		effectiveChannels = this.applyQuietHours(effectiveChannels, prefs, severity);

		return effectiveChannels;
	}

	/**
	 * Filter requested channels based on user's preferred_channel setting.
	 *
	 * If user has a preference, ensure in_app is always included (baseline),
	 * and include the preferred channel if it was requested.
	 * If no preference exists, return all requested channels as-is.
	 */
	private filterByPreference(
		requestedChannels: NotificationChannel[],
		prefs: IParentNotificationPreference | null,
	): NotificationChannel[] {
		if (!prefs) return [...requestedChannels];

		const preferredChannel = (prefs.preferred_channel as NotificationChannel) || "in_app";

		// Always include in_app if requested, plus the user's preferred channel if requested
		const effective: NotificationChannel[] = [];

		for (const channel of requestedChannels) {
			if (channel === "in_app") {
				// in_app is always allowed
				effective.push(channel);
			} else if (channel === preferredChannel) {
				// User's preferred channel is allowed
				effective.push(channel);
			}
		}

		// Ensure in_app is present if it was in the requested list
		// (already handled above, but guard against empty result)
		if (effective.length === 0 && requestedChannels.includes("in_app")) {
			effective.push("in_app");
		}

		return effective;
	}

	/**
	 * Apply quiet hours suppression.
	 *
	 * If current ICT time is within quiet hours AND severity !== "critical":
	 * - Remove email, sms, push
	 * - Keep in_app
	 */
	private applyQuietHours(
		channels: NotificationChannel[],
		prefs: IParentNotificationPreference | null,
		severity?: NotificationSeverity,
	): NotificationChannel[] {
		if (!prefs) return channels;

		// Critical notifications bypass quiet hours
		if (severity === "critical") return channels;

		const quietStart = prefs.quiet_hours_start ?? null;
		const quietEnd = prefs.quiet_hours_end ?? null;

		const nowInICT = this.getNowInICT();

		if (!isInQuietHours(quietStart, quietEnd, nowInICT)) {
			return channels;
		}

		// During quiet hours: suppress email, sms, push — keep in_app
		const suppressedChannels: NotificationChannel[] = ["email", "sms", "push"];
		return channels.filter((ch) => !suppressedChannels.includes(ch));
	}
}

// ── Singleton export ───────────────────────────────────────────────────

export const notificationPreferenceService = new NotificationPreferenceService();

export default notificationPreferenceService;
