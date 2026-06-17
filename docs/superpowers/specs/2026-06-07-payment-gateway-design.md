# Payment Gateway Integration Design

**Date:** 2026-06-07  
**Status:** Approved for implementation planning  
**Scope:** Add configurable SePay and VNPAY sandbox/production support with admin-controlled gateway selection, priority, and fallback.

## 1. Goals

MathAI needs payment gateway configuration that is controlled by administrators instead of being hard-coded in checkout. Admins must be able to enable SePay, VNPAY, or both; choose whether users select a gateway manually; or configure a priority gateway with fallback.

The implementation should reuse the existing billing/payment foundation: `PaymentTransaction`, `WebhookLog`, `payment.service.ts`, gateway adapters, billing activation, admin billing pages, and authenticated checkout routes.

## 2. Decisions

- Use a gateway registry/service instead of adding more gateway-specific branches directly into `payment.service.ts`.
- Support two gateway modes:
  - `user_select`: checkout shows all enabled and available gateways.
  - `auto_priority`: backend tries the configured priority order and falls back when a gateway cannot create a payment intent.
- Support two runtime environments:
  - `sandbox`: credentials and endpoint overrides may be configured through admin UI.
  - `production`: credentials are loaded from environment variables only; admin UI shows configured/missing status without exposing secret values.
- Integrate SePay primarily as QR/bank-transfer confirmation with webhook reconciliation.
- Keep VNPAY as redirect checkout with return verification and IPN/webhook handling.
- Keep MoMo compatible with the existing system, but this phase focuses on SePay and VNPAY.

## 3. Existing Context

Current payment code already includes:

- `packages/backend/src/services/payment/payment.service.ts`: creates payment intents and stores pending transactions.
- `packages/backend/src/services/payment/vnpay.adapter.ts`: builds VNPAY URLs and verifies IPN/return signatures.
- `packages/backend/src/services/payment/momo.adapter.ts`: existing MoMo adapter.
- `packages/backend/src/routes/billing.routes.ts`: authenticated billing/payment routes.
- `packages/backend/src/routes/webhook.routes.ts`: VNPAY/MoMo webhook processing.
- `packages/backend/src/models/payment-transaction.model.ts`: transaction state and idempotency.
- `packages/backend/src/models/webhook-log.model.ts`: raw webhook audit log.
- `packages/frontend/src/app/(dashboard)/dashboard/billing/checkout/page.tsx`: current checkout gateway selection UI.

The current limitation is that `PaymentGateway` is statically limited to `vnpay | momo`, route validation knows only those values, and gateway selection is handled through direct conditional logic.

## 4. Backend Architecture

### 4.1 Gateway Config Model

Add a persisted model, tentatively `PaymentGatewayConfig`, with one active global configuration document.

Suggested fields:

- `mode`: `user_select | auto_priority`
- `environment`: `sandbox | production`
- `fallback_enabled`: boolean
- `gateways`: array of gateway configs:
  - `gateway`: `sepay | vnpay | momo`
  - `enabled`: boolean
  - `priority`: number
  - `display_name`: string
  - `sandbox_config`: provider-specific non-secret and encrypted/secret-capable fields
  - `production_env_status`: derived at read time, not persisted as secrets
  - `last_health_check`: object with status, checked_at, message
- `created_by`, `updated_by`, timestamps, audit metadata if the local pattern supports it.

Production secrets must not be returned by admin APIs. For production, the backend should only expose booleans such as `configured: true/false` and missing key names if that is acceptable for admins.

### 4.2 Credential Resolution

Create a credential resolver used by gateway adapters:

- For `sandbox`, read admin-configured sandbox values first; fall back to sandbox env defaults when useful.
- For `production`, read only environment variables.
- Never return secrets to frontend or admin API responses.
- Validate required credentials before enabling a gateway or before creating a payment intent.

Expected env names can follow existing patterns:

- `PAYMENT_VNPAY_TMN_CODE`
- `PAYMENT_VNPAY_HASH_SECRET`
- `PAYMENT_VNPAY_PAYMENT_URL`
- `PAYMENT_VNPAY_RETURN_URL`
- `PAYMENT_SEPAY_API_KEY`
- `PAYMENT_SEPAY_WEBHOOK_SECRET`
- `PAYMENT_SEPAY_BANK_ACCOUNT`
- `PAYMENT_SEPAY_BANK_CODE`
- `PAYMENT_SEPAY_QR_TEMPLATE_URL` or equivalent after confirming SePay API contract

### 4.3 Gateway Registry

Add a registry layer, tentatively `payment-gateway.registry.ts`, responsible for:

- Loading the active config.
- Resolving enabled gateways for checkout.
- Choosing a gateway for `user_select` or `auto_priority` mode.
- Building payment initiation results via adapter interfaces.
- Running health checks/test connection.
- Preventing unsupported or disabled gateway usage.

Adapter interface should normalize redirect and QR transfer flows:

```ts
interface PaymentGatewayAdapter {
  gateway: PaymentGateway;
  createPayment(params: CreateGatewayPaymentParams): Promise<GatewayPaymentResult>;
  verifyWebhook(payload: GatewayWebhookPayload): GatewayWebhookVerification;
  mapWebhook(payload: GatewayWebhookPayload): GatewayWebhookEvent;
  healthCheck(): Promise<GatewayHealthResult>;
}
```

`GatewayPaymentResult` should support both shapes:

- `type: "redirect"`, with `redirect_url` for VNPAY.
- `type: "bank_transfer"`, with bank account, content, amount, QR URL or QR payload for SePay.

### 4.4 Payment Service Changes

Update `payment.service.ts` so it no longer decides gateways through hard-coded `if gateway === ...` branches.

For `user_select`:

- Request may include `gateway`.
- Service validates that gateway is enabled and available.
- Service creates one transaction and returns the result from the selected adapter.

For `auto_priority`:

- Request may omit `gateway` or pass `gateway: "auto"`.
- Service asks registry for priority order.
- Service tries each enabled gateway until one creates a payment successfully.
- If gateway creation fails before transaction persistence, move to fallback gateway and record an audit/log event.
- If all gateways fail, return a structured `PAYMENT_GATEWAYS_UNAVAILABLE` error.

Transaction persistence should include the actual gateway used. Idempotency should return the original transaction and payment initiation result where possible.

### 4.5 VNPAY Integration

Keep the current VNPAY redirect/IPN model, but make it environment-aware:

- Sandbox and production endpoint/credentials should resolve from the active environment.
- Return URL and IPN URL must match the selected environment.
- Existing signature verification should remain covered by tests.
- Return verification remains authenticated for user-facing polling/confirmation.
- IPN remains unauthenticated but signature-verified and logged.

### 4.6 SePay Integration

SePay should be integrated as a bank-transfer/QR gateway:

- Payment creation stores a pending `PaymentTransaction`.
- The transfer content must contain a unique `intent_id` or deterministic payment code.
- The payment response returns transfer instructions:
  - amount
  - bank name/code
  - account number
  - account name if available
  - transfer content
  - QR URL or QR payload
  - expiry time
- SePay webhook verifies signature/token, logs raw payload, extracts amount/content/reference, finds the matching transaction, and marks it succeeded only when amount and reference match.
- On success, call existing billing activation through `billingService.activateAfterPayment`.
- If webhook cannot match a transaction, log it as processed/unmatched for admin review rather than activating anything.

The exact SePay signature and payload fields must be confirmed against SePay's current documentation before implementation.

### 4.7 Webhook Routes

Extend webhook routing with:

- `POST /api/webhooks/sepay`
- Existing `POST /api/webhooks/vnpay`

Webhook handling requirements:

- Always write `WebhookLog`, even for invalid signatures.
- Verify signatures/secrets before mutating transactions.
- Maintain replay safety: already-succeeded transactions stay succeeded and return success to the provider.
- Record audit events for success, failure, invalid signature, unmatched payment, and fallback usage.

`WebhookSource` should be extended to include `sepay`.

## 5. Admin API And UI

### 5.1 Admin API

Add admin/staff-protected endpoints under an existing admin billing/settings namespace, for example:

- `GET /api/admin/billing/gateways/config`
- `PUT /api/admin/billing/gateways/config`
- `POST /api/admin/billing/gateways/:gateway/test`
- `POST /api/admin/billing/gateways/:gateway/enable`
- `POST /api/admin/billing/gateways/:gateway/disable`

The API must:

- Require admin-level access for production changes.
- Avoid returning secret values.
- Audit every config update.
- Validate that at least one enabled gateway is configured before saving an active production config.
- Validate fallback order when `auto_priority` is selected.

### 5.2 Admin UI

Extend admin billing UI with a gateway settings area:

- Global mode selector: `User chooses gateway` or `Auto priority/fallback`.
- Environment selector: `Sandbox` or `Production`.
- Gateway cards for SePay, VNPAY, and existing MoMo if retained.
- Per-gateway enable toggle.
- Priority ordering when auto mode is selected.
- Fallback toggle.
- Sandbox credential fields.
- Production credential status indicators only, with no secret display.
- Test connection button and last health status.

## 6. Checkout UX

For `user_select` mode:

- Checkout calls an endpoint such as `GET /api/billing/gateways/available`.
- UI shows only enabled and available gateways.
- VNPAY appears as redirect payment.
- SePay appears as QR/bank-transfer payment.

For `auto_priority` mode:

- Checkout may show a simple payment button without gateway choice.
- Backend selects the gateway and returns either redirect or bank-transfer instructions.
- If fallback happened, response may include `gateway_used`; frontend does not need to expose internal failure details to users.

For SePay QR flow:

- Show QR/instructions and transaction status polling.
- Poll `GET /api/billing/transactions/:id` until succeeded, failed, or expired.
- Provide a clear pending state and expiry time.

## 7. Error Handling And Security

- Missing credentials should fail early with a clear internal code.
- Invalid webhook signatures must never mutate transactions.
- Production secrets must never be exposed in admin or frontend responses.
- Payment amount must be validated against the transaction amount before marking success.
- Transaction reference/content must match the pending transaction.
- Webhook replay must be idempotent.
- Fallback should only happen before a payment has been presented to the user. Once a redirect URL or QR transfer instruction is returned, the transaction is bound to that gateway.
- Gateway health errors should be logged and visible in admin UI without exposing secrets.

## 8. Testing Plan

Backend tests:

- Gateway config validation for `user_select`, `auto_priority`, fallback, and enabled gateways.
- Credential resolver behavior for sandbox UI config and production env-only secrets.
- VNPAY adapter sandbox/production config resolution.
- SePay adapter payment instruction generation.
- SePay webhook verification, amount matching, reference matching, replay safety, unmatched payment.
- Payment service fallback when priority gateway creation fails.
- Admin config endpoints do not return secrets.
- Webhook logs are written for valid and invalid signatures.

Frontend tests:

- Checkout renders user-select gateway list from backend config.
- Auto-priority checkout hides manual gateway selection.
- SePay QR/instruction state renders and polls transaction status.
- Admin gateway settings hides production secrets and shows configured/missing status.

Verification commands should follow repo conventions:

- `npm run test --workspace=packages/backend`
- Focused frontend tests under `packages/frontend`
- `npm run verify` before final release sign-off when environment allows it.

## 9. Rollout Plan

1. Add backend types/model/config registry without changing default checkout behavior.
2. Migrate existing VNPAY behavior into the registry while preserving current env defaults.
3. Add admin config API and tests.
4. Add SePay adapter and webhook route.
5. Update checkout API and frontend for user-select/auto-priority modes.
6. Add admin UI settings.
7. Run sandbox smoke tests for VNPAY and SePay.
8. Enable production mode only after env secrets and webhook URLs are configured.

## 10. Open Implementation Notes

- Confirm SePay's current webhook signature format, payload fields, and QR generation API before coding the adapter.
- Decide whether MoMo remains visible in admin settings during this phase or stays supported only by existing code.
- Decide whether admin gateway settings are admin-only or staff can view but not edit production mode.
