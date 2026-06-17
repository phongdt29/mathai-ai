# P3-04 Billing MVP Readiness

## Status

Proposed readiness checklist for a sandbox-only billing MVP. This document intentionally avoids recommending, selecting, or installing a billing provider.

## MVP principle

The first billing milestone must prove product, finance, security, and operational readiness in sandbox mode only. It should not process real payments, expose production billing endpoints, store real payment method data, or grant paid production access.

## Sandbox-only MVP scope

### In scope

- Internal plan catalog draft using provider-agnostic plan codes.
- Sandbox checkout initiation through a generic billing gateway boundary.
- Sandbox webhook intake for subscription and invoice lifecycle events.
- Idempotent event processing using a billing event inbox.
- Internal subscription state transitions in sandbox mode.
- Derived entitlement previews for test users or test organizations only.
- Sanitized billing audit logs and support evidence.
- Admin/support read-only views or reports if implemented with sanitized data.
- Reconciliation dry runs against sandbox provider summaries.
- Secret hygiene and log redaction checks.

### Out of scope

- Production payments or live checkout.
- Real provider selection or recommendation.
- Real card, bank, wallet, or payment method collection by MathAI.
- Production tax, receipt, invoice, refund, or dispute workflows.
- Automatic production entitlement grants from billing state.
- Provider-specific SDK installation.
- New dependencies for billing.
- `.beads` task edits or workflow state changes.
- Storage of production environment values in documentation.

## Required product decisions

These decisions must be documented before runtime implementation begins:

| Decision                   | Required answer                                                                 |
| -------------------------- | ------------------------------------------------------------------------------- |
| Target billing audience    | Parent/family, teacher, school, organization, or mixed model.                   |
| MVP plan set               | Exact sandbox plan codes, feature sets, limits, and display names.              |
| Entitlement subject        | Learner, family, classroom, school, organization, or tenant.                    |
| Trial behavior             | Whether trials exist, duration, eligibility, and end behavior.                  |
| Upgrade/downgrade behavior | Immediate, next-period, prorated, or not supported in MVP.                      |
| Cancellation behavior      | Immediate loss of access or end-of-period access.                               |
| Grace period               | Access behavior for `past_due` subscriptions.                                   |
| Manual override policy     | Whether support/billing admins can grant temporary access and maximum duration. |
| Learner visibility         | What billing status, if any, learners can see.                                  |
| Family/school ownership    | How ownership disputes and transfers are handled.                               |
| Support flows              | What support can view and what actions require billing admin approval.          |
| Production launch criteria | Evidence required to move beyond sandbox mode.                                  |

## Required finance/legal decisions

These decisions must be resolved before production billing implementation and should be stubbed or explicitly disabled for sandbox MVP:

| Decision                   | Required answer                                                             |
| -------------------------- | --------------------------------------------------------------------------- |
| Pricing                    | Price points, billing intervals, currencies, and regional availability.     |
| Tax responsibility         | Who calculates, collects, remits, and reports taxes.                        |
| Invoice and receipt policy | Required fields, retention period, customer access, and export process.     |
| Refund policy              | Eligibility, approval roles, time windows, and accounting treatment.        |
| Dispute/chargeback process | Ownership, evidence requirements, and entitlement impact.                   |
| Revenue recognition        | Whether subscription periods and invoices need accounting exports.          |
| Discounts/coupons          | Whether allowed, who can issue them, and audit requirements.                |
| School procurement         | Purchase orders, offline invoices, contracts, and non-card payment support. |
| Data retention             | Retention and deletion policy for billing metadata and audit logs.          |
| Privacy/compliance         | Review needed for minors, schools, regions, and customer communications.    |

## Placeholder environment key names

Documentation and code examples may reference placeholder key names only. Do not place real values in docs, tests, logs, screenshots, tickets, or committed files.

Suggested placeholder names:

```text
BILLING_MODE
BILLING_PROVIDER_KEY
BILLING_PUBLIC_KEY
BILLING_SECRET_KEY
BILLING_WEBHOOK_SECRET
BILLING_WEBHOOK_TOLERANCE_SECONDS
BILLING_CHECKOUT_SUCCESS_URL
BILLING_CHECKOUT_CANCEL_URL
BILLING_PORTAL_RETURN_URL
BILLING_SANDBOX_PRICE_BASIC
BILLING_SANDBOX_PRICE_FAMILY
BILLING_SANDBOX_PRICE_SCHOOL
BILLING_IDEMPOTENCY_NAMESPACE
BILLING_RECONCILIATION_ENABLED
BILLING_AUDIT_RETENTION_DAYS
```

Allowed placeholder examples:

```text
BILLING_MODE=sandbox
BILLING_PROVIDER_KEY=placeholder-provider
BILLING_SECRET_KEY=<sandbox-secret-placeholder>
BILLING_WEBHOOK_SECRET=<sandbox-webhook-secret-placeholder>
BILLING_SANDBOX_PRICE_BASIC=<sandbox-price-id-placeholder>
```

Disallowed examples:

- Real API keys.
- Real webhook signing secrets.
- Real customer IDs, subscription IDs, invoice IDs, email addresses, phone numbers, or payment references.
- Production URLs containing live account identifiers.
- Screenshots showing provider dashboard secrets or real customer records.

## Sanitized evidence shapes

Use sanitized evidence to prove readiness without exposing secrets or personal data.

### Sandbox checkout evidence

```json
{
  "evidenceType": "sandbox_checkout_started",
  "mode": "sandbox",
  "billingAccountId": "ba_test_redacted",
  "planCode": "family_basic_sandbox",
  "checkoutSessionRef": "checkout_session_redacted",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "actor": {
    "type": "parent",
    "id": "user_test_redacted"
  }
}
```

### Webhook intake evidence

```json
{
  "evidenceType": "billing_webhook_received",
  "mode": "sandbox",
  "providerKey": "placeholder-provider",
  "eventType": "subscription.updated",
  "externalEventId": "event_redacted",
  "idempotencyKeyDigest": "sha256:redacted",
  "signatureVerified": true,
  "payloadDigest": "sha256:redacted",
  "receivedAt": "2026-01-01T00:00:00.000Z"
}
```

### Idempotency evidence

```json
{
  "evidenceType": "billing_event_idempotency",
  "mode": "sandbox",
  "idempotencyKeyDigest": "sha256:redacted",
  "firstProcessingStatus": "processed",
  "duplicateProcessingStatus": "duplicate_ignored",
  "stateChangedOnce": true,
  "processedAt": "2026-01-01T00:00:01.000Z"
}
```

### Subscription state evidence

```json
{
  "evidenceType": "subscription_state_transition",
  "mode": "sandbox",
  "subscriptionId": "sub_internal_test_redacted",
  "billingAccountId": "ba_test_redacted",
  "planCode": "family_basic_sandbox",
  "fromState": "trialing",
  "toState": "active",
  "sourceEventId": "billing_event_test_redacted",
  "effectiveAt": "2026-01-01T00:00:02.000Z"
}
```

### Entitlement preview evidence

```json
{
  "evidenceType": "entitlement_preview",
  "mode": "sandbox",
  "subjectType": "family",
  "subjectId": "family_test_redacted",
  "sourceSubscriptionId": "sub_internal_test_redacted",
  "features": ["premium_lessons", "weekly_reports"],
  "status": "preview_active",
  "startsAt": "2026-01-01T00:00:02.000Z",
  "endsAt": "2026-02-01T00:00:00.000Z"
}
```

### Audit evidence

```json
{
  "evidenceType": "billing_audit_event",
  "mode": "sandbox",
  "auditEventName": "billing.subscription.state_changed",
  "actorType": "system",
  "targetType": "Subscription",
  "targetId": "sub_internal_test_redacted",
  "beforeDigest": "sha256:redacted",
  "afterDigest": "sha256:redacted",
  "createdAt": "2026-01-01T00:00:02.000Z"
}
```

## Sandbox readiness checks

| Check                                       | Required evidence                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| Provider-agnostic boundary exists in design | Billing architecture references internal gateway and mappings only.    |
| No provider recommendation                  | Docs do not select or recommend any provider.                          |
| No real secrets                             | Secret hygiene grep finds no live-looking values.                      |
| Sandbox-only mode                           | Runtime design uses `BILLING_MODE=sandbox` before any production path. |
| Idempotency design                          | Duplicate event evidence shows one state transition.                   |
| Webhook security design                     | Signature verification and timestamp tolerance are specified.          |
| RBAC design                                 | Billing actions are separate from broad app administration.            |
| Auditability                                | Required audit event taxonomy is defined.                              |
| Sanitized evidence                          | Evidence examples redact identifiers and use placeholder values.       |
| Product decisions                           | Required product decisions are documented and owners assigned.         |
| Finance/legal decisions                     | Required finance/legal decisions are documented and owners assigned.   |
| Runtime blockers                            | Explicit blockers are resolved before implementation begins.           |

## Explicit blockers before runtime implementation

Runtime billing implementation must not begin until all blockers are resolved:

1. Product owner approves target billing audience, MVP plan set, and entitlement subject.
2. Finance/legal owner approves pricing, tax, invoice, refund, dispute, and retention policies or confirms they are disabled for sandbox MVP.
3. Security owner approves webhook verification, secret handling, redaction, and audit requirements.
4. Privacy/compliance owner approves learner/minor visibility and billing metadata retention.
5. Engineering owner approves provider-agnostic gateway boundaries and no-provider-lock-in constraints.
6. RBAC matrix is translated into concrete permissions and scoped resource checks.
7. Audit event names and required fields are finalized.
8. Sandbox environment key names are configured with placeholder or secret-manager values outside the repository.
9. Test data policy is defined; no real customers, real payment instruments, or production identifiers are used.
10. Reconciliation and duplicate-event behavior are specified with acceptance tests.
11. Support workflows for cancellation, failed payment, refund request intake, and entitlement overrides are approved or explicitly disabled.
12. Production launch path is separated from sandbox MVP and requires a later approval gate.
13. No new dependency or provider SDK is added without a separate reviewed implementation decision.
14. No `.beads` edits or task-state changes are required for the documentation-only readiness milestone.

## Definition of ready for implementation planning

The billing MVP is ready for implementation planning only when:

- P3-03 billing architecture is approved as provider-agnostic.
- Product and finance/legal decision tables have assigned owners and recorded answers.
- Sandbox-only scope is accepted by product, engineering, security, and finance/legal stakeholders.
- Placeholder environment key names are agreed, with no values committed.
- Sanitized evidence shapes are accepted for verification and release review.
- Explicit blockers above are closed or intentionally deferred with sandbox-safe behavior.
