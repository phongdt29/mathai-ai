import mongoose from "mongoose";
import { config } from "../config";

export type HealthStatus = "ok" | "degraded";
export type DatabaseHealthStatus =
	| "connected"
	| "connecting"
	| "disconnected"
	| "disconnecting"
	| "unknown";

const DATABASE_READY_STATE_LABELS: Record<number, DatabaseHealthStatus> = {
	0: "disconnected",
	1: "connected",
	2: "connecting",
	3: "disconnecting",
};

function timestamp() {
	return new Date().toISOString();
}

function uptimeSeconds() {
	return Math.round(process.uptime());
}

export function getDatabaseHealthStatus(
	readyState = mongoose.connection.readyState,
) {
	return DATABASE_READY_STATE_LABELS[readyState] ?? "unknown";
}

export function buildLivenessHealth() {
	return {
		status: "ok" as const,
		timestamp: timestamp(),
		uptime_seconds: uptimeSeconds(),
		service: "mathai-backend",
	};
}

/**
 * Check if EMAIL config is valid when EMAIL_PROVIDER=http.
 * Returns true if provider is "console" (no external email needed)
 * or if both EMAIL_API_URL and EMAIL_API_KEY are configured.
 *
 * Requirements: 13.9
 */
export function isEmailConfigValid(): boolean {
	if (config.email.provider === "console") {
		return true;
	}
	// EMAIL_PROVIDER=http requires both API URL and API key
	return !!(config.email.apiUrl && config.email.apiKey);
}

/**
 * Perform a MongoDB ping to verify the database is responsive.
 * Returns true if ping succeeds, false otherwise.
 *
 * Requirements: 13.9
 */
export async function checkMongoPing(): Promise<boolean> {
	try {
		if (mongoose.connection.readyState !== 1) {
			return false;
		}
		const admin = mongoose.connection.db?.admin();
		if (!admin) {
			return false;
		}
		const result = await admin.ping();
		return result?.ok === 1;
	} catch {
		return false;
	}
}

/**
 * Build readiness health response.
 * Returns HTTP 200 only when:
 * - MongoDB ping succeeds
 * - EMAIL config is valid (when EMAIL_PROVIDER=http, both EMAIL_API_URL and EMAIL_API_KEY are set)
 *
 * Requirements: 13.9
 */
export async function buildReadinessHealth(
	readyState = mongoose.connection.readyState,
): Promise<{
	status: HealthStatus;
	timestamp: string;
	uptime_seconds: number;
	service: string;
	checks: {
		database: {
			status: DatabaseHealthStatus;
			ready_state: number;
			ping: boolean;
			blocking: true;
		};
		email_config: {
			valid: boolean;
			provider: string;
			blocking: true;
		};
	};
	alerts: Array<{ code: string; severity: "critical" | "warning"; message: string }>;
}> {
	const databaseStatus = getDatabaseHealthStatus(readyState);
	const mongoPingOk = await checkMongoPing();
	const emailConfigValid = isEmailConfigValid();

	const isReady = mongoPingOk && emailConfigValid;

	const alerts: Array<{ code: string; severity: "critical" | "warning"; message: string }> = [];

	if (!mongoPingOk) {
		alerts.push({
			code: "database_not_ready",
			severity: "critical",
			message: "MongoDB ping failed — database is not responsive",
		});
	}

	if (!emailConfigValid) {
		alerts.push({
			code: "email_config_invalid",
			severity: "critical",
			message: "EMAIL_API_URL and EMAIL_API_KEY must be configured when EMAIL_PROVIDER=http",
		});
	}

	return {
		status: isReady ? "ok" : "degraded",
		timestamp: timestamp(),
		uptime_seconds: uptimeSeconds(),
		service: "mathai-backend",
		checks: {
			database: {
				status: databaseStatus,
				ready_state: readyState,
				ping: mongoPingOk,
				blocking: true,
			},
			email_config: {
				valid: emailConfigValid,
				provider: config.email.provider,
				blocking: true,
			},
		},
		alerts,
	};
}
