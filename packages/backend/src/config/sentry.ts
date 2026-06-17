import * as Sentry from "@sentry/node";

/**
 * Fields that must be redacted from Sentry events to prevent PII leakage.
 * Validates: Requirements 13.5, 13.15
 */
const SENSITIVE_FIELDS = [
  "password",
  "password_hash",
  "api_key",
  "hash_secret",
  "secret_key",
  "vapid_private",
  "authorization",
  "token",
  "refresh_token",
  "email_api_key",
  "access_key",
  "secret_access_key",
];

/**
 * Recursively scrub sensitive fields from an object.
 * Replaces values of matching keys with "[Filtered]".
 */
function scrubSensitiveData(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => scrubSensitiveData(item));
  }

  if (typeof obj === "object") {
    const scrubbed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const keyLower = key.toLowerCase();
      if (SENSITIVE_FIELDS.some((field) => keyLower.includes(field))) {
        scrubbed[key] = "[Filtered]";
      } else {
        scrubbed[key] = scrubSensitiveData(value);
      }
    }
    return scrubbed;
  }

  return obj;
}

/**
 * Initialize Sentry for the backend.
 * Only initializes if SENTRY_DSN is set.
 * Validates: Requirements 13.5, 13.15
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    beforeSend(event) {
      // Scrub request data
      if (event.request?.data) {
        event.request.data = scrubSensitiveData(event.request.data) as Record<string, string>;
      }

      // Scrub request headers
      if (event.request?.headers) {
        const headers = { ...event.request.headers };
        if (headers.authorization) {
          headers.authorization = "[Filtered]";
        }
        if (headers.cookie) {
          headers.cookie = "[Filtered]";
        }
        event.request.headers = headers;
      }

      // Scrub breadcrumb data
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.data) {
            breadcrumb.data = scrubSensitiveData(breadcrumb.data) as Record<string, unknown>;
          }
          return breadcrumb;
        });
      }

      // Scrub extra context
      if (event.extra) {
        event.extra = scrubSensitiveData(event.extra) as Record<string, unknown>;
      }

      // Scrub contexts
      if (event.contexts) {
        event.contexts = scrubSensitiveData(event.contexts) as Record<string, Record<string, unknown>>;
      }

      return event;
    },
  });
}

/**
 * Capture an exception with Sentry (if initialized).
 */
export function captureException(error: unknown): void {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error);
  }
}

/**
 * Capture a message with Sentry (if initialized).
 */
export function captureMessage(message: string, level?: Sentry.SeverityLevel): void {
  if (process.env.SENTRY_DSN) {
    Sentry.captureMessage(message, level);
  }
}

export { Sentry };
