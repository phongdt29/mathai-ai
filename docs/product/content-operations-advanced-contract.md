# P3-08 Advanced Content Operations Contract

## Status

Proposed product contract for future implementation. This document defines advanced content operations behavior only; it does not add runtime queues, storage integrations, schemas, routes, or UI code.

## Purpose

Advanced content operations let authorized content teams manage lessons, assignments, assessments, and supporting materials at scale while protecting learners from accidental publication mistakes. Bulk actions must be auditable, reversible where possible, dry-run capable, and governed by approval and emergency controls.

## Non-Goals

- No runtime queue implementation.
- No object storage or file pipeline integration.
- No database migrations, schema changes, or model additions.
- No API endpoint or frontend implementation in this wave.
- No dependency changes.
- No secrets or real environment values.

## Content Entities in Scope

Future implementation may apply this contract to:

- Courses and course modules.
- Lessons and lesson versions.
- Quizzes and assessments.
- Assignments and assignment templates.
- Content tags, competency mappings, and visibility settings.
- Supplementary resources such as worksheets or explanation assets.

The exact entity list must be confirmed in the implementation PRD before code changes begin.

## Bulk Operations

| Operation | Description | Required safeguards |
| --- | --- | --- |
| Bulk publish | Make selected content visible to target classes, courses, or organizations | Dry-run preview, approval for broad scope, conflict validation, scheduled effective time support. |
| Bulk unpublish | Remove visibility for selected content | Impact preview, active-assignment warnings, emergency path for safety issues. |
| Bulk archive | Move stale content out of normal authoring views | Dependency scan, rollback plan, retention of historical learner records. |
| Bulk tag update | Add, remove, or replace tags and competency mappings | Before/after diff, taxonomy validation, maximum batch size. |
| Bulk due-date shift | Adjust assignment dates across a class/course | Calendar conflict detection, timezone display, teacher notification preview. |
| Bulk owner/status update | Change content owner, reviewer, status, or workflow stage | Permission check, approval when ownership crosses teams. |
| Bulk clone/version | Duplicate content into a new course, term, or version | Source snapshot, destination conflict handling, clear version lineage. |
| Bulk delete | Permanently remove draft-only content | Restricted to unpublished draft content, two-step confirmation, audit trail. |

Bulk operations must be explicit about target set, filters, excluded records, and expected side effects before execution.

## Rollback Model

Rollback must be designed before enabling broad bulk changes.

1. Every mutating bulk operation must create an operation manifest describing selected entity ids, original values, intended new values, actor, timestamp, request reason, and approval reference if applicable.
2. Reversible operations must define an inverse action from the manifest, such as restoring previous visibility, tags, due dates, status, or owner.
3. Irreversible operations, such as permanent deletion, must be blocked for published or learner-visible content unless a separate governance policy permits it.
4. Rollback execution must be permission-checked and audit-logged independently from the original operation.
5. Rollback must support partial recovery when some entities changed again after the original operation. The result should identify restored, skipped, conflicted, and failed records.
6. Rollback must not delete learner submissions, assessment attempts, progress history, or audit events created while the original change was active.
7. Rollback windows should default to conservative limits, such as 7 days for operational rollback and longer review windows for compliance records.

## Audit Trail

Every advanced content operation must emit a durable audit event with enough detail to reconstruct intent and impact.

Required audit fields:

- Operation id.
- Operation type.
- Actor id and role.
- Requested timestamp and completed timestamp.
- Approval id or bypass reason.
- Dry-run id when execution follows a dry run.
- Target filters and resolved entity count.
- Entity ids or a manifest reference.
- Before/after summary for changed fields.
- Success, partial success, failure, cancellation, or rollback status.
- Failure reasons sanitized of secrets and sensitive raw content.
- Emergency flag when emergency unpublish is used.

Audit trails must be append-only from a product perspective. Corrections should be represented by new audit events, not by mutating historical events.

## Dry-Run Mode

Dry-run mode is required before any mutating bulk operation beyond a small single-record threshold.

Dry-run output must include:

- Operation type and requested parameters.
- Resolved target list count.
- Included and excluded entities with exclusion reasons.
- Permission failures by scope, without leaking unauthorized entity details.
- Validation errors and warnings.
- Before/after diff summary.
- Estimated learner, teacher, and parent impact.
- Required approval level.
- Whether rollback is available and the rollback window.
- A stable dry-run id that can be referenced by the eventual execution request.

Execution after dry-run must revalidate permissions, targets, conflicts, and freshness. A stale dry-run must expire rather than execute against changed content silently.

## Batch Safety

Batch execution must prefer safety over throughput.

| Safety control | Contract |
| --- | --- |
| Maximum batch size | Each operation type must define a safe default limit and require elevated approval for larger batches. |
| Scope preview | User must see organization, course, class, and content counts before execution. |
| Conflict detection | Detect active assignments, locked assessments, archived modules, duplicate slugs, invalid competency mappings, and schedule conflicts. |
| Idempotency | Retried execution must not duplicate versions, duplicate audit events, or apply the same mutation twice. |
| Partial failure handling | Results must classify each entity as applied, skipped, failed, conflicted, or unchanged. |
| Concurrency guard | Content modified after dry-run must be revalidated before mutation. |
| Rate limiting | Future implementation should protect authoring systems from large repeated operations. |
| Notification preview | Broad publish/unpublish operations must preview teacher/parent/student notifications before sending. |

Large operations may be designed for future background execution, but this document does not add runtime queue or worker integrations.

## Approval Workflow

Approval requirements must scale with risk.

| Risk level | Examples | Approval contract |
| --- | --- | --- |
| Low | Draft-only tag edits, small due-date correction | Single authorized content editor may execute after dry-run. |
| Medium | Publishing to one course, unpublishing unused content, ownership transfer within team | Requires reviewer approval or team lead approval. |
| High | Organization-wide publish, assessment changes, content visible to active learners | Requires designated approver, reason, dry-run evidence, and scheduled execution window. |
| Emergency | Safety, legal, privacy, or severe correctness issue | Emergency unpublish path with post-action review. |

Approval records should capture approver, timestamp, approved operation parameters, dry-run id, expiration, and conditions. Approval must expire if the target set or material parameters change.

## Emergency Unpublish

Emergency unpublish is a restricted safety mechanism for removing harmful, legally sensitive, privacy-exposing, or materially incorrect content quickly.

Contract rules:

1. Available only to roles with explicit emergency content permission.
2. Requires a reason code and free-text incident summary.
3. May bypass normal pre-approval but must create an immediate high-severity audit event.
4. Must preserve learner history and submissions while removing future visibility.
5. Must notify responsible content owners and administrators.
6. Must trigger mandatory post-action review, including whether replacement content or learner communication is needed.
7. Must support rollback or republish only through a reviewed remediation workflow, not a casual undo button.
8. Must not be used for routine editorial workflow or convenience changes.

## Future Implementation Checklist

Before implementation begins, confirm:

- [ ] Entity scope and content lifecycle states are finalized.
- [ ] Role permissions for content editor, reviewer, admin, teacher, support, and emergency operator are defined.
- [ ] Bulk operation limits are documented per operation type.
- [ ] Dry-run output schema and expiration rules are specified.
- [ ] Operation manifest structure is designed for rollback and audit.
- [ ] Rollback availability and windows are defined per operation type.
- [ ] Approval workflow states, approver roles, and expiration behavior are defined.
- [ ] Emergency unpublish policy and post-action review process are approved.
- [ ] Audit event fields and retention policy are aligned with compliance needs.
- [ ] Notification preview and suppression rules are defined.
- [ ] No runtime queue/storage integration is added without a separate engineering design.
- [ ] Tests cover permission boundaries, dry-run freshness, rollback conflicts, batch partial failure, approval expiration, and emergency unpublish audit events.

## Acceptance Criteria

- Bulk operations are enumerated with required safeguards.
- Rollback model defines manifests, inverse actions, partial recovery, conflict handling, and irreversible operation restrictions.
- Audit trail requirements include actor, approval, dry-run, target, before/after, status, failure, and emergency fields.
- Dry-run mode is required for risky bulk operations and defines preview, validation, impact, approval, and rollback metadata.
- Batch safety covers limits, conflict detection, idempotency, partial failures, concurrency, rate limiting, and notification preview.
- Approval workflow defines low, medium, high, and emergency risk handling.
- Emergency unpublish is restricted, audited, reviewed, and preserves learner history.
- Future implementation checklist is present and explicitly avoids runtime queue/storage integrations in this wave.
