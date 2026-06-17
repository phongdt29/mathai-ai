import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { DEFAULT_DEMO_LOGIN_PASSWORD, getDemoLoginPassword, isDemoLoginEnabled } from "./demo-auth";

describe("demo login credentials", () => {
	test("uses the same default dev/staging password as the MongoDB seed", () => {
		assert.equal(DEFAULT_DEMO_LOGIN_PASSWORD, "MathAI@Demo123");
		assert.equal(getDemoLoginPassword(), "MathAI@Demo123");
	});
});

describe("demo login UI gate", () => {
	test("shows demo login in development or with explicit public flag", () => {
		assert.equal(isDemoLoginEnabled({ nodeEnv: "development" }), true);
		assert.equal(isDemoLoginEnabled({ nodeEnv: "production", enableDemoLogin: "true" }), true);
	});

	test("hides demo login in production unless explicitly enabled", () => {
		assert.equal(isDemoLoginEnabled({ nodeEnv: "production" }), false);
		assert.equal(isDemoLoginEnabled({ nodeEnv: "production", enableDemoLogin: "false" }), false);
	});
});
