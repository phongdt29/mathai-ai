import * as Sentry from "@sentry/nextjs";

/**
 * Sentry edge runtime initialization for Next.js frontend (middleware, edge API routes).
 * Validates: Requirements 13.5, 13.15
 */

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}
