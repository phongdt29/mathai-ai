import assert from "node:assert/strict";
import { test } from "node:test";

import { buildConfig } from "./index";

const PRODUCTION_JWT_SECRET = "prod-jwt-secret-32-characters-minimum";
const PRODUCTION_JWT_REFRESH_SECRET =
	"prod-refresh-secret-32-characters-minimum";

test("production config fails fast when required environment variables are missing or blank", () => {
	assert.throws(
		() =>
			buildConfig({
				NODE_ENV: "production",
				JWT_SECRET: "   ",
				JWT_REFRESH_SECRET: "refresh-secret",
				BACKEND_PORT: "3001",
			}),
		(error) => {
			assert.ok(error instanceof Error);
			assert.match(error.message, /Invalid backend configuration/);
			assert.match(error.message, /JWT_SECRET is required/);
			assert.match(error.message, /MONGODB_URI is required/);
			assert.match(error.message, /CORS_ORIGIN is required/);
			assert.match(error.message, /APP_BASE_URL is required/);
			assert.doesNotMatch(error.message, /refresh-secret/);
			return true;
		},
	);
});

test("production config rejects localhost MongoDB and CORS values", () => {
	assert.throws(
		() =>
			buildConfig({
				NODE_ENV: "production",
				JWT_SECRET: PRODUCTION_JWT_SECRET,
				JWT_REFRESH_SECRET: PRODUCTION_JWT_REFRESH_SECRET,
				MONGODB_URI: "mongodb://localhost:27017/mathai",
				CORS_ORIGIN: "http://localhost:3444",
				APP_BASE_URL: "http://localhost:3444",
				BACKEND_PORT: "3001",
			}),
		(error) => {
			assert.ok(error instanceof Error);
			assert.match(
				error.message,
				/MONGODB_URI must not use localhost in production/,
			);
			assert.match(
				error.message,
				/CORS_ORIGIN must not use localhost in production/,
			);
			assert.match(
				error.message,
				/APP_BASE_URL must not use localhost in production/,
			);
			assert.doesNotMatch(error.message, new RegExp(PRODUCTION_JWT_SECRET));
			assert.doesNotMatch(
				error.message,
				new RegExp(PRODUCTION_JWT_REFRESH_SECRET),
			);
			return true;
		},
	);
});

test("production config rejects localhost MongoDB query-only values", () => {
	assert.throws(
		() =>
			buildConfig({
				NODE_ENV: "production",
				JWT_SECRET: PRODUCTION_JWT_SECRET,
				JWT_REFRESH_SECRET: PRODUCTION_JWT_REFRESH_SECRET,
				MONGODB_URI: "mongodb://localhost?replicaSet=rs0",
				CORS_ORIGIN: "https://app.example.com",
				APP_BASE_URL: "https://app.example.com",
			}),
		/MONGODB_URI must not use localhost in production/,
	);
});

test("development config keeps safe local defaults", () => {
	const config = buildConfig({ NODE_ENV: "development" });

	assert.equal(config.port, 3001);
	assert.equal(config.corsOrigin, "http://localhost:3444");
	assert.equal(config.jwt.secret, "development-jwt-secret");
	assert.equal(config.jwt.refreshSecret, "development-jwt-refresh-secret");
	assert.equal(config.db.uri, "mongodb://localhost:27017");
	assert.equal(config.db.database, "mathai");
	assert.equal(config.app.baseUrl, "http://localhost:3444");
	assert.equal(config.email.provider, "console");
	assert.equal(config.email.from, "MathAI <no-reply@localhost>");
	assert.equal(config.email.apiUrl, "");
	assert.equal(config.email.apiKey, "");
});

test("config rejects invalid ports and URLs clearly", () => {
	assert.throws(
		() =>
			buildConfig({
				NODE_ENV: "development",
				BACKEND_PORT: "70000",
				MONGODB_URI: "not-a-url",
				CORS_ORIGIN: "not-a-url",
				APP_BASE_URL: "not-a-url",
			}),
		(error) => {
			assert.ok(error instanceof Error);
			assert.match(
				error.message,
				/BACKEND_PORT must be an integer between 1 and 65535/,
			);
			assert.match(
				error.message,
				/MONGODB_URI must be a valid MongoDB connection string/,
			);
			assert.match(error.message, /CORS_ORIGIN must be a valid URL/);
			assert.match(error.message, /APP_BASE_URL must be a valid URL/);
			return true;
		},
	);
});

test("production config accepts explicit non-local production settings", () => {
	const config = buildConfig({
		NODE_ENV: "production",
		JWT_SECRET: PRODUCTION_JWT_SECRET,
		JWT_REFRESH_SECRET: PRODUCTION_JWT_REFRESH_SECRET,
		MONGODB_URI: "mongodb+srv://db.example.com/mathai",
		CORS_ORIGIN: "https://app.example.com",
		APP_BASE_URL: "https://app.example.com/",
		BACKEND_PORT: "8080",
		EMAIL_PROVIDER: "http",
		EMAIL_FROM: "MathAI <no-reply@example.com>",
		EMAIL_API_URL: "https://email.example.com/send",
		EMAIL_API_KEY: "email-api-key",
	});

	assert.equal(config.port, 8080);
	assert.equal(config.corsOrigin, "https://app.example.com");
	assert.equal(config.jwt.secret, PRODUCTION_JWT_SECRET);
	assert.equal(config.jwt.refreshSecret, PRODUCTION_JWT_REFRESH_SECRET);
	assert.equal(config.db.uri, "mongodb+srv://db.example.com/mathai");
	assert.equal(config.app.baseUrl, "https://app.example.com");
	assert.equal(config.email.provider, "http");
	assert.equal(config.email.from, "MathAI <no-reply@example.com>");
	assert.equal(config.email.apiUrl, "https://email.example.com/send");
	assert.equal(config.email.apiKey, "email-api-key");
});

test("config accepts MongoDB query-only connection strings", () => {
	const standard = buildConfig({
		NODE_ENV: "production",
		JWT_SECRET: PRODUCTION_JWT_SECRET,
		JWT_REFRESH_SECRET: PRODUCTION_JWT_REFRESH_SECRET,
		MONGODB_URI: "mongodb://user:pass@db.example.com?authSource=admin",
		CORS_ORIGIN: "https://app.example.com",
		APP_BASE_URL: "https://app.example.com",
		EMAIL_PROVIDER: "http",
		EMAIL_FROM: "MathAI <no-reply@example.com>",
		EMAIL_API_URL: "https://email.example.com/send",
		EMAIL_API_KEY: "email-api-key",
	});
	const replicaSet = buildConfig({
		NODE_ENV: "production",
		JWT_SECRET: PRODUCTION_JWT_SECRET,
		JWT_REFRESH_SECRET: PRODUCTION_JWT_REFRESH_SECRET,
		MONGODB_URI: "mongodb://db.example.com?replicaSet=rs0",
		CORS_ORIGIN: "https://app.example.com",
		APP_BASE_URL: "https://app.example.com",
		EMAIL_PROVIDER: "http",
		EMAIL_FROM: "MathAI <no-reply@example.com>",
		EMAIL_API_URL: "https://email.example.com/send",
		EMAIL_API_KEY: "email-api-key",
	});

	assert.equal(
		standard.db.uri,
		"mongodb://user:pass@db.example.com?authSource=admin",
	);
	assert.equal(replicaSet.db.uri, "mongodb://db.example.com?replicaSet=rs0");
});

test("config rejects invalid MongoDB URI without leaking credentials", () => {
	assert.throws(
		() =>
			buildConfig({
				NODE_ENV: "production",
				JWT_SECRET: PRODUCTION_JWT_SECRET,
				JWT_REFRESH_SECRET: PRODUCTION_JWT_REFRESH_SECRET,
				MONGODB_URI: "mongodb://user:super-secret-password@",
				CORS_ORIGIN: "https://app.example.com",
				APP_BASE_URL: "https://app.example.com",
			}),
		(error) => {
			assert.ok(error instanceof Error);
			assert.match(
				error.message,
				/MONGODB_URI must be a valid MongoDB connection string/,
			);
			assert.doesNotMatch(error.message, /user/);
			assert.doesNotMatch(error.message, /super-secret-password/);
			return true;
		},
	);
});

test("production http email provider requires safe provider settings", () => {
	assert.throws(
		() =>
			buildConfig({
				NODE_ENV: "production",
				JWT_SECRET: PRODUCTION_JWT_SECRET,
				JWT_REFRESH_SECRET: PRODUCTION_JWT_REFRESH_SECRET,
				MONGODB_URI: "mongodb+srv://db.example.com/mathai",
				CORS_ORIGIN: "https://app.example.com",
				APP_BASE_URL: "https://app.example.com",
				EMAIL_PROVIDER: "http",
				EMAIL_API_URL: "http://localhost:9000/send",
			}),
		(error) => {
			assert.ok(error instanceof Error);
			assert.match(error.message, /EMAIL_FROM is required/);
			assert.match(
				error.message,
				/EMAIL_API_URL must not use localhost in production/,
			);
			assert.match(
				error.message,
				/EMAIL_API_KEY is required when EMAIL_PROVIDER=http/,
			);
			assert.doesNotMatch(error.message, new RegExp(PRODUCTION_JWT_SECRET));
			return true;
		},
	);
});

test("production config rejects console email provider for production-like email delivery", () => {
	assert.throws(
		() =>
			buildConfig({
				NODE_ENV: "production",
				JWT_SECRET: PRODUCTION_JWT_SECRET,
				JWT_REFRESH_SECRET: PRODUCTION_JWT_REFRESH_SECRET,
				MONGODB_URI: "mongodb+srv://db.example.com/mathai",
				CORS_ORIGIN: "https://app.example.com",
				APP_BASE_URL: "https://app.example.com",
				EMAIL_PROVIDER: "console",
			}),
		(error) => {
			assert.ok(error instanceof Error);
			assert.match(
				error.message,
				/EMAIL_PROVIDER must be http in production when password reset email delivery is enabled/,
			);
			assert.doesNotMatch(error.message, new RegExp(PRODUCTION_JWT_SECRET));
			return true;
		},
	);
});

test("production http email provider rejects placeholder API keys without leaking values", () => {
	assert.throws(
		() =>
			buildConfig({
				NODE_ENV: "production",
				JWT_SECRET: PRODUCTION_JWT_SECRET,
				JWT_REFRESH_SECRET: PRODUCTION_JWT_REFRESH_SECRET,
				MONGODB_URI: "mongodb+srv://db.example.com/mathai",
				CORS_ORIGIN: "https://app.example.com",
				APP_BASE_URL: "https://app.example.com",
				EMAIL_PROVIDER: "http",
				EMAIL_FROM: "MathAI <no-reply@example.com>",
				EMAIL_API_URL: "https://email.example.com/send",
				EMAIL_API_KEY: "replace-with-email-provider-secret",
			}),
		(error) => {
			assert.ok(error instanceof Error);
			assert.match(
				error.message,
				/EMAIL_API_KEY must not contain placeholder text in production/,
			);
			assert.doesNotMatch(error.message, /replace-with-email-provider-secret/);
			return true;
		},
	);
});

test("production config rejects unsafe JWT secrets and demo auth flags", () => {
	assert.throws(
		() =>
			buildConfig({
				NODE_ENV: "production",
				JWT_SECRET: "development-jwt-secret",
				JWT_REFRESH_SECRET: "development-jwt-secret",
				MONGODB_URI: "mongodb+srv://db.example.com/mathai",
				CORS_ORIGIN: "https://app.example.com",
				APP_BASE_URL: "https://app.example.com",
				ENABLE_DEMO_AUTH_TOKENS: "true",
			}),
		(error) => {
			assert.ok(error instanceof Error);
			assert.match(
				error.message,
				/JWT_SECRET must not use the development default in production/,
			);
			assert.match(
				error.message,
				/JWT_SECRET must be at least 32 characters in production/,
			);
			assert.match(
				error.message,
				/JWT_SECRET and JWT_REFRESH_SECRET must be distinct in production/,
			);
			assert.match(
				error.message,
				/ENABLE_DEMO_AUTH_TOKENS must be disabled in production/,
			);
			assert.doesNotMatch(error.message, /development-jwt-secret/);
			return true;
		},
	);

	assert.throws(
		() =>
			buildConfig({
				NODE_ENV: "production",
				JWT_SECRET: "replace-with-real-jwt-secret-value",
				JWT_REFRESH_SECRET: PRODUCTION_JWT_REFRESH_SECRET,
				MONGODB_URI: "mongodb+srv://db.example.com/mathai",
				CORS_ORIGIN: "https://app.example.com",
				APP_BASE_URL: "https://app.example.com",
			}),
		/JWT_SECRET must not contain placeholder text in production/,
	);
});

test("config rejects unsupported email providers", () => {
	assert.throws(
		() =>
			buildConfig({
				NODE_ENV: "development",
				EMAIL_PROVIDER: "smtp",
			}),
		/EMAIL_PROVIDER must be either console or http/,
	);
});
