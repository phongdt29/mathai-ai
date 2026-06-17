# P3-03 Billing Architecture

## Status

Proposed documentation for a future billing capability. This document is intentionally provider-agnostic and does not select, recommend, or configure a payment processor.

## Goals

- Define the billing domain and integration boundaries before runtime implementation.
- Support subscription-style paid access without coupling product logic to a provider SDK.
- Preserve safety for minors, schools, parents, teachers, and administrators.
- Make billing changes auditable, reversible where possible, and resilient to duplicate or delayed provider events.

## Non-goals

- Selecting a billing provider.
- Implementing checkout, invoices, tax, payouts, refunds, or entitlement runtime code.
- Storing payment card, bank, or wallet details in MathAI systems.
- Using production credentials or real customer data during MVP validation.

## Provider-agnostic integration boundary

MathAI should treat any external billing system as an event source and hosted payment surface, not as the source of product authorization truth.

The internal boundary should expose a small anti-corruption layer:

| Boundary concept  | Purpose                                                                 | Provider-specific data allowed internally?                      |
| ----------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| `BillingCustomer` | Maps an internal account/organization to a provider customer reference. | Only opaque external IDs and non-sensitive references.          |
| `BillingPlan`     | Internal commercial plan definition used for entitlement decisions.     | No provider price IDs outside mapping tables/config.            |
| `Subscription`    | Internal subscription lifecycle record.                                 | Opaque external subscription ID only.                           |
| `BillingEvent`    | Immutable audit/event inbox for webhook and admin billing actions.      | Sanitized event type, external event ID, checksums, timestamps. |
| `Entitlement`     | Product access derived from subscription state and policy.              | No direct provider dependency.                                  |

Provider-specific implementation details should remain behind a `BillingGateway` interface when runtime work begins. Product code should depend on internal plans, subscription states, and entitlements only.

## Domain model

### Core entities

| Entity             | Key fields                                                                                                                                              | Notes                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `BillingAccount`   | `id`, `ownerUserId`, `organizationId?`, `accountType`, `status`, `createdAt`, `updatedAt`                                                               | Represents who is billed. May be parent-owned, school-owned, or organization-owned. |
| `BillingCustomer`  | `id`, `billingAccountId`, `providerKey`, `externalCustomerId`, `status`, `createdAt`                                                                    | Stores provider mapping with opaque IDs only.                                       |
| `BillingPlan`      | `id`, `code`, `name`, `audience`, `billingInterval`, `featureSet`, `status`                                                                             | Internal plan catalog. Provider price IDs must not leak into authorization logic.   |
| `PlanPriceMapping` | `id`, `planId`, `providerKey`, `externalPriceId`, `currency`, `status`                                                                                  | Optional mapping used only by billing integration code.                             |
| `Subscription`     | `id`, `billingAccountId`, `planId`, `status`, `currentPeriodStart`, `currentPeriodEnd`, `trialEndsAt?`, `cancelAtPeriodEnd`, `externalSubscriptionId?`  | Internal subscription state machine.                                                |
| `Entitlement`      | `id`, `subjectType`, `subjectId`, `sourceSubscriptionId?`, `features`, `startsAt`, `endsAt?`, `status`                                                  | Product access derived from policy and subscription state.                          |
| `InvoiceRecord`    | `id`, `billingAccountId`, `subscriptionId?`, `externalInvoiceId`, `status`, `currency`, `amountDueMinor`, `amountPaidMinor`, `periodStart`, `periodEnd` | Sanitized invoice metadata only; no payment method details.                         |
| `BillingEvent`     | `id`, `source`, `eventType`, `externalEventId?`, `idempotencyKey`, `status`, `payloadDigest`, `receivedAt`, `processedAt?`, `actorUserId?`              | Immutable event inbox and audit reference.                                          |
| `BillingAuditLog`  | `id`, `actorType`, `actorId?`, `action`, `targetType`, `targetId`, `beforeDigest?`, `afterDigest?`, `reason?`, `createdAt`                              | Human-readable compliance and support trail.                                        |

### Suggested relationships

- One `BillingAccount` can have many `BillingCustomer` mappings, but only one active mapping per provider.
- One `BillingAccount` can have zero or more `Subscription` records; policy must define whether concurrent active subscriptions are allowed.
- One `Subscription` derives zero or more `Entitlement` records for learners, families, classrooms, or organizations.
- `BillingEvent` records all incoming webhook-like events and internal billing commands before processing.
- `BillingAuditLog` records all billing state transitions, admin changes, entitlement grants/revocations, and security-relevant outcomes.

### Internal identifiers

- Internal IDs should be opaque and not derived from provider IDs.
- External provider IDs should be stored only in billing integration tables/fields.
- Logs and analytics should reference internal IDs and event IDs, not raw provider payloads.

## State machines

### Billing account states

```text
pending_setup -> active -> suspended -> active
pending_setup -> closed
active -> closed
suspended -> closed
```

| State           | Meaning                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------- |
| `pending_setup` | Account exists but no verified billing relationship or entitlement policy is active.     |
| `active`        | Account can own subscriptions and entitlements.                                          |
| `suspended`     | Billing access is temporarily blocked because of risk, payment, or admin action.         |
| `closed`        | Billing account is no longer usable for new billing activity. Historical records remain. |

### Subscription states

```text
created -> trialing -> active -> past_due -> active
created -> active
trialing -> canceled
active -> canceling -> canceled
active -> paused -> active
active -> expired
past_due -> canceled
past_due -> unpaid
unpaid -> active
```

| State       | Entitlement behavior                                                        |
| ----------- | --------------------------------------------------------------------------- |
| `created`   | No paid entitlement until confirmed by policy/event.                        |
| `trialing`  | Trial entitlement allowed until `trialEndsAt`.                              |
| `active`    | Entitlement active for current period.                                      |
| `past_due`  | Grace-period entitlement depends on product/finance policy.                 |
| `unpaid`    | Entitlement disabled unless explicit override exists.                       |
| `paused`    | Entitlement disabled or limited according to policy.                        |
| `canceling` | Entitlement remains active until period end if `cancelAtPeriodEnd` is true. |
| `canceled`  | Entitlement disabled after effective cancellation.                          |
| `expired`   | Entitlement disabled after fixed term end.                                  |

### Invoice/payment states

```text
draft -> open -> paid
open -> void
open -> uncollectible
open -> refunded_partial
paid -> refunded_partial -> refunded_full
paid -> disputed -> paid
paid -> disputed -> refunded_full
```

Invoice/payment states must not directly grant access. They inform subscription state transitions, support workflows, and audit reporting.

### Webhook/event processing states

```text
received -> authenticated -> deduplicated -> validated -> processed
received -> rejected
validated -> parked
processed -> replayed
parked -> processed
```

| State           | Meaning                                                                           |
| --------------- | --------------------------------------------------------------------------------- |
| `received`      | Raw request accepted at edge with minimal metadata.                               |
| `authenticated` | Signature/timestamp checks passed.                                                |
| `deduplicated`  | Idempotency key or external event ID checked.                                     |
| `validated`     | Event type and payload shape accepted.                                            |
| `processed`     | Internal state transition completed transactionally.                              |
| `parked`        | Event could not be applied because prerequisite state is missing or out of order. |
| `rejected`      | Authentication, authorization, or validation failed.                              |
| `replayed`      | Previously processed event was intentionally reprocessed for reconciliation.      |

## RBAC and permissions

Billing actions should be guarded separately from general application administration.

| Role                   | Allowed billing actions                                                                                                     | Denied actions                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Student/learner        | View own entitlement status when age/privacy policy allows.                                                                 | Checkout, invoices, payment methods, subscription changes.           |
| Parent/guardian        | View family plan status, initiate sandbox checkout in MVP, request cancellation, view sanitized invoice summaries.          | Access unrelated families or raw provider payloads.                  |
| Teacher                | View whether classroom features are enabled.                                                                                | Payment, invoice, or provider-customer administration.               |
| School admin           | View organization billing status and entitlement coverage for their organization.                                           | Raw provider payloads, global billing changes.                       |
| Support staff          | View sanitized billing status and audit history; trigger approved support workflows.                                        | Change pricing, grant unlimited access, view payment method details. |
| Billing admin          | Manage internal plan mappings, subscriptions, entitlement overrides, reconciliation, and provider configuration references. | Access secrets directly in application UI.                           |
| System/webhook actor   | Process authenticated billing events with scoped service permission.                                                        | Human UI access; arbitrary admin actions.                            |
| Security/admin auditor | Read billing audit logs and security events.                                                                                | Mutating subscription or plan state unless separately granted.       |

RBAC rules should enforce:

- Least privilege by action, not broad `admin` checks.
- Organization/family scoping on all read paths.
- Maker/checker approval for manual entitlement overrides and refunds if supported later.
- Audit log creation for every privileged billing action, successful or denied.

## Audit events

Minimum audit event taxonomy:

| Event name                              | Actor                | Target                   | Notes                                                |
| --------------------------------------- | -------------------- | ------------------------ | ---------------------------------------------------- |
| `billing.account.created`               | User/system          | BillingAccount           | No sensitive payment data.                           |
| `billing.customer.linked`               | System/admin         | BillingCustomer          | Stores provider key and opaque external customer ID. |
| `billing.checkout.started`              | Parent/admin/system  | BillingAccount           | Sandbox-only for MVP.                                |
| `billing.subscription.created`          | Webhook/system/admin | Subscription             | Include previous state digest if any.                |
| `billing.subscription.state_changed`    | Webhook/system/admin | Subscription             | Required for all state transitions.                  |
| `billing.subscription.cancel_requested` | Parent/admin         | Subscription             | Capture effective date and reason code.              |
| `billing.entitlement.granted`           | System/admin         | Entitlement              | Include source subscription or override reason.      |
| `billing.entitlement.revoked`           | System/admin         | Entitlement              | Include revocation reason.                           |
| `billing.invoice.recorded`              | Webhook/system       | InvoiceRecord            | Sanitized invoice metadata only.                     |
| `billing.webhook.received`              | System               | BillingEvent             | Do not store raw payload in logs.                    |
| `billing.webhook.rejected`              | System               | BillingEvent             | Include rejection category, not secrets/signatures.  |
| `billing.webhook.parked`                | System               | BillingEvent             | Include missing prerequisite reference.              |
| `billing.webhook.replayed`              | Billing admin/system | BillingEvent             | Requires reason and actor.                           |
| `billing.override.created`              | Billing admin        | Entitlement/Subscription | Requires explicit reason and expiry.                 |
| `billing.config.changed`                | Billing admin        | Billing config reference | Redact secret values.                                |
| `billing.access.denied`                 | User/system          | Billing resource         | Security audit event.                                |

Audit logs should be append-only from the application perspective and retained according to product/legal policy.

## Webhook, idempotency, and reconciliation

### Webhook intake requirements

- Accept webhooks only over HTTPS in deployed environments.
- Verify provider signature using a secret loaded from runtime configuration.
- Enforce timestamp tolerance to reduce replay risk.
- Parse and validate event type and payload shape before processing.
- Store event metadata and a payload digest before business processing.
- Never log full raw payloads if they may contain personal or payment data.
- Return deterministic responses for duplicate events.

### Idempotency model

Each incoming provider event should compute an idempotency key from:

```text
providerKey + externalEventId + eventType
```

If no external event ID is available, use a stable digest of the canonicalized provider event plus provider timestamp. The first successful processing result should be recorded and reused for duplicates.

Internal commands that create checkout sessions, cancel subscriptions, or apply overrides should use command idempotency keys such as:

```text
actorId + commandType + targetId + clientRequestId
```

### Ordering and replay

- Events may arrive out of order; processors must compare effective timestamps and current state.
- Unknown prerequisite entities should park events instead of dropping them.
- Replays must be explicit, audited, and safe to run multiple times.
- A reconciliation job should compare internal subscription/invoice state against provider summaries without importing sensitive payment details.

## Security and privacy

### Sensitive data boundaries

MathAI should not store:

- Full card numbers, bank account numbers, wallet credentials, CVC/CVV, or payment authentication data.
- Raw provider secrets, webhook signing secrets, API keys, or OAuth tokens in docs or logs.
- Full raw webhook payloads if provider data may include personal or payment details.

MathAI may store sanitized operational metadata:

- Opaque provider customer/subscription/invoice IDs.
- Plan/price reference IDs.
- Currency and minor-unit amounts for accounting summaries.
- Invoice status and billing period dates.
- Last payment failure category if sanitized and policy-approved.

### Privacy requirements

- Minimize billing visibility for learners and minors.
- Separate educational progress data from billing event data.
- Restrict invoice and payment-related metadata to parent/guardian, school admin, support, and billing roles as appropriate.
- Redact personal data in logs, metrics, traces, and support exports.
- Define retention and deletion policy for billing metadata before implementation.

### Operational security

- Store provider credentials only in the deployment secret manager or environment configuration.
- Rotate webhook signing secrets and API credentials according to operational policy.
- Use separate sandbox and production credentials.
- Alert on repeated webhook signature failures, unusual replay volume, and privileged billing changes.
- Protect admin billing actions with strong authentication and authorization.

## Risk assessment

| Risk                                      | Impact | Likelihood before controls | Mitigation                                                                |
| ----------------------------------------- | ------ | -------------------------- | ------------------------------------------------------------------------- |
| Provider lock-in                          | High   | Medium                     | Keep provider-specific IDs behind mappings and gateway interface.         |
| Duplicate webhook processing              | High   | High                       | Idempotency keys, transactional inbox, deterministic duplicate responses. |
| Out-of-order lifecycle events             | Medium | High                       | Park events, compare effective timestamps, reconcile periodically.        |
| Incorrect entitlement grant               | High   | Medium                     | Derive entitlements from internal state machine; audit all grants.        |
| Unauthorized billing access               | High   | Medium                     | Dedicated RBAC actions and scoped resource checks.                        |
| Sensitive payment data exposure           | High   | Medium                     | Do not store payment method data; sanitize logs and evidence.             |
| Sandbox/test data leaking into production | Medium | Medium                     | Environment isolation, explicit mode flags, config validation.            |
| Tax/accounting gaps                       | High   | Medium                     | Require finance decisions before runtime implementation.                  |
| Refund/dispute ambiguity                  | Medium | Medium                     | Define support and finance workflows before enabling production billing.  |
| Minor privacy violations                  | High   | Medium                     | Restrict learner visibility and separate billing from learning records.   |
| Manual override abuse                     | High   | Low                        | Maker/checker policy, expiry dates, audit events, alerts.                 |
| Webhook spoofing/replay                   | High   | Medium                     | Signature verification, timestamp tolerance, replay detection.            |

## Decisions required before runtime implementation

1. Billing audience: parent/family subscriptions, school/organization subscriptions, teacher plans, or a combination.
2. Entitlement subject: individual learner, family, classroom, school, or tenant-level access.
3. Plan catalog: names, feature sets, limits, currencies, intervals, trials, discounts, and upgrade/downgrade behavior.
4. Tax and invoicing ownership: which finance/legal process owns tax calculation, invoice retention, receipts, and refund policy.
5. Cancellation policy: immediate cancellation vs end-of-period access.
6. Grace-period policy for `past_due` subscriptions.
7. Manual override policy: who can grant access, maximum duration, approval requirements, and audit review cadence.
8. Data retention policy for billing metadata and audit records.
9. Support policy for refunds, disputes, failed payments, and account ownership conflicts.
10. Sandbox acceptance criteria and evidence required before any production billing work.
11. Provider evaluation criteria, without selecting a provider in this document.
12. Compliance review requirements for minors, schools, privacy, and regional payments/tax obligations.
