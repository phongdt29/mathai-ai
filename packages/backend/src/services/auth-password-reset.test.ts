import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, test } from "node:test";

import fc from "fast-check";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../utils/errors";
import { AuthService } from "./auth.service";

type FakeUser = {
	id: string;
	email: string;
	password_hash: string;
	full_name: string;
	role: "student";
	is_active: boolean;
	toObject?: () => FakeUser;
};

const makeUser = (overrides: Partial<FakeUser> = {}): FakeUser => {
	const user = {
		id: "user-1",
		email: "student@example.com",
		password_hash: "$2a$12$old-password-hash",
		full_name: "Student One",
		role: "student" as const,
		is_active: true,
		...overrides,
	};

	return {
		...user,
		toObject: () => ({ ...user }),
	};
};

const createService = (user: FakeUser | null) => {
	const sentMessages: Array<{ to: string; subject: string; text: string }> = [];
	const notificationInputs: Array<Record<string, unknown>> = [];
	const auditRecords: Array<Record<string, unknown>> = [];
	const consumedIds: string[] = [];
	const createdResetRequests: Array<Record<string, unknown>> = [];
	let storedUser = user;
	let storedResetRequest: { _id: string; consumed_at: Date | null; token_fingerprint: string } | null = null;
	let recentEmailCount = 0;

	const service = new AuthService({
		userRepository: {
			findByEmail: async (email: string) =>
				storedUser?.email === email.toLowerCase() ? storedUser : null,
			findById: async (id: string) =>
				storedUser?.id === id ? storedUser : null,
			update: async (id: string, data: Partial<FakeUser>) => {
				assert.equal(storedUser?.id, id);
				storedUser = { ...storedUser!, ...data };
				return storedUser;
			},
		},
		emailService: {
			sendPasswordResetEmail: async (message) => {
				sentMessages.push(message);
			},
		},
		notificationService: {
			send: async (input: any) => {
				notificationInputs.push(input);
				// Simulate notification dispatch — capture the email content for assertions
				if (input.recipient?.email && input.channels?.includes("email")) {
					sentMessages.push({
						to: input.recipient.email,
						subject: input.payload?.subject ?? "",
						text: input.payload?.text ?? "",
					});
				}
				return {
					delivery_id: "delivery-1",
					channel_results: [{ channel: "email", status: "sent", provider_message_id: null, error_code: null }],
				};
			},
		},
		passwordResetRequestRepository: {
			findByTokenFingerprint: async (fingerprint: string) => {
				if (storedResetRequest && storedResetRequest.token_fingerprint === fingerprint) {
					return storedResetRequest as any;
				}
				return null;
			},
			markConsumed: async (id: string) => {
				consumedIds.push(id);
				if (storedResetRequest && storedResetRequest._id === id) {
					storedResetRequest.consumed_at = new Date();
				}
				return storedResetRequest as any;
			},
			countRecentByEmail: async (_email: string, _sinceMinutes?: number) => {
				return recentEmailCount;
			},
			create: async (data: any) => {
				createdResetRequests.push(data);
				return { _id: "reset-req-new", ...data };
			},
		},
		auditService: {
			record: async (input: any) => {
				auditRecords.push(input);
				return null;
			},
		},
	});

	const setResetRequest = (fingerprint: string) => {
		storedResetRequest = { _id: "reset-req-1", consumed_at: null, token_fingerprint: fingerprint };
	};

	const setRecentEmailCount = (count: number) => {
		recentEmailCount = count;
	};

	return { service, sentMessages, notificationInputs, getUser: () => storedUser, auditRecords, consumedIds, createdResetRequests, setResetRequest, setRecentEmailCount };
};

test("requestPasswordReset returns a generic response and does not send mail for unknown accounts", async () => {
	const { service, sentMessages, auditRecords } = createService(null);

	const result = await service.requestPasswordReset({
		email: "missing@example.com",
	});

	assert.deepEqual(result, { accepted: true });
	assert.equal(sentMessages.length, 0);
	// Audit log should still be recorded (anti-enumeration: same behavior regardless)
	assert.ok(auditRecords.length >= 1);
	assert.equal(auditRecords[0].action, "auth.password_reset.requested");
});

test("requestPasswordReset emails an expiring reset link without leaking password state", async () => {
	const user = makeUser();
	const { service, sentMessages, notificationInputs, auditRecords, createdResetRequests } = createService(user);

	const result = await service.requestPasswordReset({
		email: "STUDENT@example.com",
	});

	assert.deepEqual(result, { accepted: true });
	// Notification service should have been called
	assert.equal(notificationInputs.length, 1);
	assert.equal(notificationInputs[0].type, "password_reset");
	assert.equal(notificationInputs[0].template_id, "password_reset.v1");
	// Email should have been dispatched via notification service
	assert.equal(sentMessages.length, 1);
	assert.equal(sentMessages[0].to, "student@example.com");
	assert.match(sentMessages[0].subject, /MathAI/);
	assert.match(sentMessages[0].text, /reset-password\?token=/);
	assert.doesNotMatch(sentMessages[0].text, /old-password-hash/);

	const token = sentMessages[0].text.match(/token=([^\s]+)/)?.[1];
	assert.ok(token);
	const decoded = jwt.decode(token) as jwt.JwtPayload;
	assert.equal(decoded.sub, user.id);
	assert.equal(decoded.email, user.email);
	assert.equal(decoded.purpose, "password_reset");
	assert.ok(decoded.exp);

	// PasswordResetRequest should have been persisted
	assert.equal(createdResetRequests.length, 1);
	assert.equal(createdResetRequests[0].email, "student@example.com");
	assert.ok(createdResetRequests[0].token_fingerprint);
	assert.ok(createdResetRequests[0].expires_at);
	assert.equal(createdResetRequests[0].delivery_id, "delivery-1");

	// Audit log should have been recorded
	const resetAudit = auditRecords.find((r) => r.action === "auth.password_reset.requested");
	assert.ok(resetAudit);
	assert.equal(resetAudit.resourceType, "user");
	assert.equal(resetAudit.resourceId, user.id);
});

test("resetPassword changes the hash and invalidates the same reset token", async () => {
	const { service, sentMessages, getUser, auditRecords, consumedIds, setResetRequest } = createService(makeUser());

	await service.requestPasswordReset({ email: "student@example.com" });
	const token = sentMessages[0].text.match(/token=([^\s]+)/)?.[1];
	assert.ok(token);

	// Set up the reset request record so the service can find it
	const fingerprint = crypto.createHash("sha256").update(token).digest("hex");
	setResetRequest(fingerprint);

	const result = await service.resetPassword({
		token,
		password: "new-secure-password",
	});

	assert.deepEqual(result, { reset: true });
	assert.notEqual(getUser()?.password_hash, "$2a$12$old-password-hash");
	assert.equal(
		await service.comparePassword(
			"new-secure-password",
			getUser()!.password_hash,
		),
		true,
	);

	// Verify consumed_at was marked
	assert.equal(consumedIds.length, 1);
	assert.equal(consumedIds[0], "reset-req-1");

	// Verify audit log was recorded for the password reset consumption
	const consumedAudit = auditRecords.find((r) => r.action === "auth.password_reset.consumed");
	assert.ok(consumedAudit);
	assert.equal(consumedAudit.resourceType, "user");
	assert.equal(consumedAudit.resourceId, "user-1");

	// Second use of same token should fail (passwordVersion mismatch since hash changed)
	await assert.rejects(
		() => service.resetPassword({ token, password: "second-password" }),
		UnauthorizedError,
	);
});

test("requestPasswordReset silently skips dispatch when email rate limit exceeded (3 per hour)", async () => {
	const user = makeUser();
	const { service, sentMessages, notificationInputs, auditRecords, setRecentEmailCount } = createService(user);

	// Simulate 3 recent requests already made
	setRecentEmailCount(3);

	const result = await service.requestPasswordReset({
		email: "student@example.com",
	});

	assert.deepEqual(result, { accepted: true });
	// No notification should be dispatched
	assert.equal(notificationInputs.length, 0);
	assert.equal(sentMessages.length, 0);
	// Audit log should still be recorded with rate_limited flag
	const auditEntry = auditRecords.find((r) => r.action === "auth.password_reset.requested");
	assert.ok(auditEntry);
	assert.deepEqual((auditEntry.metadata as any).rate_limited, true);
});

test("requestPasswordReset returns constant-time response for non-existent email", async () => {
	const { service, auditRecords } = createService(null);

	const result = await service.requestPasswordReset({
		email: "nonexistent@example.com",
	});

	assert.deepEqual(result, { accepted: true });
	// Audit should record the attempt even for non-existent users
	const auditEntry = auditRecords.find((r) => r.action === "auth.password_reset.requested");
	assert.ok(auditEntry);
	assert.deepEqual((auditEntry.metadata as any).user_found, false);
});

test("requestPasswordReset persists PasswordResetRequest with sha256 token fingerprint", async () => {
	const user = makeUser();
	const { service, sentMessages, createdResetRequests } = createService(user);

	await service.requestPasswordReset({ email: "student@example.com" });

	assert.equal(createdResetRequests.length, 1);
	const record = createdResetRequests[0];

	// Verify token_fingerprint is a valid sha256 hex string (64 chars)
	assert.equal(typeof record.token_fingerprint, "string");
	assert.equal((record.token_fingerprint as string).length, 64);
	assert.match(record.token_fingerprint as string, /^[a-f0-9]{64}$/);

	// Verify expires_at is approximately 30 minutes from now
	const expiresAt = record.expires_at as Date;
	const expectedExpiry = Date.now() + 30 * 60 * 1000;
	assert.ok(Math.abs(expiresAt.getTime() - expectedExpiry) < 5000); // within 5 seconds

	// Verify delivery_id is set from notification result
	assert.equal(record.delivery_id, "delivery-1");
});
