import assert from "node:assert/strict";
import test from "node:test";

import { isDemoAuthTokenEnabled } from "./auth";

test("demo auth tokens require explicit flag outside production", () => {
	assert.equal(isDemoAuthTokenEnabled("development", "true"), true);
	assert.equal(isDemoAuthTokenEnabled("test", "true"), true);
	assert.equal(isDemoAuthTokenEnabled(undefined, "true"), true);
});

test("demo auth tokens are disabled without flag and always disabled in production", () => {
	assert.equal(isDemoAuthTokenEnabled("development", undefined), false);
	assert.equal(isDemoAuthTokenEnabled("test", "false"), false);
	assert.equal(isDemoAuthTokenEnabled("production", "true"), false);
	assert.equal(isDemoAuthTokenEnabled("production", undefined), false);
});
