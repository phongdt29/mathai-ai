import mongoose from "mongoose";
import type { NotificationChannel, NotificationSeverity } from "../types";
import { emailService, type EmailService } from "./email.service";
import { smsService, type SmsService } from "./sms.service";
import {
	notificationPreferenceService,
	type NotificationPreferenceService,
} from "./notification-preference.service";
import {
	notificationTemplateService,
	type NotificationTemplateService,
	type RenderedTemplateOutput,
} from "./notification-template.service";
import {
	notificationDeliveryRepository,
	type NotificationDeliveryRepository,
	type INotificationDelivery,
} from "../models/notification-delivery.model";
import {
	pushSubscriptionRepository,
	type PushSubscriptionRepository,
} from "../models/push-subscription.model";
import {
	parentNotificationRepo,
	type ParentNotificationRepository,
} from "../models/engagement.model";
import { UserModel } from "../models/user.model";

// ── Types ──────────────────────────────────────────────────────────────

/**
 * Notification types supported by the system.
 * Extends as new notification use-cases are added.
 */
export type NotificationDispatchType =
	| "password_reset"
	| "assignment_graded"
	| "assignment_resubmitted"
	| "parent_absent_alert"
	| "parent_weekly_summary"
	| "risk_alert"
	| "payment_success"
	| "payment_failed"
	| "payment_intent_expired"
	| "subscription_renewal_reminder"
	| "invoice_reminder"
	| "student_daily_reminder"
	| "student_forgetting_alert"
	| "parent_lesson_reminder";

export interface NotificationRecipient {
	user_id?: string | null;
	email?: string | null;
	phone?: string | null;
	push_tokens?: string[] | null;
}

export interface SendNotificationInput {
	type: NotificationDispatchType;
	recipient: NotificationRecipient;
	channels: NotificationChannel[];
	payload: Record<string, unknown>;
	template_id: string;
	idempotency_key?: string;
	metadata?: Record<string, unknown>;
	severity?: NotificationSeverity;
}

export interface ChannelResult {
	channel: NotificationChannel;
	status: "sent" | "failed" | "skipped";
	provider_message_id?: string | null;
	error_code?: string | null;
}

export interface NotificationDispatchResult {
	delivery_id: string;
	channel_results: ChannelResult[];
}

/**
 * Shape of a persisted NotificationDelivery document.
 */
export interface NotificationDeliveryDoc {
	_id: mongoose.Types.ObjectId;
	type: string;
	recipient: NotificationRecipient;
	channels: NotificationChannel[];
	channel_results: ChannelResult[];
	status: "queued" | "sent" | "failed" | "skipped";
	template_id: string;
	idempotency_key?: string | null;
	retry_count: number;
	next_retry_at?: Date | null;
	metadata?: Record<string, unknown>;
	createdAt: Date;
	updatedAt: Date;
}

// ── Push Service Interface ─────────────────────────────────────────────

/**
 * Interface for push notification service.
 * Matches the expected push.service.ts contract.
 */
export interface PushServiceInterface {
	sendToSubscriptions(
		subscriptions: Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>,
		payload: { title: string; body: string; data?: Record<string, unknown> },
	): Promise<{ sent: string[]; invalid_tokens: string[] }>;
}

/**
 * Console-based push service for development/fallback when push.service.ts doesn't exist yet.
 */
class ConsolePushService implements PushServiceInterface {
	public async sendToSubscriptions(
		subscriptions: Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>,
		payload: { title: string; body: string; data?: Record<string, unknown> },
	): Promise<{ sent: string[]; invalid_tokens: string[] }> {
		console.info("[push:console]", {
			subscriptions: subscriptions.length,
			payload,
		});
		return {
			sent: subscriptions.map((s) => s.endpoint),
			invalid_tokens: [],
		};
	}
}

// ── Service Dependencies ───────────────────────────────────────────────

export interface NotificationServiceDependencies {
	emailService?: EmailService;
	smsService?: SmsService;
	pushService?: PushServiceInterface;
	preferenceService?: NotificationPreferenceService;
	templateService?: NotificationTemplateService;
	deliveryRepo?: NotificationDeliveryRepository;
	pushSubscriptionRepo?: PushSubscriptionRepository;
	parentNotificationRepo?: ParentNotificationRepository;
	userModel?: typeof UserModel;
	logger?: Pick<Console, "error" | "warn" | "info">;
	maxRetries?: number;
	baseRetryDelayMinutes?: number;
}

// ── Constants ──────────────────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_RETRY_DELAY_MINUTES = 5;

// ── Service Implementation ─────────────────────────────────────────────

export class NotificationService {
	private readonly emailSvc: EmailService;
	private readonly smsSvc: SmsService;
	private readonly pushSvc: PushServiceInterface;
	private readonly preferenceSvc: NotificationPreferenceService;
	private readonly templateSvc: NotificationTemplateService;
	private readonly deliveryRepo: NotificationDeliveryRepository;
	private readonly pushSubRepo: PushSubscriptionRepository;
	private readonly parentNotifRepo: ParentNotificationRepository;
	private readonly userModelRef: typeof UserModel;
	private readonly logger: Pick<Console, "error" | "warn" | "info">;
	private readonly maxRetries: number;
	private readonly baseRetryDelayMinutes: number;

	constructor(dependencies: NotificationServiceDependencies = {}) {
		this.emailSvc = dependencies.emailService ?? emailService;
		this.smsSvc = dependencies.smsService ?? smsService;
		this.pushSvc = dependencies.pushService ?? new ConsolePushService();
		this.preferenceSvc = dependencies.preferenceService ?? notificationPreferenceService;
		this.templateSvc = dependencies.templateService ?? notificationTemplateService;
		this.deliveryRepo = dependencies.deliveryRepo ?? notificationDeliveryRepository;
		this.pushSubRepo = dependencies.pushSubscriptionRepo ?? pushSubscriptionRepository;
		this.parentNotifRepo = dependencies.parentNotificationRepo ?? parentNotificationRepo;
		this.userModelRef = dependencies.userModel ?? UserModel;
		this.logger = dependencies.logger ?? console;
		this.maxRetries = dependencies.maxRetries ?? DEFAULT_MAX_RETRIES;
		this.baseRetryDelayMinutes = dependencies.baseRetryDelayMinutes ?? DEFAULT_BASE_RETRY_DELAY_MINUTES;
	}

	/**
	 * Send a notification through the specified channels.
	 *
	 * Multi-channel dispatch:
	 * 1. Idempotency check — if idempotency_key exists, return existing delivery
	 * 2. Resolve effective channels via notification-preference.service
	 * 3. Render template via notification-template.service
	 * 4. Dispatch to all effective channels in parallel (Promise.allSettled)
	 * 5. Record channel_results, compute overall status (worst-case)
	 * 6. Set next_retry_at for failed channels (exponential backoff)
	 * 7. Backward compat: mirror in_app to ParentNotification for parent recipients
	 */
	public async send(input: SendNotificationInput): Promise<NotificationDispatchResult> {
		// ── Idempotency check ──────────────────────────────────────────────
		if (input.idempotency_key) {
			const existing = await this.deliveryRepo.findByIdempotencyKey(input.idempotency_key);
			if (existing) {
				return {
					delivery_id: existing._id.toString(),
					channel_results: existing.channel_results as ChannelResult[],
				};
			}
		}

		// ── Resolve effective channels ─────────────────────────────────────
		let effectiveChannels: NotificationChannel[] = [...input.channels];

		if (input.recipient.user_id) {
			try {
				effectiveChannels = await this.preferenceSvc.resolveEffectiveChannels({
					userId: input.recipient.user_id,
					requestedChannels: input.channels,
					severity: input.severity,
				});
			} catch (error) {
				this.logger.warn("[notification] Failed to resolve preferences, using requested channels", {
					userId: input.recipient.user_id,
					error: error instanceof Error ? error.message : "unknown",
				});
				// Fall back to requested channels if preference resolution fails
			}
		}

		// If no effective channels, mark all as skipped
		if (effectiveChannels.length === 0) {
			effectiveChannels = ["in_app"];
		}

		// ── Render template ────────────────────────────────────────────────
		let rendered: RenderedTemplateOutput | null = null;
		try {
			rendered = await this.templateSvc.render(
				input.template_id,
				this.buildTemplateVariables(input.payload),
			);
		} catch (error) {
			this.logger.warn("[notification] Template render failed, using payload fallback", {
				template_id: input.template_id,
				error: error instanceof Error ? error.message : "unknown",
			});
			// Continue with null rendered — dispatch methods will use payload fallback
		}

		// ── Persist initial delivery record ────────────────────────────────
		const delivery = await this.deliveryRepo.create({
			type: input.type,
			recipient: {
				user_id: input.recipient.user_id ? new mongoose.Types.ObjectId(input.recipient.user_id) : null,
				email: input.recipient.email ?? null,
				phone: input.recipient.phone ?? null,
			} as any,
			channels: effectiveChannels,
			channel_results: [],
			status: "queued",
			template_id: input.template_id,
			idempotency_key: input.idempotency_key ?? null,
			retry_count: 0,
			next_retry_at: null,
			metadata: input.metadata ?? null,
		} as Partial<INotificationDelivery>);

		// ── Dispatch to all channels in parallel ───────────────────────────
		const dispatchPromises = effectiveChannels.map((channel) =>
			this.dispatchChannel(channel, input, rendered),
		);

		const settledResults = await Promise.allSettled(dispatchPromises);

		const channelResults: ChannelResult[] = settledResults.map((result, index) => {
			if (result.status === "fulfilled") {
				return result.value;
			}
			// Promise rejected — treat as failed
			const error = result.reason instanceof Error ? result.reason.message : "unknown_error";
			return {
				channel: effectiveChannels[index],
				status: "failed" as const,
				provider_message_id: null,
				error_code: this.sanitizeErrorCode(error),
			};
		});

		// ── Determine overall status (worst-case) ──────────────────────────
		const overallStatus = this.computeOverallStatus(channelResults);

		// ── Compute next_retry_at for failed channels ──────────────────────
		const hasFailedChannel = channelResults.some((r) => r.status === "failed");
		let nextRetryAt: Date | null = null;
		if (hasFailedChannel) {
			const retryCount = (delivery as any).retry_count ?? 0;
			nextRetryAt = this.computeNextRetryAt(retryCount);
		}

		// ── Update delivery record ─────────────────────────────────────────
		await this.deliveryRepo.model.findByIdAndUpdate(delivery._id, {
			channel_results: channelResults,
			status: overallStatus,
			next_retry_at: nextRetryAt,
		});

		// ── Backward compat: mirror in_app to ParentNotification ───────────
		const inAppResult = channelResults.find((r) => r.channel === "in_app" && r.status === "sent");
		if (inAppResult && input.recipient.user_id) {
			await this.mirrorToParentNotificationIfNeeded(input, rendered);
		}

		return {
			delivery_id: delivery._id.toString(),
			channel_results: channelResults,
		};
	}

	/**
	 * Retry a previously failed delivery.
	 * Re-dispatches only channels with status="failed".
	 * Increments retry_count and updates next_retry_at.
	 */
	public async retryFailed(deliveryId: string): Promise<NotificationDispatchResult | null> {
		const delivery = await this.deliveryRepo.findById(deliveryId);
		if (!delivery) {
			this.logger.warn(`[notification] retryFailed: delivery ${deliveryId} not found`);
			return null;
		}

		if (delivery.retry_count >= this.maxRetries) {
			this.logger.info(`[notification] retryFailed: delivery ${deliveryId} exceeded max retries`);
			return null;
		}

		// Find failed channels
		const failedChannels = delivery.channel_results
			.filter((r) => r.status === "failed")
			.map((r) => r.channel as NotificationChannel);

		if (failedChannels.length === 0) {
			return {
				delivery_id: delivery._id.toString(),
				channel_results: delivery.channel_results as ChannelResult[],
			};
		}

		// Reconstruct input from delivery
		const input: SendNotificationInput = {
			type: delivery.type as NotificationDispatchType,
			recipient: {
				user_id: delivery.recipient.user_id?.toString() ?? null,
				email: delivery.recipient.email ?? null,
				phone: delivery.recipient.phone ?? null,
			},
			channels: failedChannels,
			payload: (delivery.metadata as Record<string, unknown>) ?? {},
			template_id: delivery.template_id,
		};

		// Render template
		let rendered: RenderedTemplateOutput | null = null;
		try {
			rendered = await this.templateSvc.render(
				input.template_id,
				this.buildTemplateVariables(input.payload),
			);
		} catch {
			// Continue with null rendered
		}

		// Re-dispatch failed channels in parallel
		const dispatchPromises = failedChannels.map((channel) =>
			this.dispatchChannel(channel, input, rendered),
		);

		const settledResults = await Promise.allSettled(dispatchPromises);

		const retryResults: ChannelResult[] = settledResults.map((result, index) => {
			if (result.status === "fulfilled") {
				return result.value;
			}
			const error = result.reason instanceof Error ? result.reason.message : "unknown_error";
			return {
				channel: failedChannels[index],
				status: "failed" as const,
				provider_message_id: null,
				error_code: this.sanitizeErrorCode(error),
			};
		});

		// Merge with existing results: replace failed channels with new results
		const updatedResults: ChannelResult[] = delivery.channel_results.map((existing) => {
			const retryResult = retryResults.find((r) => r.channel === existing.channel);
			if (retryResult) return retryResult;
			return existing as ChannelResult;
		});

		const newRetryCount = delivery.retry_count + 1;
		const overallStatus = this.computeOverallStatus(updatedResults);
		const stillHasFailure = updatedResults.some((r) => r.status === "failed");
		const nextRetryAt = stillHasFailure && newRetryCount < this.maxRetries
			? this.computeNextRetryAt(newRetryCount)
			: null;

		await this.deliveryRepo.model.findByIdAndUpdate(delivery._id, {
			channel_results: updatedResults,
			status: overallStatus,
			retry_count: newRetryCount,
			next_retry_at: nextRetryAt,
		});

		return {
			delivery_id: delivery._id.toString(),
			channel_results: updatedResults,
		};
	}

	/**
	 * Get a delivery record by ID.
	 */
	public async getDelivery(deliveryId: string): Promise<INotificationDelivery | null> {
		return this.deliveryRepo.findById(deliveryId);
	}

	// ── Private helpers ────────────────────────────────────────────────────

	/**
	 * Dispatch a single channel.
	 */
	private async dispatchChannel(
		channel: NotificationChannel,
		input: SendNotificationInput,
		rendered: RenderedTemplateOutput | null,
	): Promise<ChannelResult> {
		switch (channel) {
			case "email":
				return this.dispatchEmail(input, rendered);
			case "sms":
				return this.dispatchSms(input, rendered);
			case "push":
				return this.dispatchPush(input, rendered);
			case "in_app":
				return this.dispatchInApp(input, rendered);
			default:
				return {
					channel,
					status: "skipped",
					provider_message_id: null,
					error_code: "unsupported_channel",
				};
		}
	}

	/**
	 * Dispatch via email using email.service.sendTemplated.
	 */
	private async dispatchEmail(
		input: SendNotificationInput,
		rendered: RenderedTemplateOutput | null,
	): Promise<ChannelResult> {
		const recipientEmail = input.recipient.email;
		if (!recipientEmail) {
			return {
				channel: "email",
				status: "skipped",
				provider_message_id: null,
				error_code: "no_recipient_email",
			};
		}

		try {
			const emailContent = rendered?.email;
			const subject = emailContent?.subject
				?? (input.payload.subject as string)
				?? `MathAI — ${input.type}`;
			const text = emailContent?.text
				?? (input.payload.text as string)
				?? (input.payload.body as string)
				?? "";
			const html = emailContent?.html ?? undefined;

			const result = await this.emailSvc.sendTemplated({
				template_id: input.template_id,
				to: recipientEmail,
				vars: input.payload as Record<string, unknown>,
				subject,
				text,
				html,
			});

			if (result.success) {
				return {
					channel: "email",
					status: "sent",
					provider_message_id: result.provider_message_id,
					error_code: null,
				};
			}

			return {
				channel: "email",
				status: "failed",
				provider_message_id: null,
				error_code: result.error_code ?? "delivery_failed",
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "unknown_error";
			this.logger.error("[notification] email dispatch failed", {
				type: input.type,
				recipient: recipientEmail,
				error: errorMessage,
			});

			return {
				channel: "email",
				status: "failed",
				provider_message_id: null,
				error_code: this.sanitizeErrorCode(errorMessage),
			};
		}
	}

	/**
	 * Dispatch via SMS using sms.service.sendSMS.
	 */
	private async dispatchSms(
		input: SendNotificationInput,
		rendered: RenderedTemplateOutput | null,
	): Promise<ChannelResult> {
		const recipientPhone = input.recipient.phone;
		if (!recipientPhone) {
			return {
				channel: "sms",
				status: "skipped",
				provider_message_id: null,
				error_code: "no_recipient_phone",
			};
		}

		try {
			const smsContent = rendered?.sms;
			const text = smsContent?.text
				?? (input.payload.sms_text as string)
				?? (input.payload.text as string)
				?? `MathAI: ${input.type}`;

			const result = await this.smsSvc.sendSMS(recipientPhone, text);

			return {
				channel: "sms",
				status: "sent",
				provider_message_id: result.provider_message_id,
				error_code: null,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "unknown_error";
			this.logger.error("[notification] sms dispatch failed", {
				type: input.type,
				recipient: recipientPhone,
				error: errorMessage,
			});

			return {
				channel: "sms",
				status: "failed",
				provider_message_id: null,
				error_code: this.sanitizeErrorCode(errorMessage),
			};
		}
	}

	/**
	 * Dispatch via push using push.service.sendToSubscriptions.
	 * Fans out to all active PushSubscriptions for the recipient user.
	 * Deactivates invalid tokens reported by the push service.
	 */
	private async dispatchPush(
		input: SendNotificationInput,
		rendered: RenderedTemplateOutput | null,
	): Promise<ChannelResult> {
		const userId = input.recipient.user_id;
		if (!userId) {
			return {
				channel: "push",
				status: "skipped",
				provider_message_id: null,
				error_code: "no_recipient_user_id",
			};
		}

		try {
			// Get active push subscriptions for the user
			const subscriptions = await this.pushSubRepo.findActiveByUserId(userId);

			if (subscriptions.length === 0) {
				return {
					channel: "push",
					status: "skipped",
					provider_message_id: null,
					error_code: "no_push_subscriptions",
				};
			}

			const pushContent = rendered?.push;
			const title = pushContent?.title
				?? (input.payload.push_title as string)
				?? `MathAI`;
			const body = pushContent?.body
				?? (input.payload.push_body as string)
				?? (input.payload.text as string)
				?? input.type;

			const subPayload = subscriptions.map((sub) => ({
				endpoint: sub.endpoint,
				keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
			}));

			const result = await this.pushSvc.sendToSubscriptions(subPayload, {
				title,
				body,
				data: { type: input.type, ...(input.metadata ?? {}) },
			});

			// Deactivate invalid tokens (Requirement 8.5)
			if (result.invalid_tokens.length > 0) {
				await this.pushSubRepo.deactivateByEndpoints(result.invalid_tokens);
			}

			if (result.sent.length > 0) {
				return {
					channel: "push",
					status: "sent",
					provider_message_id: result.sent[0] ?? null,
					error_code: null,
				};
			}

			// All subscriptions were invalid
			return {
				channel: "push",
				status: "failed",
				provider_message_id: null,
				error_code: "all_subscriptions_invalid",
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "unknown_error";
			this.logger.error("[notification] push dispatch failed", {
				type: input.type,
				userId,
				error: errorMessage,
			});

			return {
				channel: "push",
				status: "failed",
				provider_message_id: null,
				error_code: this.sanitizeErrorCode(errorMessage),
			};
		}
	}

	/**
	 * Dispatch in_app notification.
	 * Creates a ParentNotification record for parent recipients (backward compat).
	 * For non-parent users, marks as sent (in_app is handled by the delivery record itself).
	 */
	private async dispatchInApp(
		input: SendNotificationInput,
		rendered: RenderedTemplateOutput | null,
	): Promise<ChannelResult> {
		try {
			const inAppContent = rendered?.in_app;
			const title = inAppContent?.title
				?? (input.payload.title as string)
				?? `MathAI — ${input.type}`;
			const content = inAppContent?.content
				?? (input.payload.content as string)
				?? (input.payload.text as string)
				?? "";

			// in_app is always "sent" — the delivery record itself serves as the in-app notification
			return {
				channel: "in_app",
				status: "sent",
				provider_message_id: null,
				error_code: null,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "unknown_error";
			this.logger.error("[notification] in_app dispatch failed", {
				type: input.type,
				error: errorMessage,
			});

			return {
				channel: "in_app",
				status: "failed",
				provider_message_id: null,
				error_code: this.sanitizeErrorCode(errorMessage),
			};
		}
	}

	/**
	 * Mirror in_app notification to ParentNotification model when recipient is a parent.
	 * This maintains backward compatibility with the existing parent notifications page.
	 */
	private async mirrorToParentNotificationIfNeeded(
		input: SendNotificationInput,
		rendered: RenderedTemplateOutput | null,
	): Promise<void> {
		const userId = input.recipient.user_id;
		if (!userId) return;

		try {
			// Check if user is a parent
			const user = await this.userModelRef.findById(userId).select("role").lean();
			if (!user || user.role !== "parent") return;

			const inAppContent = rendered?.in_app;
			const title = inAppContent?.title
				?? (input.payload.title as string)
				?? `MathAI — ${input.type}`;
			const content = inAppContent?.content
				?? (input.payload.content as string)
				?? (input.payload.text as string)
				?? "";
			const severity = inAppContent?.severity
				?? (input.payload.severity as string)
				?? "info";

			// Determine student_id from payload (if available)
			const studentId = (input.payload.student_id as string)
				?? (input.metadata?.student_id as string)
				?? null;

			if (!studentId) {
				// Cannot create ParentNotification without student_id
				this.logger.info("[notification] Skipping ParentNotification mirror: no student_id in payload");
				return;
			}

			await this.parentNotifRepo.create({
				parent_user_id: new mongoose.Types.ObjectId(userId),
				student_id: new mongoose.Types.ObjectId(studentId),
				type: input.type,
				title,
				content,
				payload: input.payload,
				severity,
				is_read: false,
				read_at: null,
				channel: "in_app",
				delivered_at: new Date(),
			} as any);
		} catch (error) {
			// Non-critical: log and continue — don't fail the notification dispatch
			this.logger.warn("[notification] Failed to mirror to ParentNotification", {
				userId,
				type: input.type,
				error: error instanceof Error ? error.message : "unknown",
			});
		}
	}

	/**
	 * Compute overall delivery status from channel results.
	 * Worst-case ordering: sent < skipped < failed
	 * - If any channel failed → "failed"
	 * - If no failed but any skipped → "skipped"  
	 * - If all sent → "sent"
	 */
	private computeOverallStatus(results: ChannelResult[]): "sent" | "failed" | "skipped" {
		if (results.length === 0) return "skipped";

		const hasFailure = results.some((r) => r.status === "failed");
		if (hasFailure) return "failed";

		const hasSkipped = results.some((r) => r.status === "skipped");
		if (hasSkipped) return "skipped";

		return "sent";
	}

	/**
	 * Compute next_retry_at using exponential backoff.
	 * Formula: now + (retry_count + 1) * baseRetryDelayMinutes minutes
	 * E.g., with base=5min: 5min, 10min, 15min, ...
	 */
	private computeNextRetryAt(retryCount: number): Date {
		const delayMinutes = (retryCount + 1) * this.baseRetryDelayMinutes;
		const nextRetry = new Date();
		nextRetry.setMinutes(nextRetry.getMinutes() + delayMinutes);
		return nextRetry;
	}

	/**
	 * Build template variables from payload.
	 * Converts all values to strings for Mustache-style interpolation.
	 */
	private buildTemplateVariables(payload: Record<string, unknown>): Record<string, string> {
		const vars: Record<string, string> = {};
		for (const [key, value] of Object.entries(payload)) {
			if (value !== null && value !== undefined) {
				vars[key] = String(value);
			}
		}
		return vars;
	}

	/**
	 * Sanitize error messages to avoid leaking provider internals.
	 */
	private sanitizeErrorCode(message: string): string {
		if (/timed? ?out/i.test(message)) return "timeout";
		if (/status \d{3}/i.test(message)) return "provider_error";
		if (/network/i.test(message)) return "network_error";
		return "dispatch_failed";
	}
}

// ── Singleton export ───────────────────────────────────────────────────

export const notificationService = new NotificationService();

export default notificationService;
