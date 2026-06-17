# Phase 6.3-6.5 deployment verification and recovery drills

This runbook completes the Phase 6 deployment safety checkpoint for MathAI. It is intentionally local-first and dry-run-first: it documents verification gates, rollback checkpoints, recovery drill evidence, and manual approvals without touching production services or deleting data.

## Scope and safety rules

- Work only from the root workspace, not the nested `mathai/` directory.
- Do not call production healthchecks, MongoDB, object storage, or external APIs from automation in this phase.
- Do not print secret values. Record only key names, presence, owners, and redacted status.
- Do not perform a real restore as part of this drill. Restore commands are templates that require separate approval.
- Do not create a release tag until full release verification is complete. Checkpoint tags are allowed for internal rollback evidence.

## P6.3 deployment verification gates

Run the dry-run checklist before and after packaging or deployment approval:

```cmd
npm run deploy:verify
```

The checklist script performs local checks only and reports:

1. Current Git branch and short commit.
2. Working tree status requiring review before commit.
3. Existing checkpoint tags at `HEAD`.
4. Required verification commands.
5. Required environment key presence with secret-like values redacted.
6. Feature flag snapshot from process environment or safe defaults.
7. Backup plan and restore drill command availability.
8. Backend/frontend healthcheck URL placeholders without network calls.
9. Production-like student smoke evidence, operational readiness evidence, and backup/restore drill evidence manifest requirements.
10. Manual go/no-go responsibilities.

Required verification commands for Phase 6 completion match the checklist/CI contract:

```cmd
npm run verify
npm test --workspace packages/backend
npm run build --workspace packages/backend
npm run test:backup-plan
npm run deploy:verify
```

Before production sign-off, attach all evidence manifests to the deployment ticket and point the checklist at their sanitized locations:

```cmd
npm run deploy:verify -- --student-smoke-evidence=artifacts/deployment/student-smoke-evidence.json --operational-evidence=artifacts/deployment/operational-readiness-evidence.json --backup-restore-evidence=artifacts/deployment/backup-restore-evidence.json
```

The script verifies artifact presence, canonical manifest shape, passing status, at least one check, and sanitized evidence content. Operational readiness evidence must also include the monitoring/alerting contract and redacted email provider smoke contract described below. It does not call external systems or print secret values.

Manual go/no-go release gate:

1. CI runs the same dry-run checklist with the expected branch supplied from the workflow branch context; pull requests remain review-only because the checklist does not execute deployment operations.
2. The deployment owner records the `npm run verify`, backup/checklist test, and `npm run deploy:verify` outputs in the release ticket.
3. The release manager confirms the checklist `releaseGate.status` is `pass` or explicitly documents every `review_required` condition with owner approval.
4. Student smoke evidence, operational readiness evidence, canonical backup/restore drill evidence, and redacted environment snapshot must match the checklist manifests before final go/no-go.

Optional deployment artifact packaging command, only after the required gates pass:

```cmd
npm run build:deploy
```

`npm run build:deploy` recreates the `deploy/` directory. The packaging script must write production-safe MongoDB-first `.env.example` templates into `deploy/.env.example`, `deploy/backend/.env.example`, and `deploy/frontend/.env.example`; these templates must not be copied from local development defaults or legacy SQL examples. This behavior is covered by `scripts/build-deploy.test.js`, which is included in `npm run test:backup-plan`.

## Environment and feature flag snapshot

Record environment key presence in the deployment ticket. Never paste values for secret-like keys. Staging and production must be represented by separate secret/config entries; do not reuse production secrets in staging or commit real values to `.env.example` files.

Active runtime is MongoDB/Mongoose. SQL/MySQL variables from older templates are legacy reference-only and are not backend runtime requirements. If a deployment platform still exposes `DB_HOST`, `DB_USER`, `DB_PASSWORD`, or other SQL keys, mark them as unused by MathAI runtime before release instead of treating them as required.

Production config contract:

- Backend production (`NODE_ENV=production`) requires explicit `JWT_SECRET`, `JWT_REFRESH_SECRET`, `MONGODB_URI`, `CORS_ORIGIN`, and `APP_BASE_URL` values. `MONGODB_URI`, `CORS_ORIGIN`, and `APP_BASE_URL` must be valid and must not point to localhost. `BACKEND_PORT` must be an integer from 1 to 65535.
- Forgot/reset password is enabled through `/api/auth/forgot-password` and `/api/auth/reset-password`. Reset links use `APP_BASE_URL`, expire after 30 minutes, and are invalidated when the user's password hash changes. `EMAIL_PROVIDER=console` is acceptable for local development only; production-like and production environments must use `EMAIL_PROVIDER=http` with `EMAIL_FROM`, `EMAIL_API_URL`, and `EMAIL_API_KEY` stored in the secret/config manager. `EMAIL_API_KEY` must be a real provider credential, not placeholder text such as `change-me`, `replace-with-*`, or `your-*`.
- Email provider smoke evidence is a manual evidence contract, not an automated external call. Record only the provider (`http`), production-like environment name, `status=passed`, timestamp, and sanitized ticket/artifact reference. Do not record recipient email addresses, reset tokens, API keys, Authorization headers, provider request/response bodies, or raw provider URLs.
- Frontend production build requires explicit `NEXT_PUBLIC_API_URL` as an absolute `http(s)` URL that does not point to localhost.
- `BACKEND_API_URL` is a conditional Next.js rewrite target for non-production dev/staging by default. Leave it unset in production unless the deploy platform intentionally uses server rewrites; if set for that purpose, it must be an absolute non-localhost URL.
- Development/test may use local defaults: backend MongoDB/CORS/JWT defaults, browser API default `/api`, and Next dev rewrite default `http://localhost:3001/api` when `BACKEND_API_URL` is unset.

Required keys to confirm for backend/deployment runtime:

- `NODE_ENV`
- `BACKEND_PORT`
- `CORS_ORIGIN`
- `APP_BASE_URL`
- `MONGODB_URI`
- `DB_NAME`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_EXPIRES_IN`
- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `EMAIL_API_URL`
- `EMAIL_API_KEY`
- `ENABLE_DEMO_AUTH_TOKENS` (must remain false/empty in production)

Conditional AI-backed runtime keys to confirm only when `FEATURE_AI_SAFETY_GUARD=true` is explicitly configured for the deployment environment:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

Required keys to confirm for frontend production builds:

- `NODE_ENV`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_ENABLE_DEMO_LOGIN` (must remain false/empty in production)
- `BACKEND_API_URL` (conditional; normally non-production Next.js dev/staging rewrites only, or an intentional deploy rewrite target)

Phase 6 feature flags to capture:

- `FEATURE_SCOPED_AUTHORIZATION_ENFORCEMENT`
- `FEATURE_AUDIT_LOGGING`
- `FEATURE_AI_SAFETY_GUARD`
- `FEATURE_ANTI_FRAUD_SIGNAL_GENERATION`
- `FEATURE_GRADEBOOK_SUMMARIES`
- `FEATURE_DEPLOYMENT_CHECKPOINTS`

Security, audit, AI safety, anti-fraud, and gradebook summary flags are safe-by-default in code. `FEATURE_DEPLOYMENT_CHECKPOINTS` remains opt-in until operational rollout is explicitly approved.

## Operational readiness and monitoring evidence gate

P0 release approval requires a sanitized `artifacts/deployment/operational-readiness-evidence.json` manifest, or an equivalent ticket attachment referenced by `--operational-evidence`. This is a repo-ready monitoring/alerting contract; it does not require a real external monitoring service in this phase. Do not include webhook URLs, provider keys, JWT secrets, MongoDB addresses, user emails, reset secrets, prompt payloads, student content, or raw provider payloads.

Canonical manifest fields required by the validator:

- `generated_at`: ISO-8601 timestamp for when the sanitized evidence manifest was created.
- `environment`: production-like environment name; do not include hostnames if they expose private routing.
- `status`: must be exactly `"passed"` for release gate approval.
- `monitoring_contract`: required object containing critical logs, metrics, alerts, thresholds, a sample alert test record, and redaction rules.
- `checks`: non-empty array of sanitized check records. Each check must be an object with non-empty string `name`, `status` exactly `"passed"`, and non-empty string `evidence` containing a sanitized summary or artifact path. Do not include webhook URLs, API keys, JWT secrets, MongoDB URIs, user emails, reset tokens, or raw external-provider payloads.

Monitoring/alerting contract requirements:

- `critical_logs`: at least three sanitized log categories to confirm during release. Cover backend application errors, auth/password-reset failures, database connectivity failures, email provider failures, and AI fallback/safety-guard events. Use route families and request IDs only; no user identifiers or payloads.
- `critical_metrics`: at least three metrics. P0 coverage includes `/health/ready` status/latency, HTTP 5xx rate, password-reset delivery failures, email provider failures, AI fallback/error rate, and MongoDB connection state.
- `critical_alerts`: at least three alerts. P0 coverage includes readiness degraded, HTTP 5xx budget burn, password-reset delivery failure spike, email provider failure spike, AI provider fallback spike, and MongoDB disconnected.
- `thresholds`: at least three records with non-empty `name`, `operator`, `value`, and `severity` strings. `metric` is recommended for readability. Baseline thresholds are readiness degraded for 2 consecutive checks over 2 minutes, HTTP 5xx >= 5% or >= 20 responses over 5 minutes, password-reset delivery failures >= 3 over 10 minutes, email provider failures >= 5% over 10 minutes, and AI fallback/errors >= 10% over 10 minutes.
- `sample_alert_test_record`: required sanitized object with `alert_name`, `triggered_at`, `destination`, `delivered: true`, `acknowledged_by_role`, and `evidence`. The destination is a route or owner name only, never a webhook URL or private channel identifier.
- `redaction_rules`: at least two rules confirming that webhook URLs, auth credentials, provider keys, JWTs, MongoDB addresses, connection details, user emails, reset secrets, prompt payloads, student content, and raw provider responses are excluded.

Email provider smoke contract:

- Include a `checks[]` record named `email_provider_smoke_contract`.
- That check must include `emailProviderSmoke.provider`, `emailProviderSmoke.environment`, and `emailProviderSmoke.status: "passed"`.
- Evidence must confirm provider/environment-level delivery behavior only; do not include recipient addresses, message IDs that expose provider internals, tokens, or raw provider payloads.

Operational readiness template:

```json
{
  "generated_at": "2026-05-12T00:00:00.000Z",
  "environment": "production-like-staging",
  "status": "passed",
  "monitoring_contract": {
    "critical_logs": [
      "backend application errors with request id and route family",
      "authentication and password-reset failures without user identifiers",
      "database connectivity and migration/seed failures",
      "email delivery provider failures without recipient addresses",
      "AI provider fallback or safety-guard events without prompt payloads"
    ],
    "critical_metrics": [
      "/health/ready status and latency",
      "HTTP 5xx rate by route family",
      "password-reset request and delivery failure rate",
      "email provider failure rate",
      "AI provider error/fallback rate",
      "MongoDB connection state"
    ],
    "critical_alerts": [
      "readiness degraded",
      "HTTP 5xx error budget burn",
      "password-reset delivery failure spike",
      "email provider failure spike",
      "AI provider fallback spike",
      "MongoDB disconnected"
    ],
    "thresholds": [
      {
        "name": "readiness_degraded",
        "metric": "/health/ready status",
        "operator": ">=",
        "value": "2 consecutive degraded checks over 2 minutes",
        "severity": "critical"
      },
      {
        "name": "http_5xx_rate",
        "metric": "HTTP 5xx rate",
        "operator": ">=",
        "value": "5% over 5 minutes or 20 responses over 5 minutes",
        "severity": "critical"
      },
      {
        "name": "password_reset_delivery_failures",
        "metric": "password reset delivery failures",
        "operator": ">=",
        "value": "3 failed deliveries over 10 minutes",
        "severity": "high"
      },
      {
        "name": "email_provider_failures",
        "metric": "email provider failures",
        "operator": ">=",
        "value": "5% failures over 10 minutes",
        "severity": "high"
      },
      {
        "name": "ai_provider_fallback_rate",
        "metric": "AI provider fallback or error rate",
        "operator": ">=",
        "value": "10% fallback/error rate over 10 minutes",
        "severity": "medium"
      }
    ],
    "sample_alert_test_record": {
      "alert_name": "readiness_degraded_test",
      "triggered_at": "2026-05-12T00:05:00.000Z",
      "destination": "operations-on-call route name only",
      "delivered": true,
      "acknowledged_by_role": "Operations owner",
      "evidence": "Sanitized ticket attachment path; delivery route id redacted."
    },
    "redaction_rules": [
      "Do not include webhook URLs, auth credentials, provider keys, JWTs, MongoDB addresses, or connection details.",
      "Do not include user emails, reset secrets, prompt payloads, student content, or raw provider responses.",
      "Use route families, role names, ticket ids, and sanitized artifact paths instead of identifiers."
    ]
  },
  "checks": [
    {
      "name": "monitoring_alert_destination",
      "status": "passed",
      "evidence": "Owner and alert route name recorded in deployment ticket; webhook URL redacted."
    },
    {
      "name": "monitoring_thresholds",
      "status": "passed",
      "evidence": "Readiness, HTTP 5xx, auth reset, email, and AI fallback thresholds recorded."
    },
    {
      "name": "test_alert_result",
      "status": "passed",
      "evidence": "Sanitized test alert result attached to deployment ticket."
    },
    {
      "name": "security_headers_review",
      "status": "passed",
      "evidence": "Helmet/security headers, CORS origin, and demo-login flags reviewed."
    },
    {
      "name": "rate_limit_review",
      "status": "passed",
      "evidence": "Auth, password-reset, solver/OCR, and sensitive endpoint limits reviewed."
    },
    {
      "name": "email_provider_smoke_contract",
      "status": "passed",
      "evidence": "Provider smoke passed; provider=http environment=production-like-staging status=passed. Ticket attachment contains no recipient PII or provider payload.",
      "emailProviderSmoke": {
        "provider": "http",
        "environment": "production-like-staging",
        "status": "passed"
      }
    },
    {
      "name": "email_delivery_check",
      "status": "passed",
      "evidence": "Password-reset delivery verified through approved test mailbox, or fallback approved, without user email addresses."
    },
    {
      "name": "backup_restore_evidence",
      "status": "passed",
      "evidence": "Dry-run backup plan, restore rehearsal plan, checksum location, retention owner, and restore approval gate attached."
    },
    {
      "name": "operator_signoff",
      "status": "passed",
      "evidence": "Deployment, data, security, operations, email, QA, and release owner sign-off recorded."
    }
  ]
}
```

Student smoke template:

```json
{
  "generated_at": "2026-05-12T00:00:00.000Z",
  "environment": "production-like-staging",
  "status": "passed",
  "checks": [
    {
      "name": "student_assignment_detail",
      "status": "passed",
      "evidence": "Sanitized run log or screenshot path attached; no user email addresses or tokens included."
    }
  ]
}
```

If any canonical field is missing, top-level `status` is not `"passed"`, `checks` is empty, a check is malformed, a check status is not `"passed"`, the monitoring contract is incomplete, the sample alert is not delivered/acknowledged, email provider smoke fields are missing, or evidence contains banned values, release status remains `review_required` until the owner attaches remediation evidence.

## Backup/restore drill evidence gate

P0 release approval also requires a sanitized `artifacts/deployment/backup-restore-evidence.json` manifest, or an equivalent ticket attachment referenced by `--backup-restore-evidence`. This is intentionally separate from operational readiness evidence so the release gate can block on restore-readiness even when monitoring/security/email evidence is otherwise complete.

The checklist validates this manifest locally only. It does not call MongoDB, object storage, production healthchecks, or external APIs. The canonical schema is generated by `npm run backup:plan` under `drillEvidence.manifestTemplate` and documented in `docs/runbooks/mongo-backup-restore.md`.

Backup/restore evidence template:

```json
{
  "generated_at": "2026-05-12T00:00:00.000Z",
  "environment": "production-like-staging",
  "drill_id": "backup-restore-drill-2026-05-12",
  "status": "passed",
  "rto": {
    "target_minutes": 60,
    "observed_minutes": 42,
    "evidence": "Restore rehearsal completed inside target window; sanitized log path attached."
  },
  "rpo": {
    "target_minutes": 15,
    "observed_minutes": 5,
    "evidence": "Backup timestamp and checkpoint timestamp compared in deployment ticket."
  },
  "backup_artifact": {
    "archive_path": "immutable://backup-vault/mathai/archive-redacted.gz",
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "size_bytes": 4096,
    "created_at": "2026-05-12T00:00:00.000Z",
    "storage_location": "immutable backup vault path recorded in ticket",
    "retention_until": "2026-08-12T00:00:00.000Z",
    "metadata_redacted": true
  },
  "restore_to_staging": {
    "target_environment": "isolated-staging-restore",
    "dry_run_log_path": "artifacts/deployment/restore-dry-run-redacted.log",
    "validation_log_path": "artifacts/deployment/restore-validation-redacted.log",
    "status": "passed"
  },
  "validations": {
    "checksum_verified": true,
    "collection_counts": [
      {
        "collection": "users",
        "source_count": 25,
        "restored_count": 25,
        "match": true
      }
    ],
    "critical_workflows": [
      {
        "name": "auth-readiness-smoke",
        "status": "passed",
        "evidence": "Sanitized staging smoke result attached."
      }
    ]
  },
  "approvals": {
    "data_owner": "pending-data-owner-signoff",
    "deployment_owner": "pending-deployment-owner-signoff",
    "release_manager": "pending-release-manager-signoff",
    "approved_for_production_restore": false
  }
}
```

The backup/restore gate fails if RTO/RPO observed values exceed targets, artifact metadata is not marked redacted, checksum verification is false, collection counts do not match, critical workflow evidence is missing, production restore approval is true, or any secret-like key/value appears in the manifest.

### Email provider manual smoke test and fallback

Perform this only in a production-like environment with real secrets supplied by the deployment platform or secret manager. Do not run this from automated tests and do not commit the evidence artifact.

1. Confirm backend config starts with `NODE_ENV=production`, `EMAIL_PROVIDER=http`, non-local `EMAIL_API_URL`, configured `EMAIL_FROM`, and configured `EMAIL_API_KEY`. The deployment checklist may report only presence/redacted status, never values.
2. Trigger `/api/auth/forgot-password` for an approved synthetic/test mailbox. The API response must remain generic and must not reveal account existence.
3. Confirm the provider accepted or delivered the reset email through the provider dashboard or test mailbox. Do not paste recipient address, reset link, token, Authorization header, API key, or raw provider payload into evidence.
4. Add or update the operational readiness manifest `email_provider_smoke_contract` check with only:
   - `provider`: `"http"`
   - `environment`: the production-like environment label
   - `status`: `"passed"`
   - sanitized evidence text or ticket attachment path
5. If provider delivery fails before release, keep the release gate in `review_required` unless the release manager explicitly approves fallback. Approved fallback evidence must name the owner, duration, user-support communication path, and remediation ticket, while preserving account-enumeration protection on `/api/auth/forgot-password`.
6. If provider delivery fails after release, leave forgot-password responses generic, alert on email provider failures, route users through the approved support fallback, and rotate/update provider credentials only through the secret manager.

## Checkpoint tags

Recommended checkpoint sequence:

1. Confirm current branch and status:
   ```cmd
   git status --short --branch
   git log --oneline --decorate -5
   ```
2. Create an internal pre-release checkpoint when all local dry-run gates pass and before release-candidate packaging, if the team needs a rollback anchor:
   ```cmd
   git tag checkpoint/pre-release-candidate
   ```
3. Create the final Phase 6 checkpoint tag only after required verification passes and the Phase 6 commit is created:
   ```cmd
   git tag checkpoint/phase-6-complete
   ```

Do not create semantic release tags such as `vX.Y.Z` from this runbook unless the release manager confirms full production release readiness.

## P6.4 recovery drills

Recovery drills are evidence-gathering exercises. They must not modify production data.

### Drill A: backup plan and restore rehearsal

1. Generate a dry-run backup plan:
   ```cmd
   npm run backup:plan -- --backup --output-dir=backups/mongodb
   ```
2. Generate a dry-run restore plan against a named archive placeholder:
   ```cmd
   npm run backup:plan -- --restore --backup-file=backups/mongodb/mathai-<timestamp>.archive.gz
   ```
3. Record generated plan JSON with the deployment ticket.
4. Create or update the sanitized backup/restore drill evidence manifest at `artifacts/deployment/backup-restore-evidence.json`.
5. Confirm the plan and manifest contain redacted MongoDB URIs and never print credentials.
6. Confirm the operator and reviewer can identify where immutable backup archives and checksum files would be stored.
7. Validate the evidence manifest through the release gate:
   ```cmd
   npm run deploy:verify -- --backup-restore-evidence=artifacts/deployment/backup-restore-evidence.json
   ```

### Drill B: rollback by Git tag

Use this only in a local or staging rehearsal unless an incident commander approves production rollback.

```cmd
git fetch --tags
git checkout <known-good-checkpoint-tag>
npm test --workspace packages/backend
npm run build --workspace packages/backend
```

Rollback decision checklist:

- Known-good tag and commit are recorded.
- Data contract compatibility is confirmed.
- Required environment keys and feature flag values are captured before and after rollback.
- A forward-fix owner and rollback owner are named.
- Rollback output is attached to the deployment or incident ticket.

### Drill C: feature flag rollback

Feature flags provide a conservative rollback path for behavior toggles.

1. Capture current flag snapshot with:
   ```cmd
   npm run deploy:verify -- --json
   ```
2. Prefer keeping these enabled unless the incident commander approves an override:
   - `FEATURE_SCOPED_AUTHORIZATION_ENFORCEMENT`
   - `FEATURE_AUDIT_LOGGING`
   - `FEATURE_AI_SAFETY_GUARD`
   - `FEATURE_ANTI_FRAUD_SIGNAL_GENERATION`
3. If a flag must be changed, update it through the approved secret/config manager, not by pasting values into logs.
4. Restart or redeploy only through the approved platform workflow.
5. Run post-change validation and capture a new redacted snapshot.

### Drill D: post-restore validation

After any staging restore rehearsal, validate the restored environment before considering production restore:

- Check backup archive checksum against the recorded SHA256.
- Compare collection names and document counts to the backup log.
- Run backend tests or smoke tests against staging configuration.
- Validate critical workflows: auth, class/student lookup, gradebook summary, AI safety guard path, audit log reads, and fraud review reads.
- Confirm no production secret values were written to restore logs.
- Confirm application version, Git tag, and feature flag snapshot match the intended rollback or recovery state.

## Responsibilities and approval evidence

Record these owners in the deployment ticket:

- Deployment owner: branch, commit, build/test evidence, and checkpoint tag.
- Data owner: backup plan, restore drill evidence, checksum location, and restore approval gate.
- Security owner: redacted environment review, staging/production separation, and feature flag safety review.
- Release manager or incident commander: final go/no-go, rollback decision, and communication notes.

## Related files

- `scripts/deploy-verification-checklist.js` for local dry-run deployment gates.
- `scripts/build-deploy.js` for packaging the deploy artifact and writing production-safe env examples after artifact cleanup.
- `scripts/mongo-backup-restore-plan.js` for sanitized backup and restore planning.
- `docs/runbooks/mongo-backup-restore.md` for MongoDB backup and restore procedures.
- Root and package/deploy `.env.example` files document the MongoDB runtime configuration contract and non-secret placeholders.
- `packages/frontend/env-config.cjs` documents frontend API URL defaults enforced by the build/runtime config.
