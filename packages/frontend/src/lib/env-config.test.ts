import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import {
	getPublicApiUrl,
	normalizePublicApiUrl,
	normalizeRewriteApiUrl,
} from "./env-config";

const originalNodeEnv = process.env.NODE_ENV;
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

afterEach(() => {
	process.env.NODE_ENV = originalNodeEnv;
	if (originalApiUrl === undefined) {
		delete process.env.NEXT_PUBLIC_API_URL;
	} else {
		process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
	}
});

describe("frontend API URL config", () => {
	test("normalizes explicit absolute and relative API URLs", () => {
		assert.equal(
			normalizePublicApiUrl({
				nodeEnv: "development",
				value: "https://api.example.com/api/",
			}),
			"https://api.example.com/api",
		);
		assert.equal(
			normalizePublicApiUrl({ nodeEnv: "development", value: "/api/" }),
			"/api",
		);
	});

	test("allows development and test defaults without explicit API URL", () => {
		assert.equal(
			normalizePublicApiUrl({
				nodeEnv: "development",
				env: { NEXT_PUBLIC_API_URL: undefined },
			}),
			"/api",
		);
		assert.equal(
			normalizePublicApiUrl({
				nodeEnv: "test",
				env: { NEXT_PUBLIC_API_URL: undefined },
			}),
			"/api",
		);
	});

	test("uses backend localhost for development and test rewrite defaults", () => {
		assert.equal(
			normalizeRewriteApiUrl({
				nodeEnv: "development",
				env: { NEXT_PUBLIC_API_URL: undefined },
			}),
			"http://localhost:3001/api",
		);
		assert.equal(
			normalizeRewriteApiUrl({
				nodeEnv: "test",
				env: { NEXT_PUBLIC_API_URL: undefined },
			}),
			"http://localhost:3001/api",
		);
	});

	test("prefers explicit server rewrite API URL without changing browser default", () => {
		const env = {
			NEXT_PUBLIC_API_URL: undefined,
			BACKEND_API_URL: "http://127.0.0.1:3001/api/",
		};

		assert.equal(
			normalizePublicApiUrl({ nodeEnv: "development", env }),
			"/api",
		);
		assert.equal(
			normalizeRewriteApiUrl({ nodeEnv: "development", env }),
			"http://127.0.0.1:3001/api",
		);
	});

	test("requires explicit absolute non-localhost API URL in production", () => {
		assert.throws(
			() => normalizePublicApiUrl({ nodeEnv: "production" }),
			/NEXT_PUBLIC_API_URL is required in production/,
		);
		assert.throws(
			() => normalizePublicApiUrl({ nodeEnv: "production", value: "/api" }),
			/must be an absolute URL in production/,
		);
		assert.throws(
			() =>
				normalizePublicApiUrl({
					nodeEnv: "production",
					value: "ftp://api.mathai.example/api",
				}),
			/must use http or https in production/,
		);
		assert.throws(
			() =>
				normalizePublicApiUrl({
					nodeEnv: "production",
					value: "http://localhost:3001/api",
				}),
			/must not point to localhost in production/,
		);
		assert.equal(
			normalizePublicApiUrl({
				nodeEnv: "production",
				value: "https://api.mathai.example/api/",
			}),
			"https://api.mathai.example/api",
		);
	});

	test("reads process env once through shared public API helper", () => {
		process.env.NODE_ENV = "test";
		process.env.NEXT_PUBLIC_API_URL = "https://api.example.test/api/";

		assert.equal(getPublicApiUrl(), "https://api.example.test/api");
	});
});
