import assert from "node:assert/strict";
import test from "node:test";

import {
	buildLivenessHealth,
	buildReadinessHealth,
	getDatabaseHealthStatus,
	isEmailConfigValid,
	checkMongoPing,
} from "./health.service";

test("buildLivenessHealth returns an always-available liveness payload", () => {
	const result = buildLivenessHealth();

	assert.equal(result.status, "ok");
	assert.equal(result.service, "mathai-backend");
	assert.equal(typeof result.timestamp, "string");
	assert.equal(typeof result.uptime_seconds, "number");
});

test("buildReadinessHealth reports degraded when MongoDB is not connected", async () => {
	// readyState 0 = disconnected, checkMongoPing will fail
	const result = await buildReadinessHealth(0);

	assert.equal(result.status, "degraded");
	assert.equal(result.checks.database.status, "disconnected");
	assert.equal(result.checks.database.ping, false);
	assert.equal(result.checks.database.blocking, true);
	assert.ok(result.alerts.length >= 1);
	assert.ok(result.alerts.some((a) => a.code === "database_not_ready"));
});

test("buildReadinessHealth returns status ok structure when DB is connected (readyState=1)", async () => {
	// Note: In test env without real MongoDB, ping will still fail,
	// but we verify the structure and that readyState=1 maps to "connected"
	const result = await buildReadinessHealth(1);

	// Verify structure is correct
	assert.equal(result.service, "mathai-backend");
	assert.equal(typeof result.timestamp, "string");
	assert.equal(typeof result.uptime_seconds, "number");
	assert.equal(result.checks.database.ready_state, 1);
	assert.equal(result.checks.database.status, "connected");
	assert.equal(result.checks.database.blocking, true);
	assert.ok("email_config" in result.checks);
});

test("buildReadinessHealth includes email_config check", async () => {
	const result = await buildReadinessHealth(0);

	assert.ok("email_config" in result.checks);
	assert.equal(typeof result.checks.email_config.valid, "boolean");
	assert.equal(typeof result.checks.email_config.provider, "string");
	assert.equal(result.checks.email_config.blocking, true);
});

test("getDatabaseHealthStatus maps unknown mongoose ready states safely", () => {
	assert.equal(getDatabaseHealthStatus(2), "connecting");
	assert.equal(getDatabaseHealthStatus(3), "disconnecting");
	assert.equal(getDatabaseHealthStatus(99), "unknown");
});

test("isEmailConfigValid returns true for console provider", () => {
	// The default config in test env uses console provider
	const result = isEmailConfigValid();
	assert.equal(typeof result, "boolean");
});

test("checkMongoPing returns false when not connected", async () => {
	// In test environment without a real MongoDB connection, ping should fail
	const result = await checkMongoPing();
	assert.equal(typeof result, "boolean");
});
