# P3-05 Mobile API Readiness

## Status

Proposed readiness contract for a future MathAI mobile client. This document records the API expectations the existing backend must satisfy before a mobile app can move from prototype to release candidate.

## Scope

This readiness document covers mobile-facing API behavior only. It does not scaffold a mobile app, choose a mobile framework, or define production infrastructure changes.

## Supported Roles

The mobile API contract should support the same authenticated role model used by the web application, with mobile MVP priority ordered by expected usage:

| Role        | Mobile readiness expectation                                                                                                                                        | MVP priority                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Student     | Can sign in, view assigned learning content, submit lesson/exercise progress, and view rewards/progress summaries.                                                  | Required                                                          |
| Parent      | Can sign in, view linked student summary/progress/report data, and receive read-only learning status.                                                               | Required                                                          |
| Teacher     | Can sign in for read-focused classroom and student progress views. Authoring and administrative workflows may remain web-first.                                     | Optional for first release candidate unless validated by product. |
| Staff/Admin | Should remain web-first except for smoke-test access to verify auth/session and support workflows. No destructive admin operations should be exposed in mobile MVP. | Non-goal                                                          |

Role-specific authorization must be enforced server-side for every endpoint. Mobile clients must not rely on hidden UI state as an access-control boundary.

## Auth and Session Contract

- Mobile uses the same backend authentication boundary as the web app: HTTPS API calls with bearer access tokens or secure session credentials issued by the backend.
- The backend response for successful sign-in must provide enough information for the client to render role-aware navigation: authenticated user id, display name, role, linked student/parent relationships when applicable, and token/session expiry metadata.
- Access tokens or session credentials must be stored only in platform secure storage by the eventual mobile app. They must not be logged, embedded in source, committed to repository files, or stored in plaintext local files.
- The mobile client must handle these session states explicitly: unauthenticated, authenticating, authenticated, expired, revoked, and network-unreachable-with-cached-session.
- Expired or revoked credentials must produce a consistent `401 Unauthorized` response. Role violations must produce `403 Forbidden`.
- Refresh behavior must be documented before release candidate: either a refresh-token endpoint/rotation policy is supported, or mobile clients must re-authenticate after access-token expiry.
- Logout must invalidate local credentials immediately and call the backend logout/session-revocation endpoint when supported.
- Demo login and bearer-token bypass flags must remain disabled for production mobile environments.

## API Conventions for Mobile

### Pagination

- List endpoints used by mobile must support deterministic pagination.
- Preferred contract: cursor pagination with `limit`, `cursor`, and response metadata `{ items, nextCursor, hasMore }`.
- Offset pagination may be accepted for existing low-volume lists if the response includes `page`, `limit`, `total` or `hasMore`, and stable ordering.
- Default page size should be mobile-friendly, typically 20 items. Maximum page size should be capped server-side.
- Empty list responses must return `200 OK` with an empty `items` array, not `404`.

### Filtering and Sorting

- Mobile endpoints must document supported filter parameters per resource, including role-specific restrictions.
- Common filters should use stable names such as `studentId`, `classId`, `status`, `from`, `to`, `subject`, and `gradeLevel`.
- Date filters must use ISO 8601 strings and specify timezone assumptions.
- Unsupported filters should return `400 Bad Request` with a machine-readable validation error.
- Sorting must be deterministic, with a documented default sort for every paginated endpoint.

### Error Shape

Mobile clients need a stable error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "A user-safe summary of the error.",
    "details": {},
    "requestId": "optional-correlation-id"
  }
}
```

Required error conventions:

| HTTP status | Required use                                                                 |
| ----------- | ---------------------------------------------------------------------------- |
| 400         | Invalid input, unsupported filters, malformed pagination parameters.         |
| 401         | Missing, expired, revoked, or invalid auth/session credentials.              |
| 403         | Authenticated user lacks permission for the role/resource.                   |
| 404         | Resource does not exist or is not visible to the authenticated role.         |
| 409         | Conflict, duplicate, or stale write.                                         |
| 422         | Domain validation failure when syntactically valid input cannot be accepted. |
| 429         | Rate limit exceeded.                                                         |
| 500         | Unexpected server error with safe generic message.                           |

Error messages must be safe for end users and must not expose secrets, stack traces, database internals, or real environment values.

### Rate Limits

- Mobile auth/session endpoints must have stricter rate limits than read endpoints.
- `429 Too Many Requests` responses should include `Retry-After` where possible.
- The error envelope should use a stable code such as `RATE_LIMITED`.
- Clients must implement backoff for repeated `429` and network failures.
- Rate-limit behavior must be tested separately for unauthenticated, authenticated, and role-restricted endpoints.

### Offline and Poor-Network Behavior

- The API should be safe for mobile retry behavior. Idempotent reads can be retried automatically; writes require explicit idempotency guidance.
- Release-candidate write endpoints used by mobile should document whether they support idempotency keys.
- Mobile clients may cache read-only data such as profile, role, assignment lists, progress summaries, and reports, but cached data must be clearly marked stale when offline.
- Offline submission queues are not required for MVP unless a product requirement adds them. If added later, write endpoints must define conflict handling.
- Network timeouts, DNS failures, and backend unavailable states should map to client-visible retry/recovery states, not generic crashes.

## Endpoint Inventory

This inventory identifies mobile-relevant endpoint categories that need contract confirmation against the backend route implementation before release candidate. Exact paths should be verified from the Express route files and documented in contract tests.

| Area                       | Candidate endpoint behavior                                                   | Roles                                            | Mobile readiness                            |
| -------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------- |
| Health/version             | API health, build/version compatibility, maintenance mode if available.       | Public or authenticated                          | Needed for diagnostics and release support. |
| Auth/session               | Login, current user/session, refresh or expiry handling, logout/revoke.       | Student, Parent, Teacher, Staff/Admin smoke test | Required before prototype testing.          |
| Profile/me                 | Current user profile, role, linked students/classes, feature flags if used.   | All authenticated roles                          | Required.                                   |
| Student dashboard          | Assigned lessons, current progress, recent activity, next recommended action. | Student                                          | Required.                                   |
| Lesson content             | Lesson detail, exercise prompts, answer submission contract, result feedback. | Student                                          | Required if mobile includes learning flow.  |
| Progress summaries         | Student progress totals, weekly summaries, subject/skill breakdowns.          | Student, Parent, Teacher                         | Required for parent/student MVP.            |
| Parent linked-student view | Parent access to linked student summaries and reports.                        | Parent                                           | Required.                                   |
| Weekly reports             | Read-only weekly report summary and details.                                  | Parent, Teacher, possibly Student                | Required if MVP includes report viewing.    |
| Reward points/gamification | Points balance, badges/achievements, recent reward events.                    | Student, Parent read-only                        | Required if rewards appear in MVP.          |
| Notifications/preferences  | Read notification list/preferences if backend supports them.                  | Authenticated roles                              | Optional; can be deferred.                  |
| Teacher classroom summary  | Classes, student progress overview, report summaries.                         | Teacher                                          | Optional for MVP; useful for later phase.   |
| Admin/staff support        | Read-only diagnostic profile/session checks.                                  | Staff/Admin                                      | Non-goal for mobile MVP except smoke tests. |

## Readiness Risks

- Existing web endpoints may return inconsistent error shapes, making mobile recovery logic brittle.
- Some list endpoints may lack deterministic pagination or documented filtering.
- Auth/session refresh behavior may not be mobile-safe if it assumes browser-only storage or cookies without native-client guidance.
- Role-specific response shapes may diverge across student, parent, and teacher views.
- Offline behavior can create duplicate submissions if write endpoints do not define idempotency.
- Rate-limit behavior may be missing for auth/session endpoints or may not expose retry guidance.
- Endpoint paths and payloads may change during web feature work unless contract tests lock mobile-critical behavior.

## Contract Tests Needed

Before mobile release candidate, add contract tests that verify:

1. Auth/session success response includes user id, role, display name, expiry/session metadata, and no secrets.
2. Auth/session invalid, expired, and revoked credentials return `401` with the stable error envelope.
3. Role violations return `403` for student, parent, teacher, and staff/admin boundary cases.
4. Mobile list endpoints return deterministic pagination metadata and stable default ordering.
5. Supported filters work and unsupported filters return `400` validation errors.
6. Empty lists return `200` with an empty array and pagination metadata.
7. Mobile write endpoints either support idempotency keys or document non-idempotent retry behavior.
8. Rate-limited auth/session requests return `429`, stable `RATE_LIMITED` code, and retry guidance.
9. Offline/client retry scenarios do not create duplicate progress or reward events.
10. Error responses never include stack traces, secrets, real env values, or database internals.
11. Parent users can access only linked student data.
12. Student users cannot access parent, teacher, staff, or admin-only data.
13. Teacher users can access only assigned classroom/student summaries.
14. Endpoint inventory paths, methods, request payloads, and response payloads match generated or hand-maintained mobile API documentation.
