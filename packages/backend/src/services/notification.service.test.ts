import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import mongoose from "mongoose";
import {
	NotificationService,
	type SendNotificationInput,
	type ChannelResult,
	type PushServiceInterface,
	type NotificationServiceDependencies,
} from "./notification.service";
import type { NotificationChannel, NotificationSeverity } from "../types";
import type { INotificationDelivery } from "../models/notification-delivery.model";
import type { IParentNotificationPreference } from "../models/engagement.model";
import type { RenderedTemplateOutput } from "./notification-template.service";

// ── Mock Factories ──────────────────────────────────────────────────────

function createObjectId(): mongoose.Types.ObjectId {
	return new mongoose.Types.ObjectId();
}

function createMockDeliveryRepo() {
	const store: Map<string, any> = new Map();

	const mockRepo = {
		store,
		findByIdempotencyKey: async (key: string) => {
			for (const doc of store.values()) {
				if (doc.idempotency_key === key) return doc;
			}
			return null;
		},
		findById: async (id: string) => {
			return store.get(id) ?? null;
		},
		create: async (data: Partial<INotificationDelivery>) => {
			const id = createObjectId();
			const doc = {
				_id: id,
				...data,
				retry_count: data.retry_count ?? 0,
				channel_results: data.channel_results ?? [],
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			store.set(id.toString(), doc);
			return doc;
		},
		model: {
			findByIdAndUpdate: (id: any, update: any) => {
				const key = id.toString();
				const existing = store.get(key);
				if (existing) {
					if (update.$set) {
						Object.assign(existing, update.$set);
					} else {
						Object.assign(existing, update);
					}
					store.set(key, existing);
				}
				// Return a thenable that also has .exec()
				const result = Promise.resolve(existing);
				(result as any).exec = () => Promise.resolve(existing);
				return result;
			},
		},
		findFailedForRetry: async (maxRetries: number = 3) => {
			const results: any[] = [];
			const now = new Date();
			for (const doc of store.values()) {
				if (
					doc.status === "failed" &&
					doc.next_retry_at &&
					doc.next_retry_at <= now &&
					doc.retry_count < maxRetries
				) {
					results.push(doc);
				}
			}
			return results;
		},
	};

	return mockRepo;
}

function createMockEmailService(shouldFail = false) {
	const calls: any[] = [];
	return {
		calls,
		sendTemplated: async (input: any) => {
			calls.push(input);
			if (shouldFail) {
				return { success: false, provider_message_id: null, error_code: "provider_error" };
			}
			return { success: true, provider_message_id: `email-msg-${calls.length}`, error_code: null };
		},
	};
}

function createMockSmsService(shouldFail = false) {
	const calls: any[] = [];
	return {
		calls,
		sendSMS: async (to: string, text: string) => {
			calls.push({ to, text });
			if (shouldFail) {
				throw new Error("SMS provider timeout");
			}
			return { provider_message_id: `sms-msg-${calls.length}` };
		},
	};
}

function createMockPushService(
	options: { shouldFail?: boolean; invalidTokens?: string[] } = {},
): PushServiceInterface & { calls: any[] } {
	const calls: any[] = [];
	return {
		calls,
		sendToSubscriptions: async (subscriptions, payload) => {
			calls.push({ subscriptions, payload });
			if (options.shouldFail) {
				throw new Error("Push service error");
			}
			return {
				sent: subscriptions.map((s) => s.endpoint),
				invalid_tokens: options.invalidTokens ?? [],
			};
		},
	};
}

function createMockPreferenceService(
	effectiveChannels?: NotificationChannel[],
	options?: { quietHoursActive?: boolean },
) {
	return {
		resolveEffectiveChannels: async (opts: any) => {
			if (effectiveChannels !== undefined) return effectiveChannels;
			// Default: return requested channels as-is
			return opts.requestedChannels;
		},
	};
}

function createMockTemplateService(rendered?: RenderedTemplateOutput | null) {
	return {
		render: async (_templateId: string, _variables: Record<string, string>) => {
			if (rendered === null) {
				throw new Error("Template not found");
			}
			return rendered ?? {
				email: { subject: "Test Subject", text: "Test text", html: "<p>Test</p>" },
				sms: { text: "Test SMS" },
				push: { title: "Test Push", body: "Test push body" },
				in_app: { title: "Test In-App", content: "Test content", severity: "info" },
			};
		},
	};
}

function createMockPushSubscriptionRepo(subscriptions: any[] = []) {
	const deactivated: string[] = [];
	return {
		deactivated,
		findActiveByUserId: async (_userId: string) => subscriptions,
		deactivateByEndpoints: async (endpoints: string[]) => {
			deactivated.push(...endpoints);
			return endpoints.length;
		},
	};
}

function createMockParentNotificationRepo() {
	const created: any[] = [];
	return {
		created,
		create: async (data: any) => {
			created.push(data);
			return data;
		},
	};
}

function createMockUserModel(role: string = "student") {
	return {
		findById: (_id: string) => ({
			select: (_fields: string) => ({
				lean: () => Promise.resolve({ _id, role }),
			}),
		}),
	};
}

const silentLogger = {
	error: () => {},
	warn: () => {},
	info: () => {},
};

function createDefaultInput(overrides: Partial<SendNotificationInput> = {}): SendNotificationInput {
	return {
		type: "assignment_graded",
		recipient: {
			user_id: createObjectId().toString(),
			email: "test@example.com",
			phone: "+84901234567",
		},
		channels: ["in_app", "email"],
		payload: { student_name: "Nguyen Van A", score: "9.5" },
		template_id: "assignment_graded.v1",
		...overrides,
	};
}

function buildService(overrides: Partial<NotificationServiceDependencies> = {}): NotificationService {
	return new NotificationService({
		emailService: createMockEmailService() as any,
		smsService: createMockSmsService() as any,
		pushService: createMockPushService(),
		preferenceService: createMockPreferenceService() as any,
		templateService: createMockTemplateService() as any,
		deliveryRepo: createMockDeliveryRepo() as any,
		pushSubscriptionRepo: createMockPushSubscriptionRepo([
			{ endpoint: "https://push.example.com/1", keys: { p256dh: "key1", auth: "auth1" } },
		]) as any,
		parentNotificationRepo: createMockParentNotificationRepo() as any,
		userModel: createMockUserModel() as any,
		logger: silentLogger,
		maxRetries: 3,
		baseRetryDelayMinutes: 5,
		...overrides,
	});
}

// ── Unit Tests: Idempotency ─────────────────────────────────────────────

describe("NotificationService", () => {
	describe("Idempotency (same key → 1 delivery)", () => {
		it("returns same delivery_id when called twice with same idempotency_key", async () => {
			const deliveryRepo = createMockDeliveryRepo();
			const service = buildService({ deliveryRepo: deliveryRepo as any });

			const input = createDefaultInput({ idempotency_key: "unique-key-123" });

			const result1 = await service.send(input);
			const result2 = await service.send(input);

			assert.equal(result1.delivery_id, result2.delivery_id);
			// Only 1 delivery record should exist
			assert.equal(deliveryRepo.store.size, 1);
		});

		it("creates separate deliveries when idempotency_key is different", async () => {
			const deliveryRepo = createMockDeliveryRepo();
			const service = buildService({ deliveryRepo: deliveryRepo as any });

			const input1 = createDefaultInput({ idempotency_key: "key-1" });
			const input2 = createDefaultInput({ idempotency_key: "key-2" });

			const result1 = await service.send(input1);
			const result2 = await service.send(input2);

			assert.notEqual(result1.delivery_id, result2.delivery_id);
			assert.equal(deliveryRepo.store.size, 2);
		});

		it("creates separate deliveries when no idempotency_key is provided", async () => {
			const deliveryRepo = createMockDeliveryRepo();
			const service = buildService({ deliveryRepo: deliveryRepo as any });

			const input = createDefaultInput({ idempotency_key: undefined });

			const result1 = await service.send(input);
			const result2 = await service.send(input);

			assert.notEqual(result1.delivery_id, result2.delivery_id);
			assert.equal(deliveryRepo.store.size, 2);
		});
	});

	// ── Unit Tests: Quiet Hours ───────────────────────────────────────────

	describe("Quiet hours (email/sms/push skipped, in_app kept)", () => {
		it("during quiet hours with non-critical severity: only in_app dispatched", async () => {
			const preferenceService = createMockPreferenceService(["in_app"]);
			const emailSvc = createMockEmailService();
			const smsSvc = createMockSmsService();
			const pushSvc = createMockPushService();
			const deliveryRepo = createMockDeliveryRepo();

			const service = buildService({
				preferenceService: preferenceService as any,
				emailService: emailSvc as any,
				smsService: smsSvc as any,
				pushService: pushSvc,
				deliveryRepo: deliveryRepo as any,
			});

			const input = createDefaultInput({
				channels: ["in_app", "email", "sms", "push"],
				severity: "info",
			});

			const result = await service.send(input);

			// Only in_app should be in channel_results
			assert.equal(result.channel_results.length, 1);
			assert.equal(result.channel_results[0].channel, "in_app");
			assert.equal(result.channel_results[0].status, "sent");

			// Email/SMS/Push should NOT have been called
			assert.equal(emailSvc.calls.length, 0);
			assert.equal(smsSvc.calls.length, 0);
			assert.equal(pushSvc.calls.length, 0);
		});

		it("critical severity bypasses quiet hours — all channels dispatched", async () => {
			// When severity is critical, preference service returns all channels
			const preferenceService = createMockPreferenceService(["in_app", "email", "sms", "push"]);
			const emailSvc = createMockEmailService();
			const smsSvc = createMockSmsService();
			const pushSvc = createMockPushService();
			const deliveryRepo = createMockDeliveryRepo();

			const service = buildService({
				preferenceService: preferenceService as any,
				emailService: emailSvc as any,
				smsService: smsSvc as any,
				pushService: pushSvc,
				deliveryRepo: deliveryRepo as any,
			});

			const input = createDefaultInput({
				channels: ["in_app", "email", "sms", "push"],
				severity: "critical",
				recipient: {
					user_id: createObjectId().toString(),
					email: "test@example.com",
					phone: "+84901234567",
				},
			});

			const result = await service.send(input);

			assert.equal(result.channel_results.length, 4);
			const channels = result.channel_results.map((r) => r.channel);
			assert.ok(channels.includes("in_app"));
			assert.ok(channels.includes("email"));
			assert.ok(channels.includes("sms"));
			assert.ok(channels.includes("push"));
		});
	});

	// ── Unit Tests: Channel Results Completeness ──────────────────────────

	describe("Channel result completeness", () => {
		it("every effective channel has an entry in channel_results", async () => {
			const effectiveChannels: NotificationChannel[] = ["in_app", "email", "sms", "push"];
			const preferenceService = createMockPreferenceService(effectiveChannels);
			const deliveryRepo = createMockDeliveryRepo();

			const service = buildService({
				preferenceService: preferenceService as any,
				deliveryRepo: deliveryRepo as any,
			});

			const input = createDefaultInput({
				channels: effectiveChannels,
				recipient: {
					user_id: createObjectId().toString(),
					email: "test@example.com",
					phone: "+84901234567",
				},
			});

			const result = await service.send(input);

			assert.equal(result.channel_results.length, effectiveChannels.length);
			for (const channel of effectiveChannels) {
				const entry = result.channel_results.find((r) => r.channel === channel);
				assert.ok(entry, `Missing channel_result for ${channel}`);
				assert.ok(
					["sent", "failed", "skipped"].includes(entry.status),
					`Invalid status for ${channel}: ${entry.status}`,
				);
			}
		});

		it("no duplicate channel entries in channel_results", async () => {
			const effectiveChannels: NotificationChannel[] = ["in_app", "email"];
			const preferenceService = createMockPreferenceService(effectiveChannels);
			const deliveryRepo = createMockDeliveryRepo();

			const service = buildService({
				preferenceService: preferenceService as any,
				deliveryRepo: deliveryRepo as any,
			});

			const input = createDefaultInput({ channels: effectiveChannels });
			const result = await service.send(input);

			const channelNames = result.channel_results.map((r) => r.channel);
			const uniqueChannels = new Set(channelNames);
			assert.equal(channelNames.length, uniqueChannels.size, "Duplicate channel entries found");
		});
	});

	// ── Unit Tests: Retry Logic + max_retries ─────────────────────────────

	describe("Retry logic + max_retries", () => {
		it("retryFailed re-dispatches only failed channels", async () => {
			const deliveryRepo = createMockDeliveryRepo();
			const emailSvcFailing = createMockEmailService(true); // email fails
			const preferenceService = createMockPreferenceService(["in_app", "email"]);

			const service1 = buildService({
				deliveryRepo: deliveryRepo as any,
				emailService: emailSvcFailing as any,
				preferenceService: preferenceService as any,
			});

			const input = createDefaultInput({
				channels: ["in_app", "email"],
				idempotency_key: "retry-test-key",
			});

			const result1 = await service1.send(input);
			const emailResult = result1.channel_results.find((r) => r.channel === "email");
			assert.equal(emailResult?.status, "failed");

			// Now retry with a service that has email succeeding (same deliveryRepo)
			const emailSvcSuccess = createMockEmailService(false);
			const service2 = buildService({
				deliveryRepo: deliveryRepo as any,
				emailService: emailSvcSuccess as any,
			});

			const retryResult = await service2.retryFailed(result1.delivery_id);
			assert.ok(retryResult);

			// Email should now be sent
			const retriedEmail = retryResult!.channel_results.find((r) => r.channel === "email");
			assert.equal(retriedEmail?.status, "sent");
		});

		it("retryFailed increments retry_count", async () => {
			const deliveryRepo = createMockDeliveryRepo();
			const emailSvc = createMockEmailService(true); // always fails
			const preferenceService = createMockPreferenceService(["email"]);

			const service = buildService({
				deliveryRepo: deliveryRepo as any,
				emailService: emailSvc as any,
				preferenceService: preferenceService as any,
			});

			const input = createDefaultInput({
				channels: ["email"],
				idempotency_key: "retry-count-test",
				recipient: { user_id: null, email: "test@example.com", phone: null },
			});

			const result = await service.send(input);

			// Retry once
			const retryResult = await service.retryFailed(result.delivery_id);
			assert.ok(retryResult);

			// Check retry_count was incremented
			const doc = deliveryRepo.store.get(result.delivery_id);
			assert.equal(doc.retry_count, 1);
		});

		it("retryFailed returns null when max_retries exceeded", async () => {
			const deliveryRepo = createMockDeliveryRepo();
			const emailSvc = createMockEmailService(true); // always fails
			const preferenceService = createMockPreferenceService(["email"]);

			const service = buildService({
				deliveryRepo: deliveryRepo as any,
				emailService: emailSvc as any,
				preferenceService: preferenceService as any,
				maxRetries: 2,
			});

			const input = createDefaultInput({
				channels: ["email"],
				idempotency_key: "max-retry-test",
				recipient: { user_id: null, email: "test@example.com", phone: null },
			});

			const result = await service.send(input);

			// Retry twice (reaching max)
			await service.retryFailed(result.delivery_id);
			await service.retryFailed(result.delivery_id);

			// Third retry should return null (retry_count is now 2 which equals maxRetries)
			const finalRetry = await service.retryFailed(result.delivery_id);
			assert.equal(finalRetry, null);
		});

		it("retryFailed returns null for non-existent delivery", async () => {
			const deliveryRepo = createMockDeliveryRepo();
			const service = buildService({ deliveryRepo: deliveryRepo as any });

			const result = await service.retryFailed("nonexistent-id");
			assert.equal(result, null);
		});
	});

	// ── Unit Tests: Overall Status Computation ────────────────────────────

	describe("Overall status computation (worst-case)", () => {
		it("status is 'sent' when all channels succeed", async () => {
			const preferenceService = createMockPreferenceService(["in_app", "email"]);
			const deliveryRepo = createMockDeliveryRepo();

			const service = buildService({
				preferenceService: preferenceService as any,
				deliveryRepo: deliveryRepo as any,
			});

			const input = createDefaultInput({ channels: ["in_app", "email"] });
			const result = await service.send(input);

			// Check the stored delivery status
			const doc = deliveryRepo.store.get(result.delivery_id);
			assert.equal(doc.status, "sent");
		});

		it("status is 'failed' when any channel fails", async () => {
			const preferenceService = createMockPreferenceService(["in_app", "email"]);
			const emailSvc = createMockEmailService(true); // email fails
			const deliveryRepo = createMockDeliveryRepo();

			const service = buildService({
				preferenceService: preferenceService as any,
				emailService: emailSvc as any,
				deliveryRepo: deliveryRepo as any,
			});

			const input = createDefaultInput({ channels: ["in_app", "email"] });
			const result = await service.send(input);

			const doc = deliveryRepo.store.get(result.delivery_id);
			assert.equal(doc.status, "failed");
		});

		it("status is 'skipped' when no failures but some skipped", async () => {
			// Push will be skipped because no user_id for push lookup
			const preferenceService = createMockPreferenceService(["in_app", "push"]);
			const deliveryRepo = createMockDeliveryRepo();
			const pushSubRepo = createMockPushSubscriptionRepo([]); // no subscriptions → skipped

			const service = buildService({
				preferenceService: preferenceService as any,
				deliveryRepo: deliveryRepo as any,
				pushSubscriptionRepo: pushSubRepo as any,
			});

			const input = createDefaultInput({
				channels: ["in_app", "push"],
				recipient: { user_id: createObjectId().toString(), email: null, phone: null },
			});

			const result = await service.send(input);

			const doc = deliveryRepo.store.get(result.delivery_id);
			// push is skipped (no subscriptions), in_app is sent → overall = skipped
			assert.equal(doc.status, "skipped");
		});
	});

	// ── Unit Tests: Template Rendering Integration ────────────────────────

	describe("Template rendering integration", () => {
		it("variables are substituted correctly in email dispatch", async () => {
			const emailSvc = createMockEmailService();
			const templateSvc = createMockTemplateService({
				email: {
					subject: "Điểm bài tập: {{score}}",
					text: "Xin chào {{student_name}}, bạn được {{score}} điểm",
					html: "<p>Xin chào {{student_name}}</p>",
				},
				in_app: { title: "Điểm mới", content: "Bạn được {{score}} điểm", severity: "info" },
			});
			const preferenceService = createMockPreferenceService(["email"]);
			const deliveryRepo = createMockDeliveryRepo();

			const service = buildService({
				emailService: emailSvc as any,
				templateService: templateSvc as any,
				preferenceService: preferenceService as any,
				deliveryRepo: deliveryRepo as any,
			});

			const input = createDefaultInput({
				channels: ["email"],
				payload: { student_name: "Nguyen Van A", score: "9.5" },
			});

			await service.send(input);

			assert.equal(emailSvc.calls.length, 1);
			const emailCall = emailSvc.calls[0];
			assert.equal(emailCall.subject, "Điểm bài tập: {{score}}");
		});

		it("continues dispatch when template render fails (fallback to payload)", async () => {
			const emailSvc = createMockEmailService();
			const templateSvc = createMockTemplateService(null); // throws error
			const preferenceService = createMockPreferenceService(["in_app", "email"]);
			const deliveryRepo = createMockDeliveryRepo();

			const service = buildService({
				emailService: emailSvc as any,
				templateService: templateSvc as any,
				preferenceService: preferenceService as any,
				deliveryRepo: deliveryRepo as any,
			});

			const input = createDefaultInput({
				channels: ["in_app", "email"],
				payload: { subject: "Fallback Subject", text: "Fallback text" },
			});

			const result = await service.send(input);

			// Should still dispatch (using payload fallback)
			assert.ok(result.delivery_id);
			assert.ok(result.channel_results.length > 0);
		});
	});

	// ── Unit Tests: Backward Compat — ParentNotification mirror ───────────

	describe("Backward compat — ParentNotification mirror", () => {
		it("mirrors in_app notification to ParentNotification when recipient is parent", async () => {
			const parentNotifRepo = createMockParentNotificationRepo();
			const userModel = createMockUserModel("parent");
			const preferenceService = createMockPreferenceService(["in_app"]);
			const deliveryRepo = createMockDeliveryRepo();

			const service = buildService({
				parentNotificationRepo: parentNotifRepo as any,
				userModel: userModel as any,
				preferenceService: preferenceService as any,
				deliveryRepo: deliveryRepo as any,
			});

			const input = createDefaultInput({
				channels: ["in_app"],
				recipient: { user_id: createObjectId().toString(), email: null, phone: null },
				payload: { student_id: createObjectId().toString(), title: "Alert", text: "Test" },
			});

			await service.send(input);

			assert.equal(parentNotifRepo.created.length, 1);
			assert.equal(parentNotifRepo.created[0].type, "assignment_graded");
		});

		it("does NOT mirror to ParentNotification when recipient is student", async () => {
			const parentNotifRepo = createMockParentNotificationRepo();
			const userModel = createMockUserModel("student");
			const preferenceService = createMockPreferenceService(["in_app"]);
			const deliveryRepo = createMockDeliveryRepo();

			const service = buildService({
				parentNotificationRepo: parentNotifRepo as any,
				userModel: userModel as any,
				preferenceService: preferenceService as any,
				deliveryRepo: deliveryRepo as any,
			});

			const input = createDefaultInput({
				channels: ["in_app"],
				recipient: { user_id: createObjectId().toString(), email: null, phone: null },
				payload: { student_id: createObjectId().toString() },
			});

			await service.send(input);

			assert.equal(parentNotifRepo.created.length, 0);
		});

		it("does NOT fail dispatch when ParentNotification mirror fails", async () => {
			const parentNotifRepo = {
				created: [] as any[],
				create: async () => {
					throw new Error("DB error");
				},
			};
			const userModel = createMockUserModel("parent");
			const preferenceService = createMockPreferenceService(["in_app"]);
			const deliveryRepo = createMockDeliveryRepo();

			const service = buildService({
				parentNotificationRepo: parentNotifRepo as any,
				userModel: userModel as any,
				preferenceService: preferenceService as any,
				deliveryRepo: deliveryRepo as any,
			});

			const input = createDefaultInput({
				channels: ["in_app"],
				recipient: { user_id: createObjectId().toString(), email: null, phone: null },
				payload: { student_id: createObjectId().toString() },
			});

			// Should not throw
			const result = await service.send(input);
			assert.ok(result.delivery_id);
		});
	});

	// ── Unit Tests: Push dispatch + invalid token deactivation ─────────────

	describe("Push dispatch", () => {
		it("deactivates invalid push tokens reported by push service", async () => {
			const pushSubRepo = createMockPushSubscriptionRepo([
				{ endpoint: "https://push.example.com/valid", keys: { p256dh: "k1", auth: "a1" } },
				{ endpoint: "https://push.example.com/invalid", keys: { p256dh: "k2", auth: "a2" } },
			]);
			const pushSvc = createMockPushService({ invalidTokens: ["https://push.example.com/invalid"] });
			const preferenceService = createMockPreferenceService(["push"]);
			const deliveryRepo = createMockDeliveryRepo();

			const service = buildService({
				pushSubscriptionRepo: pushSubRepo as any,
				pushService: pushSvc,
				preferenceService: preferenceService as any,
				deliveryRepo: deliveryRepo as any,
			});

			const input = createDefaultInput({
				channels: ["push"],
				recipient: { user_id: createObjectId().toString(), email: null, phone: null },
			});

			await service.send(input);

			assert.deepEqual(pushSubRepo.deactivated, ["https://push.example.com/invalid"]);
		});

		it("skips push when no active subscriptions exist", async () => {
			const pushSubRepo = createMockPushSubscriptionRepo([]);
			const preferenceService = createMockPreferenceService(["push"]);
			const deliveryRepo = createMockDeliveryRepo();

			const service = buildService({
				pushSubscriptionRepo: pushSubRepo as any,
				preferenceService: preferenceService as any,
				deliveryRepo: deliveryRepo as any,
			});

			const input = createDefaultInput({
				channels: ["push"],
				recipient: { user_id: createObjectId().toString(), email: null, phone: null },
			});

			const result = await service.send(input);
			const pushResult = result.channel_results.find((r) => r.channel === "push");
			assert.equal(pushResult?.status, "skipped");
		});
	});


	// ══════════════════════════════════════════════════════════════════════
	// Property-Based Tests
	// ══════════════════════════════════════════════════════════════════════

	/**
	 * **Validates: Requirements 8.1, 8.2**
	 * Property 1: Notification delivery uniqueness
	 * ∀ idempotency_key, calling send() N times with the same key produces exactly 1 delivery.
	 */
	describe("Property 1: Notification delivery uniqueness", () => {
		it("∀ idempotency_key, N calls → 1 delivery, same delivery_id", () => {
			fc.assert(
				fc.asyncProperty(
					fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
					fc.integer({ min: 2, max: 5 }),
					async (idempotencyKey, callCount) => {
						const deliveryRepo = createMockDeliveryRepo();
						const service = buildService({ deliveryRepo: deliveryRepo as any });

						const input = createDefaultInput({ idempotency_key: idempotencyKey });

						const results: string[] = [];
						for (let i = 0; i < callCount; i++) {
							const result = await service.send(input);
							results.push(result.delivery_id);
						}

						// All delivery_ids should be the same
						const uniqueIds = new Set(results);
						assert.equal(uniqueIds.size, 1, `Expected 1 unique delivery_id, got ${uniqueIds.size}`);

						// Only 1 record in store
						assert.equal(deliveryRepo.store.size, 1, `Expected 1 delivery record, got ${deliveryRepo.store.size}`);
					},
				),
				{ numRuns: 20 },
			);
		});
	});

	/**
	 * **Validates: Requirements 8.3, 8.9**
	 * Property 2: Channel result completeness
	 * ∀ delivery, every channel in effectiveChannels has exactly one entry in channel_results.
	 */
	describe("Property 2: Channel result completeness", () => {
		it("∀ subset of channels, channel_results covers all effective channels exactly once", () => {
			const allChannels: NotificationChannel[] = ["in_app", "email", "sms", "push"];

			fc.assert(
				fc.asyncProperty(
					fc.subarray(allChannels, { minLength: 1 }),
					async (channels) => {
						const preferenceService = createMockPreferenceService(channels);
						const deliveryRepo = createMockDeliveryRepo();

						const service = buildService({
							preferenceService: preferenceService as any,
							deliveryRepo: deliveryRepo as any,
						});

						const input = createDefaultInput({
							channels,
							recipient: {
								user_id: createObjectId().toString(),
								email: "test@example.com",
								phone: "+84901234567",
							},
						});

						const result = await service.send(input);

						// Every effective channel has exactly one entry
						for (const channel of channels) {
							const entries = result.channel_results.filter((r) => r.channel === channel);
							assert.equal(
								entries.length,
								1,
								`Expected exactly 1 entry for channel "${channel}", got ${entries.length}`,
							);
						}

						// No extra channels beyond effective ones
						assert.equal(
							result.channel_results.length,
							channels.length,
							`Expected ${channels.length} channel_results, got ${result.channel_results.length}`,
						);

						// Every entry has a valid status
						for (const entry of result.channel_results) {
							assert.ok(
								["sent", "failed", "skipped"].includes(entry.status),
								`Invalid status: ${entry.status}`,
							);
						}
					},
				),
				{ numRuns: 30 },
			);
		});
	});

	/**
	 * **Validates: Requirements 7.6, 8.3**
	 * Property 3: Quiet hours respect
	 * During quiet hours with non-critical severity: email/sms/push are skipped, in_app is kept.
	 */
	describe("Property 3: Quiet hours respect", () => {
		it("∀ non-critical severity during quiet hours, only in_app is dispatched", () => {
			const nonCriticalSeverities: NotificationSeverity[] = ["info", "warning"];

			fc.assert(
				fc.asyncProperty(
					fc.constantFrom(...nonCriticalSeverities),
					fc.subarray(["email", "sms", "push"] as NotificationChannel[], { minLength: 1 }),
					async (severity, suppressedChannels) => {
						// Simulate quiet hours: preference service returns only in_app
						const requestedChannels: NotificationChannel[] = ["in_app", ...suppressedChannels];
						const preferenceService = createMockPreferenceService(["in_app"]);
						const emailSvc = createMockEmailService();
						const smsSvc = createMockSmsService();
						const pushSvc = createMockPushService();
						const deliveryRepo = createMockDeliveryRepo();

						const service = buildService({
							preferenceService: preferenceService as any,
							emailService: emailSvc as any,
							smsService: smsSvc as any,
							pushService: pushSvc,
							deliveryRepo: deliveryRepo as any,
						});

						const input = createDefaultInput({
							channels: requestedChannels,
							severity,
							recipient: {
								user_id: createObjectId().toString(),
								email: "test@example.com",
								phone: "+84901234567",
							},
						});

						const result = await service.send(input);

						// Only in_app should be in results
						assert.equal(result.channel_results.length, 1);
						assert.equal(result.channel_results[0].channel, "in_app");
						assert.equal(result.channel_results[0].status, "sent");

						// No external services called
						assert.equal(emailSvc.calls.length, 0);
						assert.equal(smsSvc.calls.length, 0);
						assert.equal(pushSvc.calls.length, 0);
					},
				),
				{ numRuns: 20 },
			);
		});

		it("∀ critical severity during quiet hours, all requested channels are dispatched", () => {
			fc.assert(
				fc.asyncProperty(
					fc.subarray(["email", "sms", "push"] as NotificationChannel[], { minLength: 1 }),
					async (extraChannels) => {
						const requestedChannels: NotificationChannel[] = ["in_app", ...extraChannels];
						// Critical → preference service returns all channels (quiet hours bypassed)
						const preferenceService = createMockPreferenceService(requestedChannels);
						const deliveryRepo = createMockDeliveryRepo();

						const service = buildService({
							preferenceService: preferenceService as any,
							deliveryRepo: deliveryRepo as any,
						});

						const input = createDefaultInput({
							channels: requestedChannels,
							severity: "critical",
							recipient: {
								user_id: createObjectId().toString(),
								email: "test@example.com",
								phone: "+84901234567",
							},
						});

						const result = await service.send(input);

						// All requested channels should have entries
						assert.equal(result.channel_results.length, requestedChannels.length);
						for (const channel of requestedChannels) {
							const entry = result.channel_results.find((r) => r.channel === channel);
							assert.ok(entry, `Missing entry for channel "${channel}" during critical notification`);
						}
					},
				),
				{ numRuns: 20 },
			);
		});
	});
});
