# Phase 6.2 Mongo-first backup and restore runbook

This runbook is for MathAI deployment safety work in Phase 6. It is MongoDB-first because the backend runtime uses Express, Mongoose, and MongoDB. The SQL files in `database/` remain reference blueprints and are not the active runtime database.

## Safety rules

- Default to dry-run and staging verification before any production operation.
- Never paste or print `MONGODB_URI`, JWT secrets, OpenAI keys, object store credentials, or deployment tokens in logs.
- Do not delete data as part of this runbook. Destructive restore requires a separate approved incident ticket.
- Use least-privilege backup credentials with read access for backup and separate approved credentials for restore.
- Keep backup archives, checksum files, and restore logs in immutable storage with access auditing.

## Required checkpoints before migration or deployment

1. Confirm branch and commit:
   ```cmd
   git status --short --branch
   git log --oneline --decorate -5
   ```
2. Create a pre-change checkpoint tag if one does not exist:
   ```cmd
   git tag checkpoint/<phase-or-release>-pre-migration
   ```
3. Record feature flag values from the deployment environment. Phase 6.1 flags are documented in `packages/backend/.env.example`.
4. Run the backend verification gates:
   ```cmd
   npm test --workspace packages/backend
   npm run build --workspace packages/backend
   ```
5. Generate a dry-run backup plan without exposing secrets:
   ```cmd
   npm run backup:plan
   ```

## Full MongoDB backup

Use a full logical archive before schema/data migrations, high-risk releases, or incident response.

Dry-run planning command:

```cmd
npm run backup:plan -- --backup --output-dir=backups/mongodb
```

Approved manual backup command template:

```cmd
mongodump --uri "<from secret manager>" --db "mathai" --archive="backups/mongodb/mathai-<timestamp>.archive.gz" --gzip
```

Post-backup checksum:

```cmd
certutil -hashfile backups\mongodb\mathai-<timestamp>.archive.gz SHA256 > backups\mongodb\mathai-<timestamp>.archive.gz.sha256
```

Record in the deployment ticket:

- Git commit and checkpoint tag.
- Backup archive path and SHA256 checksum.
- MongoDB database name and collection count summary.
- Operator, reviewer, and approval ticket.
- Feature flag snapshot.

## Incremental or point-in-time backup guidance

If MongoDB deployment supports point-in-time recovery or oplog snapshots:

1. Verify the last successful full backup and checksum.
2. Confirm PITR/oplog retention covers the deployment window.
3. Record the cluster timestamp before migration.
4. Export oplog/PITR metadata from the backup provider without secret values.
5. Test restore to a staging database at the target timestamp.

If PITR is not available, treat each production migration as requiring a fresh full backup.

## Object and config artifacts

Back up artifacts that are needed to reproduce application behavior:

- User-uploaded files or private object-store prefixes.
- Deployment manifests and sanitized `.env.example` templates.
- Secret manager key inventory names only, never secret values.
- Generated deployment artifacts needed for rollback.

For object artifacts, create a manifest with path, size, modified timestamp, and SHA256 where practical. Store the manifest next to the MongoDB backup log.

## Restore test

Always restore to staging or an isolated test database before production restore.

Dry-run planning command:

```cmd
npm run backup:plan -- --restore --backup-file=backups/mongodb/mathai-<timestamp>.archive.gz
```

Staging restore template:

```cmd
mongorestore --uri "<staging secret>" --db "mathai_restore_test" --archive="backups/mongodb/mathai-<timestamp>.archive.gz" --gzip
```

Validation checklist:

- Verify archive checksum matches the recorded SHA256.
- Compare collection names and document counts against the backup log.
- Run backend smoke tests against the staging database.
- Verify critical workflows: auth, class/student lookup, gradebook summary, AI safety guard path, audit/fraud review reads.
- Confirm no production secret values were written to restore logs.

## Canonical drill evidence manifest

P0 deployment approval requires a sanitized backup/restore drill manifest at:

```cmd
artifacts/deployment/backup-restore-evidence.json
```

The deployment checklist can validate a different local/ticket-exported path with:

```cmd
npm run deploy:verify -- --backup-restore-evidence=<path-to-sanitized-backup-restore-evidence.json>
```

Do not include `MONGODB_URI`, credentials, object-store secrets, webhook URLs, user emails, reset tokens, or raw provider payloads. The drill manifest is evidence only; it must not imply approval for a production restore.

Canonical manifest fields enforced by `scripts/mongo-backup-restore-plan.js` and `scripts/deploy-verification-checklist.js`:

- `generated_at`: ISO-8601 timestamp for the sanitized manifest.
- `environment`: production-like staging/restore environment name.
- `drill_id`: stable drill/ticket identifier.
- `status`: must be exactly `"passed"`.
- `rto`: object with positive `target_minutes`, non-negative `observed_minutes` within target, and sanitized `evidence`.
- `rpo`: object with positive `target_minutes`, non-negative `observed_minutes` within target, and sanitized `evidence`.
- `backup_artifact`: redacted metadata with `archive_path`, 64-character hex `sha256`, positive `size_bytes`, `created_at`, `storage_location`, `retention_until`, and `metadata_redacted: true`.
- `restore_to_staging`: isolated staging target, sanitized dry-run log path, sanitized validation log path, and `status: "passed"`.
- `validations`: `checksum_verified: true`, non-empty `collection_counts` entries where source/restored counts match, and non-empty `critical_workflows` entries with `status: "passed"`.
- `approvals`: `data_owner`, `deployment_owner`, `release_manager`, and `approved_for_production_restore: false` for dry-run drills.

Template:

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

## Production restore and rollback

Production restore is an incident operation and requires explicit approval.

1. Stop writes or put the app in maintenance mode.
2. Capture a fresh emergency backup before restore.
3. Verify the target backup checksum again.
4. Restore only after staging restore passes.
5. Roll back application code to the matching Git tag if data contracts changed:
   ```cmd
   git checkout <known-good-tag>
   npm run build:backend
   ```
6. Reapply feature flags conservatively. Keep safety, audit, scoped authorization, and anti-fraud flags enabled unless the incident commander approves a temporary override.
7. Monitor logs, audit events, queue/backfill jobs, and error rates.

## Logs and evidence

Store these artifacts with the deployment or incident ticket:

- `git status --short --branch` output.
- Checkpoint and rollback tag names.
- Dry-run plan JSON from `npm run backup:plan`.
- Sanitized backup/restore drill evidence manifest at `artifacts/deployment/backup-restore-evidence.json`, or the path passed to `npm run deploy:verify -- --backup-restore-evidence=<path>`.
- Backup and restore command templates with secrets redacted.
- Checksum files and collection count comparisons.
- Staging restore test result.
- Final go/no-go approval.

## Related script

`scripts/mongo-backup-restore-plan.js` prints a sanitized dry-run JSON plan. It does not connect to MongoDB, execute backup commands, delete data, or print secret values. In Phase 6.2, even `--execute` is refused and returns a non-zero exit code.
