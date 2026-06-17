# High Availability Configuration

Operational documentation for deploying MathAI backend services with redundancy and fault tolerance.

**Requirements:** 13.7 (Backend API ≥ 2 instances behind load balancer), 13.8 (Worker 1 instance with DB lock protection)

---

## Architecture Overview

```
                    ┌─────────────────┐
                    │  Load Balancer   │
                    │  (health check)  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
        │  API #1   │ │  API #2   │ │  API #N   │
        │ port 3001 │ │ port 3001 │ │ port 3001 │
        └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────┴────────┐
                    │  MongoDB Atlas  │
                    │   (replica set) │
                    └─────────────────┘
                             │
                    ┌────────┴────────┐
                    │   Worker (1x)   │
                    │  cron + jobs    │
                    └─────────────────┘
```

MathAI production runs two distinct process types from the same codebase:

| Process | Entrypoint | Instances | Scaling |
|---------|-----------|-----------|---------|
| Backend API | `packages/backend/src/index.ts` | ≥ 2 | Horizontal behind LB |
| Worker | `packages/backend/src/worker.ts` | 1 | Singleton (DB lock) |

---

## Backend API — Horizontal Scaling

### Why multiple instances

- Zero-downtime deploys (rolling restart)
- Fault tolerance — one instance crash does not cause downtime
- Load distribution across CPU cores / containers

### Stateless design

The Express API is stateless. All session state lives in MongoDB (JWT tokens are self-contained). Any request can be served by any instance.

Key stateless properties:
- JWT auth — no server-side session store
- MongoDB for all persistent state
- No in-memory caches that require consistency across instances
- File uploads go directly to Object Storage (S3/R2)

### Minimum instance count

Production **must** run at least 2 API instances simultaneously (Requirement 13.7). This ensures:
- One instance can restart/deploy while the other serves traffic
- A single instance failure does not cause full outage

### Load balancer configuration

Configure the load balancer with:

```yaml
# Example: nginx / ALB / cloud LB configuration
health_check:
  path: /health/ready
  method: GET
  interval: 10s
  timeout: 5s
  healthy_threshold: 2
  unhealthy_threshold: 3
  expected_status: 200

routing:
  algorithm: round-robin   # or least-connections
  sticky_sessions: false   # not needed — API is stateless

backend_targets:
  - host: api-instance-1:3001
  - host: api-instance-2:3001
```

### Health check endpoint

The `/health/ready` endpoint (already implemented in `packages/backend/src/app.ts`) returns:
- **HTTP 200** when MongoDB ping succeeds AND email config is valid
- **HTTP 503** when any dependency check fails

Use this for load balancer health checks. Unhealthy instances are automatically removed from the pool.

There is also a `/health` liveness endpoint that always returns 200 — use this for container orchestrator liveness probes (restart on failure), not for LB routing.

### Deployment strategy

Recommended: **rolling update** with the following sequence:

1. Deploy new version to instance A
2. Wait for `/health/ready` to return 200
3. LB routes traffic to instance A
4. Deploy new version to instance B
5. Wait for `/health/ready` to return 200
6. LB routes traffic to both instances

Never take all instances offline simultaneously.

---

## Worker Process — Singleton Pattern

### Why single instance

The worker process (`packages/backend/src/worker.ts`) runs scheduled cron jobs. It **must** run as exactly 1 instance in production (Requirement 13.8) until migration to BullMQ + Redis cluster is complete.

Reason: while the scheduler has DB-level lock protection, running multiple worker instances would create unnecessary lock contention and "skipped" job runs. The DB lock is a safety net, not a distribution mechanism.

### DB lock protection mechanism

The scheduler service uses MongoDB-backed locking to prevent concurrent execution of the same job:

```
┌─────────────────────────────────────────────────────┐
│ Job trigger fires                                    │
│                                                      │
│ 1. Check ScheduledJobRun collection:                │
│    - Find records with job_name + status="running"  │
│    - If started_at is within lockTimeoutMs → LOCKED │
│                                                      │
│ 2. If LOCKED:                                       │
│    - Insert ScheduledJobRun with status="skipped"   │
│    - Return immediately                             │
│                                                      │
│ 3. If NOT LOCKED:                                   │
│    - Insert ScheduledJobRun with status="running"   │
│    - Execute job handler                            │
│    - Update record to "succeeded" or "failed"       │
└─────────────────────────────────────────────────────┘
```

This means:
- If the worker crashes mid-job, the lock expires after `lockTimeoutMs` (typically 5–10 minutes per job)
- A replacement worker instance can safely start after the lock timeout
- No two executions of the same job overlap within the lock window

### Worker deployment

```yaml
# Container / process manager configuration
worker:
  command: npx tsx packages/backend/src/worker.ts
  instances: 1          # MUST be 1
  restart_policy: always
  env:
    FEATURE_SCHEDULER_ENABLED: "true"
    NODE_ENV: production
    MONGODB_URI: <same as API instances>
```

### Worker failure recovery

| Scenario | Behavior |
|----------|----------|
| Worker crashes | Process manager restarts it. Lock expires after `lockTimeoutMs`. Next cron tick runs normally. |
| Worker hangs | Monitor `scheduled_job_last_run_at` metric. Alert if job misses expected interval × 1.5. |
| Deploy new version | Stop worker → deploy → start worker. Jobs missed during restart run on next cron tick. |
| Accidental 2nd instance | DB lock causes second instance's jobs to be "skipped". No data corruption, but wasteful. |

### Monitoring worker health

The worker does not expose an HTTP endpoint. Monitor it via:

1. **`scheduled_job_last_run_at` gauge** (exposed by API `/metrics`) — alerts if a job hasn't run within expected interval × 1.5
2. **`ScheduledJobRun` collection** — query for recent runs with `status="failed"` or excessive `status="skipped"`
3. **Process manager health** — ensure the worker process is running (systemd, Docker, ECS task count = 1)

---

## Environment Configuration

### Required environment variables (both API and Worker)

```bash
NODE_ENV=production
MONGODB_URI=mongodb+srv://...        # Same connection string for API + Worker
DB_NAME=mathai_production
JWT_SECRET=<rotated quarterly>
JWT_REFRESH_SECRET=<rotated quarterly>
```

### API-specific

```bash
BACKEND_PORT=3001
CORS_ORIGIN=https://mathai.vn
APP_BASE_URL=https://mathai.vn
EMAIL_PROVIDER=http
EMAIL_API_URL=https://api.resend.com/emails
EMAIL_API_KEY=<secret>
EMAIL_FROM="MathAI <no-reply@mathai.vn>"
```

### Worker-specific

```bash
FEATURE_SCHEDULER_ENABLED=true
# Worker uses same MONGODB_URI, no additional ports needed
```

---

## Scaling Checklist

Before going to production with HA:

- [ ] At least 2 API instances running behind load balancer
- [ ] Load balancer health check configured to `/health/ready`
- [ ] Worker running as exactly 1 instance with `FEATURE_SCHEDULER_ENABLED=true`
- [ ] Worker process manager configured with `restart_policy: always`
- [ ] MongoDB Atlas replica set (not standalone) for connection failover
- [ ] Alert configured: `scheduled_job_last_run_at` gap > expected_interval × 1.5
- [ ] Alert configured: API instance count < 2
- [ ] Rolling deploy strategy configured (no full-fleet restart)
- [ ] Verified: `/health/ready` returns 503 when MongoDB is unreachable

---

## Future: Migration to BullMQ + Redis

When traffic grows beyond single-worker capacity (Giai đoạn 3+):

1. Add Redis cluster for job queue
2. Replace `node-cron` with BullMQ producers (API) + consumers (workers)
3. Scale workers horizontally — BullMQ handles distribution and deduplication
4. Remove the MongoDB-based lock mechanism (BullMQ provides its own)
5. Update this document with new architecture

Until then, the single-worker + DB-lock pattern is sufficient and operationally simpler.
