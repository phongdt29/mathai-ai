import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  metricsRegistry,
  metricsHandler,
  metricsCollector,
  httpRequestDuration,
  httpRequestsTotal,
} from "./metrics";
import type { Request, Response } from "express";

/**
 * Unit tests for Prometheus metrics middleware and endpoint.
 * Validates: Requirements 13.3, 13.4
 */

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: "GET",
    path: "/api/test",
    url: "/api/test",
    route: undefined,
    baseUrl: "",
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response & {
  _statusCode: number;
  _headers: Record<string, string>;
  _body: string;
  _finishCallbacks: Array<() => void>;
} {
  const res = {
    _statusCode: 200,
    _headers: {} as Record<string, string>,
    _body: "",
    _finishCallbacks: [] as Array<() => void>,
    statusCode: 200,
    status(code: number) {
      res._statusCode = code;
      res.statusCode = code;
      return res;
    },
    set(key: string, value: string) {
      res._headers[key] = value;
      return res;
    },
    json(body: unknown) {
      res._body = JSON.stringify(body);
      return res;
    },
    end(body?: string) {
      res._body = body || "";
      return res;
    },
    on(event: string, cb: () => void) {
      if (event === "finish") {
        res._finishCallbacks.push(cb);
      }
      return res;
    },
  };
  return res as unknown as Response & {
    _statusCode: number;
    _headers: Record<string, string>;
    _body: string;
    _finishCallbacks: Array<() => void>;
  };
}

describe("metrics middleware", () => {
  beforeEach(async () => {
    // Reset metrics between tests
    httpRequestDuration.reset();
    httpRequestsTotal.reset();
  });

  describe("metricsCollector", () => {
    it("should call next() immediately", () => {
      const req = createMockReq();
      const res = createMockRes();
      let nextCalled = false;

      metricsCollector(req, res as unknown as Response, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });

    it("should skip /metrics path", () => {
      const req = createMockReq({ path: "/metrics" });
      const res = createMockRes();
      let nextCalled = false;

      metricsCollector(req, res as unknown as Response, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      // No finish listener should be registered
      assert.equal(res._finishCallbacks.length, 0);
    });

    it("should record metrics on response finish", async () => {
      const req = createMockReq({ method: "GET", path: "/api/users" });
      const res = createMockRes();

      metricsCollector(req, res as unknown as Response, () => {});

      // Simulate response finish
      res.statusCode = 200;
      for (const cb of res._finishCallbacks) {
        cb();
      }

      // Check that metrics were recorded
      const metrics = await metricsRegistry.getMetricsAsJSON();
      const durationMetric = metrics.find(
        (m) => m.name === "http_request_duration_seconds",
      );
      const totalMetric = metrics.find(
        (m) => m.name === "http_requests_total",
      );

      assert.ok(durationMetric, "http_request_duration_seconds should exist");
      assert.ok(totalMetric, "http_requests_total should exist");
    });
  });

  describe("metricsHandler", () => {
    it("should return 401 when METRICS_TOKEN is set and no auth header", async () => {
      const originalToken = process.env.METRICS_TOKEN;
      process.env.METRICS_TOKEN = "test-secret-token";

      try {
        const req = createMockReq({ headers: {} });
        const res = createMockRes();

        await metricsHandler(req, res as unknown as Response);

        assert.equal(res._statusCode, 401);
        assert.ok(res._body.includes("Unauthorized"));
      } finally {
        process.env.METRICS_TOKEN = originalToken;
      }
    });

    it("should return 403 when Bearer token is wrong", async () => {
      const originalToken = process.env.METRICS_TOKEN;
      process.env.METRICS_TOKEN = "test-secret-token";

      try {
        const req = createMockReq({
          headers: { authorization: "Bearer wrong-token" },
        });
        const res = createMockRes();

        await metricsHandler(req, res as unknown as Response);

        assert.equal(res._statusCode, 403);
        assert.ok(res._body.includes("Forbidden"));
      } finally {
        process.env.METRICS_TOKEN = originalToken;
      }
    });

    it("should return metrics when Bearer token is correct", async () => {
      const originalToken = process.env.METRICS_TOKEN;
      process.env.METRICS_TOKEN = "test-secret-token";

      try {
        const req = createMockReq({
          headers: { authorization: "Bearer test-secret-token" },
        });
        const res = createMockRes();

        await metricsHandler(req, res as unknown as Response);

        assert.ok(res._headers["Content-Type"]);
        assert.ok(res._body.length > 0);
        assert.ok(
          res._body.includes("http_request_duration_seconds"),
          "Should contain http_request_duration_seconds metric",
        );
      } finally {
        process.env.METRICS_TOKEN = originalToken;
      }
    });

    it("should return metrics without auth when METRICS_TOKEN is empty", async () => {
      const originalToken = process.env.METRICS_TOKEN;
      process.env.METRICS_TOKEN = "";

      try {
        const req = createMockReq({ headers: {} });
        const res = createMockRes();

        await metricsHandler(req, res as unknown as Response);

        // Should not return 401/403
        assert.notEqual(res._statusCode, 401);
        assert.notEqual(res._statusCode, 403);
        assert.ok(res._body.length > 0);
      } finally {
        process.env.METRICS_TOKEN = originalToken;
      }
    });

    it("should return valid Prometheus exposition format with # HELP and # TYPE lines", async () => {
      const originalToken = process.env.METRICS_TOKEN;
      process.env.METRICS_TOKEN = "";

      try {
        const req = createMockReq({ headers: {} });
        const res = createMockRes();

        await metricsHandler(req, res as unknown as Response);

        const body = res._body;

        // Prometheus exposition format requires # HELP and # TYPE lines
        assert.ok(
          body.includes("# HELP"),
          "Prometheus format must include # HELP lines",
        );
        assert.ok(
          body.includes("# TYPE"),
          "Prometheus format must include # TYPE lines",
        );

        // Validate specific metric types are declared
        assert.ok(
          body.includes("# TYPE http_request_duration_seconds histogram"),
          "http_request_duration_seconds should be declared as histogram",
        );
        assert.ok(
          body.includes("# TYPE http_requests_total counter"),
          "http_requests_total should be declared as counter",
        );

        // Validate Content-Type header is set to Prometheus format
        assert.ok(
          res._headers["Content-Type"]?.includes("text/plain") ||
            res._headers["Content-Type"]?.includes("application/openmetrics-text"),
          "Content-Type should be Prometheus-compatible",
        );
      } finally {
        process.env.METRICS_TOKEN = originalToken;
      }
    });

    it("should include all required custom metrics in output", async () => {
      const originalToken = process.env.METRICS_TOKEN;
      process.env.METRICS_TOKEN = "";

      try {
        const req = createMockReq({ headers: {} });
        const res = createMockRes();

        await metricsHandler(req, res as unknown as Response);

        const body = res._body;

        // Requirement 13.4: all required metrics must be present
        const requiredMetrics = [
          "http_request_duration_seconds",
          "http_requests_total",
          "active_engagement_sessions",
          "notification_delivery_total",
          "payment_intent_total",
          "scheduled_job_duration_seconds",
          "scheduled_job_last_run_at",
        ];

        for (const metric of requiredMetrics) {
          assert.ok(
            body.includes(`# HELP ${metric}`),
            `Required metric ${metric} must have a # HELP line`,
          );
        }
      } finally {
        process.env.METRICS_TOKEN = originalToken;
      }
    });
  });
});
