import webPush from "web-push";
import {
	pushSubscriptionRepository,
	type IPushSubscription,
} from "../models/push-subscription.model";

// ── Types ───────────────────────────────────────────────────────────────

export type PushProvider = "console" | "web-push";

export interface PushPayload {
	title: string;
	body: string;
	data?: Record<string, unknown>;
}

export interface SendToSubscriptionsResult {
	sent: string[];
	invalid_tokens: string[];
}

export interface PushServiceOptions {
	provider: PushProvider;
	vapidPublicKey: string;
	vapidPrivateKey: string;
	vapidContact: string;
}

// ── Constants ───────────────────────────────────────────────────────────

/**
 * HTTP status codes that indicate the push subscription is no longer valid.
 * 410 Gone — subscription expired or unsubscribed
 * 404 Not Found — endpoint no longer exists
 */
const INVALID_TOKEN_STATUS_CODES = [404, 410];

// ── Service Implementation ──────────────────────────────────────────────

export class PushService {
	private readonly provider: PushProvider;
	private readonly vapidPublicKey: string;
	private readonly vapidPrivateKey: string;
	private readonly vapidContact: string;

	constructor(options: PushServiceOptions = buildDefaultOptions()) {
		this.provider = options.provider;
		this.vapidPublicKey = options.vapidPublicKey;
		this.vapidPrivateKey = options.vapidPrivateKey;
		this.vapidContact = options.vapidContact;

		if (this.provider === "web-push" && this.vapidPublicKey && this.vapidPrivateKey) {
			webPush.setVapidDetails(
				this.vapidContact,
				this.vapidPublicKey,
				this.vapidPrivateKey,
			);
		}
	}

	/**
	 * Send push notifications to a list of PushSubscription documents.
	 *
	 * Returns which endpoints were successfully sent and which are invalid
	 * (and have been deactivated in the database).
	 */
	public async sendToSubscriptions(
		subscriptions: IPushSubscription[],
		payload: PushPayload,
	): Promise<SendToSubscriptionsResult> {
		if (subscriptions.length === 0) {
			return { sent: [], invalid_tokens: [] };
		}

		switch (this.provider) {
			case "console":
				return this.sendConsole(subscriptions, payload);
			case "web-push":
				return this.sendWebPush(subscriptions, payload);
			default:
				throw new PushProviderError(
					`Unknown push provider: ${this.provider}`,
					0,
				);
		}
	}

	/**
	 * Get the VAPID public key for client-side subscription.
	 */
	public getVapidPublicKey(): string {
		return this.vapidPublicKey;
	}

	// ── Console provider (dev/test) ─────────────────────────────────────

	private sendConsole(
		subscriptions: IPushSubscription[],
		payload: PushPayload,
	): SendToSubscriptionsResult {
		const endpoints = subscriptions.map((s) => s.endpoint);
		console.info("[push:console]", {
			recipients: endpoints.length,
			payload: { title: payload.title, body: payload.body },
			endpoints,
		});
		return { sent: endpoints, invalid_tokens: [] };
	}

	// ── Web Push provider ───────────────────────────────────────────────

	private async sendWebPush(
		subscriptions: IPushSubscription[],
		payload: PushPayload,
	): Promise<SendToSubscriptionsResult> {
		const sent: string[] = [];
		const invalid_tokens: string[] = [];

		const notificationPayload = JSON.stringify({
			title: payload.title,
			body: payload.body,
			data: payload.data ?? {},
		});

		const results = await Promise.allSettled(
			subscriptions.map((sub) => this.sendSingleWebPush(sub, notificationPayload)),
		);

		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			const subscription = subscriptions[i];
			const endpoint = subscription.endpoint;

			if (result.status === "fulfilled") {
				sent.push(endpoint);
			} else {
				const error = result.reason;
				if (this.isInvalidTokenError(error)) {
					invalid_tokens.push(endpoint);
				} else {
					// Non-token errors (network issues, server errors) — log but don't deactivate
					console.warn("[push:web-push] send failed (non-fatal)", {
						endpoint,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}

		// Deactivate invalid subscriptions in batch
		if (invalid_tokens.length > 0) {
			await pushSubscriptionRepository.deactivateByEndpoints(invalid_tokens);
		}

		return { sent, invalid_tokens };
	}

	/**
	 * Send a single web push notification.
	 * Throws on failure so Promise.allSettled can categorize it.
	 */
	private async sendSingleWebPush(
		subscription: IPushSubscription,
		payload: string,
	): Promise<void> {
		const pushSubscription: webPush.PushSubscription = {
			endpoint: subscription.endpoint,
			keys: {
				p256dh: subscription.keys.p256dh,
				auth: subscription.keys.auth,
			},
		};

		await webPush.sendNotification(pushSubscription, payload);
	}

	/**
	 * Determine if an error indicates the push subscription is invalid
	 * (410 Gone or 404 Not Found).
	 */
	private isInvalidTokenError(error: unknown): boolean {
		if (error && typeof error === "object") {
			const err = error as { statusCode?: number };
			if (typeof err.statusCode === "number") {
				return INVALID_TOKEN_STATUS_CODES.includes(err.statusCode);
			}
		}
		return false;
	}
}

// ── Error class ─────────────────────────────────────────────────────────

export class PushProviderError extends Error {
	public readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "PushProviderError";
		this.status = status;
	}
}

// ── Default options from environment ────────────────────────────────────

function buildDefaultOptions(): PushServiceOptions {
	return {
		provider: readPushEnv("PUSH_PROVIDER", "console") as PushProvider,
		vapidPublicKey: readPushEnv("WEB_PUSH_VAPID_PUBLIC_KEY", ""),
		vapidPrivateKey: readPushEnv("WEB_PUSH_VAPID_PRIVATE_KEY", ""),
		vapidContact: readPushEnv("WEB_PUSH_CONTACT", "mailto:support@mathai.vn"),
	};
}

function readPushEnv(key: string, fallback: string): string {
	const value = process.env[key];
	if (value === undefined || value.trim().length === 0) {
		return fallback;
	}
	return value.trim();
}

// ── Singleton export ────────────────────────────────────────────────────

export const pushService = new PushService();

export default pushService;
