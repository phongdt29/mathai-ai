const path = require("path");
const { getRewriteApiUrl } = require("./env-config.cjs");
const { withSentryConfig } = require("@sentry/nextjs");

const backendApiUrl = getRewriteApiUrl();

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	output: "standalone",
	env: {
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "",
	},
	turbopack: {
		root: path.resolve(__dirname, "../.."),
	},
	async rewrites() {
		if (process.env.NODE_ENV === "production") {
			return [];
		}

		return [
			{
				source: "/api/:path*",
				destination: `${backendApiUrl}/:path*`,
			},
		];
	},
};

// Wrap with Sentry only when NEXT_PUBLIC_SENTRY_DSN is set
// Validates: Requirements 13.5
module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
	? withSentryConfig(nextConfig, {
			// Sentry webpack plugin options
			silent: true,
			org: process.env.SENTRY_ORG || "",
			project: process.env.SENTRY_PROJECT || "",
		}, {
			// Sentry SDK options
			widenClientFileUpload: true,
			hideSourceMaps: true,
			disableLogger: true,
		})
	: nextConfig;
