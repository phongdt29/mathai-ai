import { Request, Response, NextFunction } from "express";
import client from "prom-client";

// Create a custom registry to avoid polluting the default registry
export const metricsRegistry = new client.Registry();

// Set default labels
metricsRegistry.setDefaultLabels({
  app: "mathai-backend",
});

// Collect default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register: metricsRegistry });

// --- Custom metrics ---

/**
 * HTTP request duration histogram (seconds).
 * Labels: method, route, status_code
 * Validates: Requirements 13.4
 */
export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

/**
 * HTTP requests total counter.
 * Labels: method, route, status_code
 * Validates: Requirements 13.4
 */
export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [metricsRegistry],
});

/**
 * Active engagement sessions gauge.
 * Validates: Requirements 13.4
 */
export const activeEngagementSessions = new client.Gauge({
  name: "active_engagement_sessions",
  help: "Number of currently active engagement sessions",
  registers: [metricsRegistry],
});

/**
 * Notification delivery total counter.
 * Labels: channel, status
 * Validates: Requirements 13.4
 */
export const notificationDeliveryTotal = new client.Counter({
  name: "notification_delivery_total",
  help: "Total number of notification deliveries",
  labelNames: ["channel", "status"] as const,
  registers: [metricsRegistry],
});

/**
 * Payment intent total counter.
 * Labels: gateway, status
 * Validates: Requirements 13.4
 */
export const paymentIntentTotal = new client.Counter({
  name: "payment_intent_total",
  help: "Total number of payment intents",
  labelNames: ["gateway", "status"] as const,
  registers: [metricsRegistry],
});

/**
 * Scheduled job duration histogram (seconds).
 * Labels: job_name
 * Validates: Requirements 13.4
 */
export const scheduledJobDuration = new client.Histogram({
  name: "scheduled_job_duration_seconds",
  help: "Duration of scheduled job executions in seconds",
  labelNames: ["job_name"] as const,
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
  registers: [metricsRegistry],
});

/**
 * Scheduled job last run timestamp gauge.
 * Labels: job_name
 * Validates: Requirements 13.4
 */
export const scheduledJobLastRunAt = new client.Gauge({
  name: "scheduled_job_last_run_at",
  help: "Unix timestamp of the last successful run for each scheduled job",
  labelNames: ["job_name"] as const,
  registers: [metricsRegistry],
});

/**
 * Normalize Express route path for metric labels.
 * Replaces dynamic segments (MongoDB ObjectIds, ULIDs, UUIDs, numeric IDs)
 * with :id to avoid high-cardinality labels.
 */
function normalizeRoutePath(req: Request): string {
  // Use the matched route pattern if available (Express route layer)
  if (req.route?.path) {
    return req.baseUrl + req.route.path;
  }

  // Fallback: normalize the URL path by replacing dynamic segments
  const path = req.path || req.url.split("?")[0];
  return path
    .replace(/\/[0-9a-fA-F]{24}\b/g, "/:id") // MongoDB ObjectId
    .replace(/\/[0-9A-Z]{26}\b/g, "/:id") // ULID
    .replace(
      /\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
      "/:id",
    ) // UUID
    .replace(/\/\d+\b/g, "/:id"); // Numeric IDs
}

/**
 * Express middleware that records HTTP request duration and count.
 * Should be mounted early in the middleware chain (after basic parsing).
 */
export function metricsCollector(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Skip metrics endpoint itself to avoid self-referential noise
  if (req.path === "/metrics") {
    next();
    return;
  }

  const start = process.hrtime.bigint();

  // Hook into response finish event
  res.on("finish", () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSeconds = durationNs / 1e9;
    const route = normalizeRoutePath(req);
    const method = req.method;
    const statusCode = String(res.statusCode);

    httpRequestDuration
      .labels(method, route, statusCode)
      .observe(durationSeconds);
    httpRequestsTotal.labels(method, route, statusCode).inc();
  });

  next();
}

/**
 * Handler for GET /metrics endpoint.
 * Protected by Bearer METRICS_TOKEN authentication.
 * Validates: Requirements 13.3
 */
export async function metricsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const metricsToken = process.env.METRICS_TOKEN;

  // If METRICS_TOKEN is set, require Bearer token auth
  if (metricsToken) {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const token = authHeader.slice(7);
    if (token !== metricsToken) {
      res.status(403).json({ success: false, error: "Forbidden" });
      return;
    }
  }

  res.set("Content-Type", metricsRegistry.contentType);
  const metrics = await metricsRegistry.metrics();
  res.end(metrics);
}
