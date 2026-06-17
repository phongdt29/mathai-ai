import dotenv from "dotenv";
import {
	buildFeatureFlagRegistry,
	type FeatureFlagRegistry,
} from "./feature-flags";

dotenv.config();

type EnvReader = Pick<NodeJS.ProcessEnv, string>;

export interface BackendConfig {
	readonly port: number;
	/** Origin đầu tiên trong danh sách — giữ cho tương thích ngược. */
	readonly corsOrigin: string;
	/** Danh sách origin được phép (CORS_ORIGIN phân tách bằng dấu phẩy). */
	readonly corsOrigins: readonly string[];
	/** API key cho tích hợp ngoài (EXTERNAL_API_KEYS phân tách bằng dấu phẩy). */
	readonly externalApiKeys: readonly string[];
	/** Số hop proxy tin cậy (TRUST_PROXY), false nếu không đặt. */
	readonly trustProxy: number | false;
	readonly jwt: {
		readonly secret: string;
		readonly refreshSecret: string;
		readonly expiresIn: string;
	};
	readonly db: {
		readonly uri: string;
		readonly database: string;
	};
	readonly openai: {
		readonly apiKey: string;
		readonly baseUrl: string;
		readonly model: string;
	};
	readonly email: {
		readonly provider: "console" | "http";
		readonly from: string;
		readonly replyTo: string;
		readonly apiUrl: string;
		readonly apiKey: string;
	};
	readonly app: {
		readonly baseUrl: string;
	};
	readonly features: FeatureFlagRegistry;
}

const LOCAL_JWT_SECRET = "development-jwt-secret";
const LOCAL_JWT_REFRESH_SECRET = "development-jwt-refresh-secret";
const LOCAL_MONGODB_URI = "mongodb://localhost:27017";
const LOCAL_CORS_ORIGIN = "http://localhost:3444";
const LOCAL_APP_BASE_URL = "http://localhost:3444";
const DEFAULT_PORT = "3001";
const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32;
const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const PLACEHOLDER_SECRET_PATTERN =
	/change[-_ ]?me|replace[-_ ]?with|placeholder|set[-_ ]?in[-_ ]?secret[-_ ]?manager|your[-_ ]?/i;

const isProduction = (env: EnvReader): boolean => env.NODE_ENV === "production";

const readTrimmed = (env: EnvReader, key: string): string | undefined => {
	const value = env[key];
	if (value === undefined) {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const parsePort = (rawPort: string | undefined, errors: string[]): number => {
	const port = Number(rawPort ?? DEFAULT_PORT);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		errors.push("BACKEND_PORT must be an integer between 1 and 65535");
		return Number(DEFAULT_PORT);
	}

	return port;
};

const isValidHttpUrl = (value: string): boolean => {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
};

const isValidMongoUri = (value: string): boolean => {
	const match = /^(mongodb(?:\+srv)?):\/\/([^/?#\s]+)([^\s]*)$/i.exec(value);
	if (!match) {
		return false;
	}

	const protocol = match[1]?.toLowerCase();
	const authority = match[2];
	return (
		(protocol === "mongodb" || protocol === "mongodb+srv") &&
		authority
			.split(",")
			.every((host) => host.split("@").pop()?.split(":", 1)[0]?.length)
	);
};

const usesLocalhost = (value: string): boolean => {
	if (value.startsWith("mongodb://") || value.startsWith("mongodb+srv://")) {
		const authority = value.slice(value.indexOf("//") + 2).split(/[/?#]/, 1)[0];
		return authority.split(",").some((host) => {
			const hostname = host.split("@").pop()?.split(":", 1)[0]?.toLowerCase();
			return (
				hostname === "localhost" ||
				hostname === "127.0.0.1" ||
				hostname === "::1" ||
				hostname === "[::1]"
			);
		});
	}

	try {
		const url = new URL(value);
		const hostname = url.hostname.toLowerCase();
		return (
			hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
		);
	} catch {
		return false;
	}
};

const requireValue = (
	env: EnvReader,
	key: string,
	fallback: string,
	production: boolean,
	errors: string[],
): string => {
	const value = readTrimmed(env, key);
	if (value) {
		return value;
	}

	if (production) {
		errors.push(`${key} is required`);
	}

	return fallback;
};

const throwIfInvalid = (errors: string[]): void => {
	if (errors.length === 0) {
		return;
	}

	throw new Error(`Invalid backend configuration: ${errors.join("; ")}`);
};

const isTruthyEnv = (value: string | undefined): boolean =>
	value !== undefined && TRUE_ENV_VALUES.has(value.trim().toLowerCase());

const validateProductionJwtSecret = (
	key: "JWT_SECRET" | "JWT_REFRESH_SECRET",
	value: string,
	localDefault: string,
	errors: string[],
): void => {
	if (value === localDefault) {
		errors.push(`${key} must not use the development default in production`);
	}

	if (value.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
		errors.push(
			`${key} must be at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters in production`,
		);
	}

	if (PLACEHOLDER_SECRET_PATTERN.test(value)) {
		errors.push(`${key} must not contain placeholder text in production`);
	}
};

export const buildConfig = (env: EnvReader = process.env): BackendConfig => {
	const errors: string[] = [];
	const production = isProduction(env);

	const port = parsePort(readTrimmed(env, "BACKEND_PORT"), errors);
	const corsOrigin = requireValue(
		env,
		"CORS_ORIGIN",
		LOCAL_CORS_ORIGIN,
		production,
		errors,
	);
	const jwtSecret = requireValue(
		env,
		"JWT_SECRET",
		LOCAL_JWT_SECRET,
		production,
		errors,
	);
	const jwtRefreshSecret = requireValue(
		env,
		"JWT_REFRESH_SECRET",
		LOCAL_JWT_REFRESH_SECRET,
		production,
		errors,
	);
	const mongoUri = requireValue(
		env,
		"MONGODB_URI",
		LOCAL_MONGODB_URI,
		production,
		errors,
	);
	const appBaseUrl = requireValue(
		env,
		"APP_BASE_URL",
		LOCAL_APP_BASE_URL,
		production,
		errors,
	);
	const emailProvider = readTrimmed(env, "EMAIL_PROVIDER") ?? "console";
	const emailFrom = requireValue(
		env,
		"EMAIL_FROM",
		"MathAI <no-reply@localhost>",
		emailProvider === "http" && production,
		errors,
	);
	const emailApiUrl = readTrimmed(env, "EMAIL_API_URL") ?? "";
	const emailApiKey = readTrimmed(env, "EMAIL_API_KEY") ?? "";
	const emailReplyTo = readTrimmed(env, "EMAIL_REPLY_TO") ?? "";

	if (production) {
		if (readTrimmed(env, "JWT_SECRET")) {
			validateProductionJwtSecret(
				"JWT_SECRET",
				jwtSecret,
				LOCAL_JWT_SECRET,
				errors,
			);
		}

		if (readTrimmed(env, "JWT_REFRESH_SECRET")) {
			validateProductionJwtSecret(
				"JWT_REFRESH_SECRET",
				jwtRefreshSecret,
				LOCAL_JWT_REFRESH_SECRET,
				errors,
			);
		}

		if (
			readTrimmed(env, "JWT_SECRET") &&
			readTrimmed(env, "JWT_REFRESH_SECRET") &&
			jwtSecret === jwtRefreshSecret
		) {
			errors.push(
				"JWT_SECRET and JWT_REFRESH_SECRET must be distinct in production",
			);
		}

		if (isTruthyEnv(readTrimmed(env, "ENABLE_DEMO_AUTH_TOKENS"))) {
			errors.push("ENABLE_DEMO_AUTH_TOKENS must be disabled in production");
		}
	}

	// CORS_ORIGIN nhận một hoặc nhiều origin phân tách bằng dấu phẩy
	const corsOrigins = corsOrigin
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);

	if (corsOrigins.length === 0) {
		errors.push("CORS_ORIGIN must be a valid URL");
	}
	for (const origin of corsOrigins) {
		if (!isValidHttpUrl(origin)) {
			errors.push("CORS_ORIGIN must be a valid URL");
		} else if (production && usesLocalhost(origin)) {
			errors.push("CORS_ORIGIN must not use localhost in production");
		}
	}

	const externalApiKeys = (readTrimmed(env, "EXTERNAL_API_KEYS") ?? "")
		.split(",")
		.map((key) => key.trim())
		.filter(Boolean);

	const trustProxyRaw = readTrimmed(env, "TRUST_PROXY");
	let trustProxy: number | false = false;
	if (trustProxyRaw !== undefined) {
		if (isTruthyEnv(trustProxyRaw)) {
			trustProxy = 1;
		} else if (/^\d+$/.test(trustProxyRaw)) {
			trustProxy = Number(trustProxyRaw);
		} else if (trustProxyRaw !== "false" && trustProxyRaw !== "0") {
			errors.push("TRUST_PROXY must be a non-negative integer or true/false");
		}
	}

	if (!isValidMongoUri(mongoUri)) {
		errors.push("MONGODB_URI must be a valid MongoDB connection string");
	} else if (production && usesLocalhost(mongoUri)) {
		errors.push("MONGODB_URI must not use localhost in production");
	}

	if (!isValidHttpUrl(appBaseUrl)) {
		errors.push("APP_BASE_URL must be a valid URL");
	} else if (production && usesLocalhost(appBaseUrl)) {
		errors.push("APP_BASE_URL must not use localhost in production");
	}

	if (emailProvider !== "console" && emailProvider !== "http") {
		errors.push("EMAIL_PROVIDER must be either console or http");
	}

	if (production && emailProvider === "console") {
		errors.push(
			"EMAIL_PROVIDER must be http in production when password reset email delivery is enabled",
		);
	}

	if (emailProvider === "http") {
		if (!emailApiUrl) {
			errors.push("EMAIL_API_URL is required when EMAIL_PROVIDER=http");
		} else if (!isValidHttpUrl(emailApiUrl)) {
			errors.push("EMAIL_API_URL must be a valid URL");
		} else if (production && usesLocalhost(emailApiUrl)) {
			errors.push("EMAIL_API_URL must not use localhost in production");
		}

		if (!emailApiKey) {
			errors.push("EMAIL_API_KEY is required when EMAIL_PROVIDER=http");
		} else if (production && PLACEHOLDER_SECRET_PATTERN.test(emailApiKey)) {
			errors.push(
				"EMAIL_API_KEY must not contain placeholder text in production",
			);
		}
	}

	throwIfInvalid(errors);

	return {
		port,
		corsOrigin: corsOrigins[0] ?? corsOrigin,
		corsOrigins,
		externalApiKeys,
		trustProxy,
		jwt: {
			secret: jwtSecret,
			refreshSecret: jwtRefreshSecret,
			expiresIn: readTrimmed(env, "JWT_EXPIRES_IN") ?? "7d",
		},
		db: {
			uri: mongoUri,
			database: readTrimmed(env, "DB_NAME") ?? "mathai",
		},
		openai: {
			apiKey: readTrimmed(env, "OPENAI_API_KEY") ?? "",
			baseUrl: readTrimmed(env, "OPENAI_BASE_URL") ?? "",
			model: readTrimmed(env, "OPENAI_MODEL") ?? "gpt-4o-mini",
		},
		email: {
			provider: emailProvider as "console" | "http",
			from: emailFrom,
			replyTo: emailReplyTo,
			apiUrl: emailApiUrl,
			apiKey: emailApiKey,
		},
		app: {
			baseUrl: appBaseUrl.replace(/\/+$/, ""),
		},
		features: buildFeatureFlagRegistry(env),
	};
};

export const config = buildConfig();
