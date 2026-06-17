# P3-07 Advanced Reporting and Export Contract

## Status

Proposed product contract for future implementation. This document defines reporting and export behavior only; it does not add runtime queue, worker, storage, or analytics integrations.

## Purpose

Advanced reporting gives administrators, teachers, and permitted operators a consistent way to inspect learning progress, engagement, assessment outcomes, and operational health. Export behavior must be predictable, permission-scoped, privacy-aware, and safe for large datasets.

## Non-Goals

- No runtime queue implementation.
- No object storage, blob storage, or signed-download integration.
- No new database schema, migrations, models, or indexes.
- No secrets, environment values, or vendor-specific configuration.
- No changes to API routes or frontend screens in this wave.

## Report Matrix

| Report | Primary users | Default scope | Key dimensions | Measures | Exportable | Freshness target |
| --- | --- | --- | --- | --- | --- | --- |
| Student Progress Summary | Admin, teacher, parent-scoped support | Student, class, course | student, class, course, lesson, competency | completion rate, mastery, attempts, latest activity | CSV, XLSX, JSON | Near-real-time for current student; up to 15 minutes for aggregates |
| Assessment Outcomes | Admin, teacher | Class, course, assessment | assessment, student, question, competency, difficulty | score, correctness, time spent, retry count | CSV, XLSX, JSON | Up to 15 minutes after grading completion |
| Assignment Completion | Admin, teacher | Class, assignment | assignment, class, student, status, due date | submitted count, late count, missing count, average score | CSV, XLSX | Up to 15 minutes after submission/grading changes |
| Lesson Engagement | Admin, teacher | Class, lesson, date range | lesson, student, date, activity type | views, quiz starts, quiz completions, active minutes | CSV, JSON | Up to 30 minutes for aggregated engagement |
| Reward Points Ledger | Admin, student support with explicit permission | Student, class, date range | source type, source id, student, adjustment actor | earned points, adjusted points, balance delta | CSV, XLSX, JSON | Near-real-time for individual ledger; up to 15 minutes for class totals |
| Parent Weekly Summary | Admin, parent support with scoped access | Student, week | student, week, competency, assignment | weekly progress, strengths, risks, recommended actions | PDF, CSV | Generated from latest available weekly snapshot |
| Operational Audit Report | Admin, compliance operator | Tenant/global date range | actor, action, target, timestamp, IP/device where available | action count, failure count, sensitive access count | CSV, JSON | Up to 15 minutes after audit event capture |
| Content Usage Report | Admin, content manager | Course, content item, date range | content item, version, class, teacher, status | assignment count, completion count, error reports | CSV, XLSX | Up to 30 minutes for aggregates |

## Export Formats

| Format | Intended use | Contract rules |
| --- | --- | --- |
| CSV | Spreadsheet import and lightweight reporting | UTF-8, header row required, stable column keys, ISO 8601 timestamps, numeric fields unformatted, comma delimiter with quoted values when needed. |
| XLSX | Business-friendly spreadsheet review | One workbook per export, one sheet per report section, frozen header row, no formulas that change source data semantics. |
| JSON | Machine-readable downstream processing | Versioned envelope with `schemaVersion`, `generatedAt`, `freshness`, `filters`, `columns`, and `rows`. |
| PDF | Human-readable parent or executive summaries | Rendered summary only; not the canonical data exchange format. Must include generated timestamp, scope, and redaction notice. |

All export formats must preserve the same permission-filtered row set for a given report request. Differences are presentational only unless explicitly documented in the report-specific contract.

## Permission and Scope Rules

1. Every report request must be evaluated against the requesting actor's role, organization/tenant, class ownership, and student relationship scope before query execution.
2. Administrators may request organization-wide reports only within their authorized organization boundary.
3. Teachers may request only classes, assignments, assessments, lessons, and students they are assigned to teach or explicitly permitted to support.
4. Parents or parent-support views must be limited to the linked student relationship and must not include unrelated classmate data.
5. Student-facing exports, if enabled in the future, must include only that student's records and must exclude staff-only annotations.
6. Support or operations roles require explicit reporting permission flags for sensitive reports such as audit reports, reward adjustments, or parent summaries.
7. Export jobs must store or display the resolved scope used at request time so later review can explain why rows were included or excluded.
8. Permission checks must be repeated at download time for async exports; an export prepared while a user had access must not remain downloadable after access is revoked.

## Redaction and Privacy Rules

Sensitive fields must be minimized by default and redacted unless the report purpose requires them.

| Data category | Default treatment | Allowed when |
| --- | --- | --- |
| Student name | Include where required for classroom operations | Actor has student/class scope. |
| Student email or phone | Redact by default | Explicit admin/support permission and report purpose requires contact fields. |
| Parent contact details | Redact by default | Parent support workflows with explicit permission. |
| Internal staff notes | Exclude | Dedicated staff report with explicit sensitive-note permission. |
| Authentication/session metadata | Exclude | Security/audit report with compliance permission. |
| IP address/device fingerprint | Mask or truncate | Compliance audit requires it and retention policy allows it. |
| Free-text AI/tutor content | Exclude or summarize | Explicit review workflow requires content inspection. |

Redaction must be deterministic and visible. Export metadata must include a `redactionApplied` indicator and, when possible, a list of redacted column keys. Redacted values should use stable markers such as `[REDACTED]`, not empty strings that can be confused with missing data.

## Async Export Readiness

Large exports must be designed for async execution even though this wave does not implement queue or storage integrations.

Future async-ready contract:

1. A report request creates an export request record with report type, filters, resolved scope, requested format, requested columns, actor id, and requested timestamp.
2. The export lifecycle is `requested -> validating -> running -> ready -> downloaded` or `requested -> validating/running -> failed/cancelled/expired`.
3. The UI must treat exports as pending until readiness is confirmed; it must not assume immediate availability for large date ranges or broad scopes.
4. Readiness metadata must include status, progress where available, generated timestamp, row count, freshness window, expiration timestamp, and failure reason when applicable.
5. Downloads must require a fresh permission check and must not expose direct permanent object URLs.
6. Duplicate requests with the same actor, report, filters, scope, format, and time window may be deduplicated only when the freshness contract remains satisfied.

Implementation must avoid adding runtime queue/storage integrations until an explicit engineering wave defines the worker, storage, retry, and cleanup design.

## Retention

| Artifact | Suggested retention | Notes |
| --- | --- | --- |
| Export request metadata | 90 days | Keep for auditability, troubleshooting, and abuse investigation. |
| Generated export file | 7 days by default | Short-lived by design; shorter retention for sensitive reports. |
| Failed export diagnostics | 30 days | Store sanitized failure reason only; no secrets or raw sensitive rows. |
| Download audit event | 1 year or compliance-defined period | Include actor, report, scope, format, timestamp, and result. |
| Redaction metadata | Same as export metadata | Needed to prove privacy handling after file expiration. |

Retention settings must be configurable in future implementation but must default to least-retention behavior for sensitive student data.

## Data Freshness

Each report response and export must declare freshness metadata:

- `generatedAt`: when the file or report payload was generated.
- `dataAsOf`: latest source-data timestamp included.
- `freshnessWindow`: maximum expected lag for the report type.
- `aggregationMode`: live, snapshot, cached aggregate, or mixed.
- `partialData`: boolean flag for known incomplete data windows.

Users must be able to distinguish live individual records from delayed aggregate reports. If source data is still processing, exports must either wait for readiness or clearly mark the affected date range as partial.

## Acceptance Criteria

- Report matrix covers progress, assessment, assignment, engagement, rewards, parent summary, audit, and content usage reports.
- Every report has a declared primary user, scope, key dimensions, measures, exportability, and freshness target.
- CSV, XLSX, JSON, and PDF export contracts define intended usage and stable output rules.
- Permission and scope rules require authorization before query execution and again before async download.
- Redaction rules define default handling for student, parent, staff, audit, and AI/tutor data categories.
- Async export readiness is specified as a future-compatible lifecycle without adding runtime queue/storage integrations.
- Retention rules distinguish export metadata, generated files, diagnostics, download audit events, and redaction metadata.
- Data freshness metadata is required for report views and generated exports.
- The document contains no secrets, real environment values, dependency additions, runtime queue integrations, or storage integrations.
