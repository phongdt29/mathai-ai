# MathAI Alerting Rules Documentation

> **Validates:** Requirements 13.6  
> **Timezone:** Asia/Ho_Chi_Minh (ICT, UTC+7)  
> **Format:** Prometheus Alerting Rules (`alerting-rules.yml`)  
> **Metrics source:** `GET /metrics` (prom-client, protected by `METRICS_TOKEN`)

---

## Overview

This document describes each alerting rule configured for MathAI production monitoring. Rules are defined in `docs/operations/alerting-rules.yml` using standard Prometheus alerting rule syntax and are designed to be loaded by Prometheus Alertmanager or compatible systems (Grafana Cloud, VictoriaMetrics, etc.).

### Severity Levels

| Severity | Response Time | Notification Channel | Action |
|----------|--------------|---------------------|--------|
| **warning** | Within 1 hour during business hours | Slack #mathai-alerts | Investigate, may self-resolve |
| **critical** | Immediate (24/7) | Slack #mathai-critical + PagerDuty | Requires immediate human intervention |

### Available Metrics

These metrics are exposed by `packages/backend/src/middleware/metrics.ts`:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_request_duration_seconds` | Histogram | method, route, status_code | HTTP request latency |
| `http_requests_total` | Counter | method, route, status_code | Total HTTP request count |
| `active_engagement_sessions` | Gauge | — | Currently active student sessions |
| `notification_delivery_total` | Counter | channel, status | Notification delivery outcomes |
| `payment_intent_total` | Counter | gateway, status | Payment intent outcomes |
| `scheduled_job_duration_seconds` | Histogram | job_name | Cron job execution duration |
| `scheduled_job_last_run_at` | Gauge | job_name | Last successful run timestamp |

---

## Rules Reference

### HTTP 5xx Error Rate

| Field | Warning | Critical |
|-------|---------|----------|
| **Alert name** | `HttpServerErrorRateWarning` | `HttpServerErrorRateCritical` |
| **Threshold** | > 1% of requests return 5xx | > 5% of requests return 5xx |
| **Window** | 5 minutes | 5 minutes |
| **For duration** | 5m | 5m |

**What it detects:** Server-side errors indicating application failures, unhandled exceptions, or downstream service outages.

**Investigation steps:**
1. Check Sentry for new unhandled exceptions
2. Review recent deployments (`git log --oneline -5`)
3. Verify MongoDB Atlas cluster health
4. Check external service status (AI providers, email, SMS)
5. Review application logs: `docker logs mathai-api --tail 100`

**Common causes:**
- Failed MongoDB connections (check Atlas status)
- AI provider rate limiting or outage
- Memory exhaustion (check `process_resident_memory_bytes`)
- Unhandled promise rejections after code deploy

---

### HTTP p95 Latency

| Field | Value |
|-------|-------|
| **Alert name** | `HttpP95LatencyWarning` |
| **Threshold** | p95 response time > 1500ms |
| **Window** | 10 minutes |
| **For duration** | 10m |
| **Severity** | warning |

**What it detects:** Degraded response times affecting user experience. The 95th percentile ensures we catch tail latency issues without alerting on occasional slow requests.

**Investigation steps:**
1. Identify slow routes: check per-route `http_request_duration_seconds` breakdown
2. Check MongoDB slow query log (Atlas Performance Advisor)
3. Review `active_engagement_sessions` gauge for load spikes
4. Check AI provider response times (OCR/solver endpoints)
5. Verify Node.js event loop lag: `nodejs_eventloop_lag_seconds`

**Common causes:**
- Unindexed MongoDB queries under load
- AI provider latency spikes
- Large payload processing (file uploads)
- Connection pool exhaustion

---

### MongoDB Connection Failures

| Field | Value |
|-------|-------|
| **Alert name** | `MongoDbConnectionFailuresCritical` |
| **Threshold** | > 5 failures per minute |
| **Window** | 1 minute |
| **For duration** | 1m |
| **Severity** | critical |

**What it detects:** Database connectivity issues that will cascade into widespread 503 errors across all API endpoints.

**Investigation steps:**
1. Check MongoDB Atlas cluster status and events
2. Verify network connectivity from application instances
3. Check connection pool metrics (`mongodb_connection_pool_*`)
4. Review Atlas alerts for maintenance windows
5. Check `/health/ready` endpoint response

**Immediate actions:**
- If Atlas maintenance: wait for completion, verify auto-recovery
- If network issue: check VPC peering / security groups
- If pool exhaustion: restart application instances, investigate connection leaks

---

### Notification Delivery Failure

| Field | Value |
|-------|-------|
| **Alert name** | `NotificationDeliveryFailureRateWarning` |
| **Threshold** | > 10% failure rate |
| **Window** | 15 minutes |
| **For duration** | 15m |
| **Severity** | warning |

**What it detects:** Elevated failure rate in notification delivery across channels (email, SMS, push, in_app).

**Investigation steps:**
1. Check `notification_delivery_total` by channel to identify which channel is failing
2. Verify email provider status (Resend/SendGrid dashboard)
3. Check SMS provider status (eSMS/Twilio)
4. Verify push notification credentials (VAPID keys, FCM)
5. Review `NotificationDelivery` collection for error patterns

**Common causes:**
- Email provider API key expired or rate limited
- SMS provider balance depleted
- Push subscription tokens expired (normal churn)
- Template rendering errors for specific notification types

---

### Webhook Signature Invalid

| Field | Value |
|-------|-------|
| **Alert name** | `WebhookSignatureInvalidCritical` |
| **Threshold** | > 5 invalid signatures in 10 minutes |
| **Window** | 10 minutes |
| **For duration** | 1m |
| **Severity** | critical |

**What it detects:** Payment webhook requests with invalid HMAC signatures, potentially indicating a replay attack, secret key mismatch, or gateway misconfiguration.

**Investigation steps:**
1. Check `webhook_log` collection for recent `signature_invalid` entries
2. Compare request source IPs against known VNPAY/MOMO IP ranges
3. Verify `PAYMENT_VNPAY_HASH_SECRET` and `PAYMENT_MOMO_SECRET_KEY` match gateway config
4. Check if gateway recently rotated their signing keys
5. Review for patterns (same IP, same payload structure)

**Immediate actions:**
- If attack suspected: temporarily block source IPs at load balancer
- If key mismatch: rotate secrets per `docs/operations/secret-rotation.md`
- If gateway change: contact VNPAY/MOMO support to verify signing algorithm

---

### Cron Job Missed

| Field | Value |
|-------|-------|
| **Alert name** | `CronJobMissedRunWarning` |
| **Threshold** | `last_run_at` exceeds 1.5× expected interval |
| **For duration** | 5m |
| **Severity** | warning |

**What it detects:** Scheduled jobs that have not executed within their expected timeframe, indicating worker process issues.

**Known job intervals:**

| Job Name | Cron | Expected Interval |
|----------|------|-------------------|
| `attendance.mark_pending_absences` | `*/10 * * * *` | 10 minutes |
| `attendance.finalize_absences` | `*/30 * * * *` | 30 minutes |
| `risk.compute_daily` | `0 3 * * *` | 24 hours |
| `parent_weekly_report.send` | `0 7 * * 1` | 7 days |
| `notification.retry_failed` | `*/5 * * * *` | 5 minutes |
| `ocr.cleanup_expired` | `0 4 * * *` | 24 hours |

**Investigation steps:**
1. Check worker process status: `docker ps | grep mathai-worker`
2. Verify `FEATURE_SCHEDULER_ENABLED=true` in worker environment
3. Check for lock contention in `scheduled_job_run` collection (status="running" stuck)
4. Review worker logs for crash/restart loops
5. Verify MongoDB connectivity from worker instance

**Common causes:**
- Worker process crashed and not restarted
- DB lock stuck from previous failed run (check `lockTimeoutMs`)
- Feature flag accidentally disabled
- Worker deployed without scheduler config

---

### AI Provider Error Rate

| Field | Value |
|-------|-------|
| **Alert name** | `AiProviderErrorRateWarning` |
| **Threshold** | > 20% error rate on AI endpoints |
| **Window** | 10 minutes |
| **For duration** | 10m |
| **Severity** | warning |

**What it detects:** Elevated error rate on AI-powered endpoints (OCR solver, classification, recommendations), indicating provider issues.

**Investigation steps:**
1. Check AI provider dashboard (OpenAI/Anthropic/Google status pages)
2. Review `/admin/ai-providers` for provider health and `last_used_at`
3. Check rate limit headers in recent AI API responses
4. Verify API keys are valid and have sufficient quota
5. Test provider connectivity: POST `/api/admin/ai/providers/:id/test`

**Common causes:**
- AI provider rate limiting (quota exceeded)
- Provider outage or degraded performance
- API key expired or revoked
- Model deprecated or endpoint changed

---

### Disk Space

| Field | Value |
|-------|-------|
| **Alert name** | `DbFreeDiskSpaceWarning` |
| **Threshold** | Free disk space < 20% |
| **Window** | 5 minutes |
| **For duration** | 5m |
| **Severity** | warning |

**What it detects:** Low disk space that could lead to write failures, MongoDB crashes, or inability to store uploads.

**Investigation steps:**
1. Check MongoDB Atlas storage metrics
2. Verify `ocr.cleanup_expired` cron is running (removes expired OCR results)
3. Review object storage usage by scope (solver, submissions, avatars)
4. Check application log file sizes
5. Review MongoDB oplog size

**Remediation:**
- Run manual OCR cleanup if cron missed
- Expand Atlas cluster storage tier
- Archive old audit logs to cold storage
- Review and apply object storage lifecycle policies

---

### Backup Overdue

| Field | Value |
|-------|-------|
| **Alert name** | `BackupOverdueCritical` |
| **Threshold** | Last successful backup > 26 hours ago |
| **For duration** | 5m |
| **Severity** | critical |

**What it detects:** Backup system failure that violates the RPO target of 1 hour. Daily backups should complete within 24 hours; the 26-hour threshold provides a 2-hour grace period.

**Investigation steps:**
1. Check MongoDB Atlas backup status (Continuous Backup tab)
2. Verify Atlas backup schedule is enabled and not paused
3. Check for Atlas maintenance events that may have interrupted backups
4. Review object storage backup job logs
5. Verify backup storage bucket has sufficient space

**Immediate actions:**
- Trigger manual backup snapshot in Atlas
- Verify PITR oplog window is still intact
- If backup storage full: expand storage, clean old snapshots beyond retention
- Escalate to infrastructure team if Atlas backup service is degraded

**Reference:** See `docs/operations/restore-runbook.md` for PITR restore procedures and `docs/operations/disaster-recovery.md` for full DR plan (RTO: 4h, RPO: 1h).

---

## Alertmanager Configuration (Example)

```yaml
# alertmanager.yml — example routing configuration
route:
  receiver: slack-default
  group_by: ['alertname', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: pagerduty-critical
      repeat_interval: 1h
    - match:
        severity: warning
      receiver: slack-warnings
      repeat_interval: 4h

receivers:
  - name: slack-default
    slack_configs:
      - channel: '#mathai-alerts'
        send_resolved: true

  - name: slack-warnings
    slack_configs:
      - channel: '#mathai-alerts'
        send_resolved: true

  - name: pagerduty-critical
    pagerduty_configs:
      - service_key: '<PAGERDUTY_SERVICE_KEY>'
    slack_configs:
      - channel: '#mathai-critical'
        send_resolved: true
```

---

## Grafana Dashboard Integration

These alerting rules can be imported into Grafana as:
1. **Prometheus data source alerts** — native Grafana alerting with the same PromQL expressions
2. **Dashboard panels** — visualize each metric with threshold lines for quick status overview

Recommended dashboard panels:
- HTTP error rate (5xx%) with warn/critical threshold lines
- p95 latency time series
- Notification delivery success/failure stacked bar
- Cron job last-run timeline
- Payment webhook validity pie chart

---

## Maintenance & Review

- **Quarterly review:** Adjust thresholds based on traffic growth and baseline metrics
- **After incidents:** Add or refine rules based on post-mortem findings
- **Threshold tuning:** Use 2-week rolling baseline to avoid alert fatigue
- **Silence during maintenance:** Use Alertmanager silences for planned downtime windows
