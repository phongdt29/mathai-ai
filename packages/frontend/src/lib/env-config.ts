import sharedConfig from "../../env-config.cjs";

export const DEFAULT_PUBLIC_API_URL: string =
	sharedConfig.DEFAULT_PUBLIC_API_URL;
export const DEFAULT_REWRITE_API_URL: string =
	sharedConfig.DEFAULT_REWRITE_API_URL;

export interface PublicApiUrlOptions {
	nodeEnv?: string;
	value?: string;
	env?: Record<string, string | undefined>;
}

export function normalizePublicApiUrl(
	options: PublicApiUrlOptions = {},
): string {
	return sharedConfig.normalizePublicApiUrl(options);
}

/**
 * Returns the public API URL for client-side use.
 *
 * IMPORTANT: Uses literal `process.env.NEXT_PUBLIC_API_URL` and
 * `process.env.NODE_ENV` so that Next.js/Turbopack can statically inline
 * these values at build time. Dynamic key access (process.env[key]) is NOT
 * inlined by the bundler.
 */
export function getPublicApiUrl(): string {
	const nodeEnv = process.env.NODE_ENV || "development";
	const rawValue = process.env.NEXT_PUBLIC_API_URL;
	const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;

	if (!value) {
		if (nodeEnv === "production") {
			throw new Error(
				"NEXT_PUBLIC_API_URL is required in production and must be an absolute, non-localhost URL.",
			);
		}
		return DEFAULT_PUBLIC_API_URL;
	}

	const normalized = value.replace(/\/+$/, "") || "/";

	if (nodeEnv === "production") {
		let parsed: URL;
		try {
			parsed = new URL(normalized);
		} catch {
			throw new Error(
				"NEXT_PUBLIC_API_URL must be an absolute URL in production.",
			);
		}

		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			throw new Error(
				"NEXT_PUBLIC_API_URL must use http or https in production.",
			);
		}

		const hostname = parsed.hostname.toLowerCase();
		if (
			hostname === "localhost" ||
			hostname === "127.0.0.1" ||
			hostname === "::1" ||
			hostname.endsWith(".localhost")
		) {
			throw new Error(
				"NEXT_PUBLIC_API_URL must not point to localhost in production.",
			);
		}
	}

	return normalized;
}

export function normalizeRewriteApiUrl(
	options: PublicApiUrlOptions = {},
): string {
	return sharedConfig.normalizeRewriteApiUrl(options);
}

export function getRewriteApiUrl(): string {
	return sharedConfig.getRewriteApiUrl();
}
