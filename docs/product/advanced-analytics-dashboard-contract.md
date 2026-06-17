# P3-02 Advanced Analytics Dashboard Contract

## Status

Proposed product contract for a future advanced analytics dashboard.

This document defines the expected dashboard behavior, access model, and data-quality gates. It references the existing teacher analytics page as the current baseline only. It does **not** assume MathAI currently has a data warehouse, BI platform, analytics event store, or cached aggregate service.

## Current Baseline

The current analytics surface is teacher-scoped:

- Route/page: `packages/frontend/src/app/(teacher)/teacher/analytics/page.tsx`
- API call: `GET /teacher/analytics`
- Backend route: `packages/backend/src/routes/teacher.routes.ts`
- Backend service: `teacherService.getAnalytics(teacherId)`

The current response includes:

- Overview cards: total students, average score, total classes.
- Class comparison table: class name, subject, student count, average score, completion rate.
- At-risk students panel: students with average score below `5.0`.

The advanced dashboard contract below is additive future scope and should be implemented only after product, privacy, and engineering acceptance.

## Personas

| Persona | Primary questions | Default scope |
| --- | --- | --- |
| Teacher | Which classes and students need attention? Are assignments being completed? Are scores improving? | Classes owned by the teacher. |
| School/admin operator | Which classes, grades, or teachers need support? Are operational reports complete? | Authorized organization/school scope. |
| Parent/guardian | How is my child progressing and where do they need help? | Linked student(s) only. |
| Product/operations reviewer | Are analytics features used and reliable? | Aggregate, redacted operational metrics only. |

## KPIs

KPIs must state their source and calculation mode at implementation time: direct MongoDB query, API-derived aggregate, event-derived aggregate, or unavailable.

### Teacher KPIs

| KPI | Definition | Baseline availability |
| --- | --- | --- |
| Total students | Distinct students across teacher-owned classes. | Available. |
| Total classes | Count of teacher-owned classes. | Available. |
| Average score | Mean non-null assessment `total_score` for students in teacher scope. | Available. |
| Class completion rate | Completed submissions divided by possible submissions per class. | Available. |
| At-risk students | Students with average score below threshold, initially `< 5.0`. | Available. |
| Score trend | Average score change over selected time window. | Future. |
| Assignment completion trend | Completion rate change over selected time window. | Future. |
| Engagement trend | Study activity/focus over selected time window. | Future. |

### Admin KPIs

| KPI | Definition | Baseline availability |
| --- | --- | --- |
| Active learners | Distinct students with qualifying learning activity in window. | Future. |
| At-risk student count | Count and rate of students below risk threshold by scope. | Future aggregate from current concepts. |
| Class performance distribution | Distribution of class average scores by subject/grade/teacher. | Future. |
| Assignment completion distribution | Completion rate distribution by class/subject/teacher. | Future. |
| Report/export activity | Count of report views and exports by authorized users. | Future event-backed metric. |

### Parent KPIs

| KPI | Definition | Baseline availability |
| --- | --- | --- |
| Child average score | Mean non-null score for linked student in selected window. | Future parent dashboard extension. |
| Recent assignments | Submitted/missing assignment status for linked student. | Future. |
| Risk indicators | Student-level alerts permitted for parent view. | Future. |
| Recommended focus areas | Topics or classes needing practice, if supported by source data. | Future. |

## Filters

Filters must never expand a user's authorized scope.

| Filter | Applies to | Notes |
| --- | --- | --- |
| Date range | All personas | Default should be recent enough for action, e.g. current term or last 30 days. |
| Class | Teacher/admin | Teachers see owned classes only; admins see authorized organization classes. |
| Student | Teacher/parent/admin | Teachers see students in owned classes; parents see linked children only. |
| Subject | Teacher/admin/parent | Use source class/lesson subject values. |
| Grade level | Admin/teacher when available | Must be null-safe because current baseline may not expose grade level. |
| Risk threshold | Teacher/admin | Default remains compatible with current `< 5.0` at-risk logic unless product changes it. |
| Assignment status | Teacher/admin/parent | Future filter when assignment-level metrics are available. |
| Engagement status | Teacher/admin/parent | Future filter when engagement metrics are approved. |

## Permissions

### General Rules

- All dashboard APIs must enforce permissions server-side.
- Frontend hiding is not sufficient for authorization.
- Analytics exports must use the same or stricter permissions as dashboard views.
- Student-level rows require explicit authorization for each student.
- Aggregate admin views must prevent small-cohort re-identification through minimum group-size rules when needed.

### Persona Permissions

| Persona | May view | Must not view |
| --- | --- | --- |
| Teacher | Own classes, enrolled students, class-level metrics, allowed student drilldowns. | Other teachers' classes or students outside their classes. |
| Admin | Authorized organization/school aggregates and permitted operational records. | Secrets, credentials, unredacted private notes, unauthorized organizations. |
| Parent | Linked student summaries and permitted child-specific details. | Other students, class rosters, teacher-private operational notes. |
| Product/operations reviewer | Redacted aggregate usage and reliability metrics. | Student names, parent contact details, raw student content. |

## Freshness

Dashboard responses must expose freshness metadata once metrics are cached, aggregated, or event-derived.

Recommended response metadata:

```json
{
  "generated_at": "2026-05-12T00:00:00.000Z",
  "source_updated_at": "2026-05-11T23:58:00.000Z",
  "calculation_mode": "direct_query",
  "freshness_lag_seconds": 120
}
```

Freshness expectations:

- Direct request-time calculations should report `generated_at` if metadata is added.
- Cached or asynchronous aggregates must report source freshness and calculation mode.
- Stale data must be visible to users when it can affect decision-making.
- Exports must include the same freshness metadata as the source dashboard query.

## Empty States

Empty states must be specific and actionable.

| State | Message intent | Required behavior |
| --- | --- | --- |
| No classes | Teacher has no classes in scope. | Explain that analytics appear after classes are created/assigned. |
| No students | Class exists but has no enrolled students. | Show zero counts without error. |
| No assessments | Students exist but no scored assessments. | Show score as `—` or null-safe equivalent; do not show `0` unless score is truly zero. |
| No submissions | Assignments exist but no submissions. | Show completion rate based on defined denominator; explain if denominator is zero. |
| No at-risk students | No students below threshold. | Show a positive empty state, not a warning. |
| Filter returns no results | Selected filters exclude all rows. | Offer filter reset affordance. |

## Loading States

- Initial page load must show a non-blocking loading indicator consistent with the current teacher analytics pattern.
- Filter changes should preserve prior results while the new query loads when feasible.
- Export generation must show progress or queued state if it can take longer than a normal request.
- Loading states must not expose stale data as fresh; metadata should update with the result.

## Error States

| Error | Required behavior |
| --- | --- |
| Unauthorized | Show access-denied state; do not reveal whether hidden resources exist. |
| Validation error | Identify the invalid filter/input and preserve safe filter values. |
| Data unavailable | Explain that analytics are temporarily unavailable and avoid partial misleading conclusions. |
| Partial data quality failure | Mark affected widgets as unavailable; do not silently mix trusted and failed metrics. |
| Export blocked | Explain permission/redaction/data-quality reason without leaking restricted fields. |

## Drilldowns

Drilldowns must preserve authorization and source context.

| From | To | Requirements |
| --- | --- | --- |
| Overview average score | Score breakdown by class/subject/time | Null-safe calculations and visible denominator. |
| Class row | Class detail dashboard | Teacher/admin must be authorized for the class. |
| At-risk count/list | Student risk detail | Student-level authorization required; show contributing factors only if source data supports them. |
| Completion rate | Assignment/submission breakdown | Define numerator/denominator and missing submission handling. |
| Engagement trend | Session/activity detail | Privacy review required before showing granular activity timelines. |
| Export activity | Export audit details | Admin-only or operations-only depending on scope. |

## Export and Redaction

Exports are higher risk than on-screen summaries because they can leave the application boundary.

### Export Rules

- Exports must require server-side permission checks.
- Export scope must match the active filters and authorized resources.
- Exports must include `generated_at`, filter summary, and freshness metadata when available.
- Exports must include only columns approved for the requesting role.
- Exports must be auditable when event tracking or operational logs are implemented.
- Large exports should be rate-limited or queued.

### Redaction Rules

| Field category | Teacher export | Admin export | Parent export | Product/ops export |
| --- | --- | --- | --- | --- |
| Student name | Allowed for own students. | Allowed only if admin role permits student-level data. | Allowed for linked child. | Redacted. |
| Student email/contact | Redacted by default. | Role-dependent; redacted unless operationally required. | Redacted unless already parent-visible elsewhere. | Redacted. |
| Scores | Allowed for own students/classes. | Allowed within authorized scope. | Allowed for linked child. | Aggregate only. |
| Class names | Allowed for own classes. | Allowed within authorized scope. | Allowed only when parent should see it. | Aggregate or pseudonymous. |
| Free-form notes/content | Redacted unless separately approved. | Redacted unless separately approved. | Redacted unless explicitly parent-facing. | Redacted. |
| Secrets/tokens/env values | Never allowed. | Never allowed. | Never allowed. | Never allowed. |

## Verification and Data-Quality Gates

A future implementation must pass these gates before release.

### Contract Gates

- [ ] Dashboard API response schema is documented and tested.
- [ ] Each KPI has a definition, source, owner, and null handling rule.
- [ ] Each filter has server-side validation and authorization tests.
- [ ] Permission tests cover teacher, admin, parent, unauthorized, and cross-scope access.
- [ ] Empty, loading, and error states are implemented and reviewed.
- [ ] Drilldowns cannot bypass the parent dashboard permission scope.
- [ ] Export permissions and redaction are tested separately from screen rendering.

### Data-Quality Gates

- [ ] Average score calculations reconcile with source assessment records.
- [ ] Completion rate numerator and denominator are tested, including zero-denominator cases.
- [ ] At-risk threshold behavior is tested at boundary values below, equal to, and above threshold.
- [ ] Cached/event-derived metrics, if introduced, reconcile against source MongoDB records within approved tolerance.
- [ ] Freshness metadata is present for any non-direct-query metric.
- [ ] Partial failures do not silently render misleading aggregate totals.
- [ ] Backfilled/replayed data, if introduced, is idempotent and labeled.

### Privacy and Security Gates

- [ ] No secrets, real environment values, tokens, or credentials appear in analytics payloads or exports.
- [ ] Student-level drilldowns and exports are access-controlled server-side.
- [ ] Small-cohort or personally identifying aggregate risks are reviewed for admin/product views.
- [ ] Export auditability is defined before broad export rollout.
- [ ] Retention and deletion/anonymization expectations are documented before storing long-lived analytics events.

## Implementation Notes

- Start from the current `GET /teacher/analytics` baseline rather than introducing infrastructure prematurely.
- Add metadata and stricter contracts before broadening persona scope.
- Prefer direct source-of-truth calculations for sensitive learning metrics until an aggregate/event pipeline is explicitly designed and verified.
- Treat event-backed usage analytics as separate from authoritative academic records.
