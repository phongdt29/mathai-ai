# P3-01 Analytics Taxonomy

## Status

Proposed contract for future implementation.

This document defines the product analytics taxonomy MathAI should use when event tracking is implemented. It references the current baseline only to anchor naming and metric definitions. It does **not** assume an event stream, data warehouse, BI layer, or dedicated analytics store exists today.

## Current Baseline

The current implementation exposes a teacher analytics endpoint and page:

- Backend: `GET /teacher/analytics` in `packages/backend/src/routes/teacher.routes.ts`
- Service method: `teacherService.getAnalytics(teacherId)` in `packages/backend/src/services/teacher.service.ts`
- Frontend page: `packages/frontend/src/app/(teacher)/teacher/analytics/page.tsx`

Current analytics are calculated directly from MongoDB/Mongoose application models at request time and return:

- `overview.total_students`
- `overview.total_classes`
- `overview.avg_score`
- `class_stats[]` with `id`, `name`, `subject`, `students`, `avg_score`, `completion_rate`
- `at_risk_students[]` with `id`, `full_name`, `class_names`, `avg_score`

Future analytics events must be additive and must not change current runtime behavior until explicitly implemented.

## Event Naming Standard

### Format

Use lowercase snake_case:

```text
<group>.<object>.<action>
```

Examples:

- `lesson.lesson_started`
- `assignment.submission_created`
- `assessment.score_recorded`
- `engagement.session_completed`
- `dashboard.analytics_viewed`

### Rules

- `group` is a product domain, not a UI route.
- `object` is the noun being acted on.
- `action` is past tense for completed actions and present-tense intent only for explicit attempts.
- Event names must be stable once shipped.
- Do not include role, tenant, user, timestamp, or IDs in the event name; those belong in fields.
- Do not encode outcomes as separate names when an `outcome` field is clearer.

Good:

```json
{
  "event_name": "assessment.score_recorded",
  "outcome": "success"
}
```

Avoid:

```text
teacher_assessment_score_recorded_success_2026
```

## Event Groups

| Group | Purpose | Example events | Primary owner |
| --- | --- | --- | --- |
| `auth` | Login, logout, session and access events | `auth.login_succeeded`, `auth.login_failed` | Platform/backend |
| `class` | Class creation, enrollment, membership changes | `class.created`, `class.student_added` | Teacher workflows |
| `lesson` | Lesson access, progress, completion | `lesson.lesson_started`, `lesson.lesson_completed` | Learning experience |
| `assignment` | Assignment lifecycle and submissions | `assignment.created`, `assignment.submission_created` | Teacher workflows |
| `assessment` | Assessment attempts, grading, scores | `assessment.attempt_completed`, `assessment.score_recorded` | Assessment domain |
| `engagement` | Study sessions, focus, activity windows | `engagement.session_started`, `engagement.session_completed` | Engagement domain |
| `report` | Parent/teacher/admin report generation and viewing | `report.weekly_viewed`, `report.csv_exported` | Reporting domain |
| `dashboard` | Dashboard view and interaction events | `dashboard.analytics_viewed`, `dashboard.drilldown_opened` | Product analytics |
| `admin` | Administrative operational actions | `admin.user_role_changed` | Admin operations |
| `system` | Job, replay, migration, and integration events | `system.analytics_replay_completed` | Platform/backend |

## Required Fields

Every event must include the following fields when event tracking is implemented.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `event_id` | string | Yes | Globally unique event identifier for idempotency. |
| `event_name` | string | Yes | Stable event name using `<group>.<object>.<action>`. |
| `event_version` | integer | Yes | Schema version for the event payload. Start at `1`. |
| `occurred_at` | ISO-8601 string | Yes | Time the user/system action happened. |
| `received_at` | ISO-8601 string | Yes | Time the application accepted the event. |
| `actor_type` | enum | Yes | `student`, `teacher`, `parent`, `admin`, `system`, or `anonymous`. |
| `actor_id` | string or null | Conditional | Internal actor ID when authenticated; null for anonymous/system events. |
| `organization_id` | string or null | Conditional | School/tenant identifier when available. |
| `class_id` | string or null | Conditional | Class context when applicable. |
| `student_id` | string or null | Conditional | Student context when applicable. For teacher/admin views, use only when the user is allowed to see that student. |
| `session_id` | string or null | Yes | Application/session correlation ID when available. |
| `request_id` | string or null | Yes | API request correlation ID when available. |
| `source` | enum | Yes | `backend`, `frontend`, `job`, `migration`, or `import`. |
| `environment` | enum | Yes | `development`, `staging`, or `production`. |
| `properties` | object | Yes | Event-specific properties after validation and redaction. |

## Forbidden Fields

Events must never include secrets, direct credentials, or unnecessary personally sensitive content.

Forbidden:

- Passwords, password hashes, reset tokens, bearer tokens, API keys, refresh tokens, session cookies.
- Real `.env` values or deployment secrets.
- Full prompt text or AI responses if they may contain student personal data, credentials, or parent/teacher notes.
- Raw uploaded file contents, screenshots, or OCR source images.
- Full email bodies, phone numbers, addresses, or free-form notes unless a separately approved privacy review allows them.
- Payment card numbers or financial account identifiers.
- Browser fingerprint fields that are not needed for product analytics.
- Unbounded raw error stacks in product analytics events.

Allowed with care:

- Internal IDs already used by application authorization.
- Coarse device and browser categories.
- Redacted error codes and validation codes.
- Aggregated counts and numeric scores.

## Standard Dimensions

Dimensions are categorical attributes used to segment metrics. They must use controlled values where possible.

| Dimension | Description | Example values |
| --- | --- | --- |
| `actor_type` | Role of actor who caused the event | `student`, `teacher`, `parent`, `admin`, `system` |
| `organization_id` | School/tenant context | Internal ID |
| `class_id` | Class context | Internal ID |
| `subject` | Class or lesson subject | `math`, `physics`, localized subject label from current data |
| `grade_level` | Grade/year level when available | `grade_6`, `grade_7` |
| `lesson_id` | Lesson context | Internal ID |
| `assignment_id` | Assignment context | Internal ID |
| `assessment_id` | Assessment context | Internal ID |
| `content_type` | Learning content category | `lesson`, `assignment`, `assessment`, `report` |
| `delivery_surface` | UI/API/job surface | `web`, `api`, `background_job` |
| `locale` | User interface locale | `vi-VN`, `en-US` |
| `outcome` | Result of an action | `success`, `failure`, `partial`, `cancelled` |
| `failure_code` | Controlled failure reason | `validation_error`, `permission_denied`, `not_found` |
| `time_window` | Aggregation interval | `day`, `week`, `month`, `term` |

## Standard Metrics

Metrics must be reproducible from source application data or tracked events. Until event tracking exists, dashboard metrics must state whether they are calculated from current MongoDB models or unavailable.

### Learning and Assessment Metrics

| Metric | Definition | Current baseline |
| --- | --- | --- |
| Average score | Mean `total_score` for non-null assessments in scope. | Available in teacher analytics as `avg_score`. |
| Completion rate | Completed submissions divided by possible submissions for a class. | Available in teacher analytics as `completion_rate`. |
| At-risk student count | Students whose average score is below the configured threshold. Current threshold is `< 5.0` in teacher analytics. | Available as list count in `at_risk_students`. |
| Assessment attempts | Count of assessment attempt completions. | Future event-backed metric unless represented by existing models elsewhere. |
| Lesson completion rate | Completed lessons divided by started or assigned lessons. | Future metric. |

### Engagement Metrics

| Metric | Definition | Current baseline |
| --- | --- | --- |
| Active learners | Distinct students with qualifying learning activity in a time window. | Future event-backed or model-derived metric. |
| Study session count | Count of completed engagement sessions. | Existing engagement service has session query helpers, but no dashboard contract currently depends on a warehouse. |
| Average focus ratio | Mean focus ratio over completed engagement sessions. | Potentially model-derived from engagement data. |
| Time on task | Sum of validated active learning duration. | Future metric. |

### Operational Metrics

| Metric | Definition | Current baseline |
| --- | --- | --- |
| Dashboard views | Count of analytics dashboard page views by role and scope. | Future event-backed metric. |
| Export count | Count of analytics/report exports. | Current admin CSV export exists as product capability, event tracking future. |
| Data freshness lag | Time between latest source update and dashboard calculation timestamp. | Future metric unless endpoint returns calculation metadata. |
| Error rate | Failed analytics requests divided by total analytics requests. | Future observability/product analytics metric. |

## Ownership

| Area | Owner | Responsibilities |
| --- | --- | --- |
| Event schema | Product + backend engineering | Naming approval, versioning, required fields, privacy review. |
| Backend emission | Backend engineering | Validate server-side events, enforce authorization, redact fields, generate IDs. |
| Frontend emission | Frontend engineering | Emit UI interaction events without sensitive payloads; avoid duplicating server-truth events. |
| Dashboard definitions | Product + data owner | Define KPIs, thresholds, filters, and drilldowns. |
| Data quality | Backend + QA | Add tests, reconciliation checks, alert thresholds, and replay validation. |
| Privacy/security | Security owner + product | Approve retention, redaction, export rules, and access controls. |

## Data Quality Rules

Analytics data must be trustworthy before it is used for decisions.

- Events must be schema-validated before persistence or forwarding.
- `event_id` must support idempotent writes and replay deduplication.
- Required dimensions must be present or explicitly null with a documented reason.
- Numeric metrics must define numerator, denominator, rounding, and null handling.
- Time windows must use one canonical timezone per dashboard contract.
- Dashboard counts must reconcile with source application records within an agreed tolerance.
- Backend-calculated values must be preferred for authoritative learning events such as scores and submissions.
- Frontend events are appropriate for UI interactions such as dashboard views and filter changes, not grade truth.
- Data quality checks must fail closed for privileged exports if redaction or permission scope cannot be verified.

## Retention and Privacy

- Retention must be defined before any event storage implementation ships.
- Default product analytics event retention should be limited to the shortest period needed for learning analytics and operational reporting.
- Student-level analytics require stricter access control than aggregate class or school metrics.
- Exported data must use least-privilege columns and role-specific redaction.
- PII minimization is mandatory: prefer internal IDs and aggregate metrics over names/emails in event payloads.
- Deletion/anonymization workflows must be designed before storing long-lived user analytics.
- Privacy review is required before tracking free-form content, AI prompts/responses, uploaded content, or parent/student notes.

## Backfill and Replay

Backfill/replay is future implementation work. If implemented, it must follow these rules:

- Backfills must use a dedicated `source` value such as `migration` or `import`.
- Replayed events must preserve original `occurred_at` and set a new `received_at`.
- Replays must use stable `event_id` generation or a separate idempotency key to avoid duplicates.
- Replay jobs must record input scope, code version, start/end time, record counts, skipped records, and error counts.
- Backfilled metrics must be labeled so dashboards can distinguish historical reconstruction from live event capture when needed.
- Backfill must not infer sensitive fields that were not present in the source record.
- Any replay affecting student-level reporting requires data-quality reconciliation before product use.

## Future Implementation Checklist

Before implementing this taxonomy:

- [ ] Confirm product owners for each event group.
- [ ] Select storage/transport architecture without assuming a warehouse prematurely.
- [ ] Define event TypeScript interfaces and runtime validation.
- [ ] Add privacy review for event fields and exports.
- [ ] Add server-side event emitter with idempotency and redaction.
- [ ] Add frontend UI events only for interactions that cannot be reliably inferred server-side.
- [ ] Add tests for required fields, forbidden fields, and schema versioning.
- [ ] Add reconciliation checks between source MongoDB records and analytics aggregates.
- [ ] Add retention/deletion/anonymization policy implementation.
- [ ] Add dashboard freshness metadata if metrics become cached or asynchronous.
- [ ] Document migration/backfill procedures before running them.
- [ ] Roll out behind configuration flags with production-safe defaults.
