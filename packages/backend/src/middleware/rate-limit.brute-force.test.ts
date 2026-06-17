import assert from "node:assert/strict";
import test from "node:test";

import {
	isBruteForceLocked,
	recordLoginFailure,
	clearLoginFailures,
	bruteForceStore,
	BRUTE_FORCE_MAX_ATTEMPTS,
} from "./rate-limit";

// Clean up store between tests
test.beforeEach(() => {
	bruteForceStore.clear();
});

test("isBruteForceLocked returns false when no failures recorded", () => {
	assert.equal(isBruteForceLocked("192.168.1.1", "user@test.com"), false);
});

test("recordLoginFailure does not lock before reaching threshold", () => {
	const ip = "10.0.0.1";
	const email = "test@example.com";

	for (let i = 0; i < BRUTE_FORCE_MAX_ATTEMPTS - 1; i++) {
		recordLoginFailure(ip, email);
	}

	assert.equal(isBruteForceLocked(ip, email), false);
});

test("recordLoginFailure locks after reaching threshold (5 failures)", () => {
	const ip = "10.0.0.2";
	const email = "victim@example.com";

	for (let i = 0; i < BRUTE_FORCE_MAX_ATTEMPTS; i++) {
		recordLoginFailure(ip, email);
	}

	assert.equal(isBruteForceLocked(ip, email), true);
});

test("brute-force lock is scoped to (IP, email) pair", () => {
	const ip = "10.0.0.3";
	const email1 = "user1@example.com";
	const email2 = "user2@example.com";

	// Lock email1
	for (let i = 0; i < BRUTE_FORCE_MAX_ATTEMPTS; i++) {
		recordLoginFailure(ip, email1);
	}

	// email2 should not be locked
	assert.equal(isBruteForceLocked(ip, email1), true);
	assert.equal(isBruteForceLocked(ip, email2), false);
});

test("different IPs are tracked independently", () => {
	const ip1 = "10.0.0.4";
	const ip2 = "10.0.0.5";
	const email = "shared@example.com";

	// Lock from ip1
	for (let i = 0; i < BRUTE_FORCE_MAX_ATTEMPTS; i++) {
		recordLoginFailure(ip1, email);
	}

	// ip2 should not be locked
	assert.equal(isBruteForceLocked(ip1, email), true);
	assert.equal(isBruteForceLocked(ip2, email), false);
});

test("clearLoginFailures removes the lock", () => {
	const ip = "10.0.0.6";
	const email = "cleared@example.com";

	for (let i = 0; i < BRUTE_FORCE_MAX_ATTEMPTS; i++) {
		recordLoginFailure(ip, email);
	}

	assert.equal(isBruteForceLocked(ip, email), true);

	clearLoginFailures(ip, email);

	assert.equal(isBruteForceLocked(ip, email), false);
});

test("email comparison is case-insensitive", () => {
	const ip = "10.0.0.7";

	for (let i = 0; i < BRUTE_FORCE_MAX_ATTEMPTS; i++) {
		recordLoginFailure(ip, "User@Example.COM");
	}

	assert.equal(isBruteForceLocked(ip, "user@example.com"), true);
	assert.equal(isBruteForceLocked(ip, "USER@EXAMPLE.COM"), true);
});
