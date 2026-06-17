# Payment Gateway Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-configurable SePay and VNPAY sandbox/production payment support with user-select and auto-priority/fallback modes.

**Architecture:** Introduce a gateway config model, credential resolver, and registry between billing routes and gateway adapters. Keep existing `PaymentTransaction`/`WebhookLog` persistence and billing activation, while normalizing redirect gateways like VNPAY and bank-transfer gateways like SePay.

**Tech Stack:** Express, TypeScript, Mongoose, existing Node test runner via `tsx`, Next.js App Router frontend.

---

### Task 1: Backend Gateway Core

**Files:**
- Modify: `packages/backend/src/models/payment-transaction.model.ts`
- Modify: `packages/backend/src/models/webhook-log.model.ts`
- Create: `packages/backend/src/models/payment-gateway-config.model.ts`
- Create: `packages/backend/src/services/payment/gateway.types.ts`
- Create: `packages/backend/src/services/payment/gateway-credentials.ts`
- Create: `packages/backend/src/services/payment/payment-gateway.registry.ts`
- Test: `packages/backend/src/services/payment/payment-gateway.registry.test.ts`

- [ ] Extend `PaymentGateway` and `WebhookSource` to include `sepay` while preserving `vnpay` and `momo`.
- [ ] Add `PaymentGatewayConfig` with mode, environment, fallback flag, gateway list, sandbox config, and health metadata.
- [ ] Add typed credential resolver that reads sandbox config from DB and production secrets from env.
- [ ] Add registry methods: `getPublicConfig`, `getAvailableGateways`, `selectGateway`, `resolveAdapterConfig`, and `recordHealthCheck`.
- [ ] Add tests for default config, user-select filtering, auto-priority order, fallback disabled, and production secret masking.
- [ ] Run `npm run test --workspace=packages/backend -- payment-gateway.registry.test.ts` if supported; otherwise run backend tests focused by Node test name.

### Task 2: Gateway Adapters And Payment Service

**Files:**
- Modify: `packages/backend/src/services/payment/vnpay.adapter.ts`
- Create: `packages/backend/src/services/payment/sepay.adapter.ts`
- Modify: `packages/backend/src/services/payment/payment.service.ts`
- Modify: `packages/backend/src/services/payment/index.ts`
- Test: `packages/backend/src/services/payment/payment.service.test.ts`
- Test: `packages/backend/src/services/payment/sepay.adapter.test.ts`

- [ ] Make VNPAY adapter constructible from resolved config without relying only on singleton env defaults.
- [ ] Add SePay adapter for transfer content generation, QR URL payload, webhook verification, and webhook mapping.
- [ ] Refactor `PaymentService.createIntent` to use the registry and normalized gateway results.
- [ ] Return both `redirect` and `bank_transfer` initiation payloads from payment intent creation.
- [ ] Add fallback behavior only before a payment instruction is returned to the user.
- [ ] Add tests for VNPAY selection, SePay payment instruction, fallback from VNPAY to SePay, unsupported gateway, and idempotency.

### Task 3: Billing, Admin, And Webhook Routes

**Files:**
- Modify: `packages/backend/src/routes/billing.routes.ts`
- Modify: `packages/backend/src/routes/admin-billing.routes.ts`
- Modify: `packages/backend/src/routes/webhook.routes.ts`
- Test: `packages/backend/src/routes/admin-panel.test.ts` or new focused route tests if local patterns support them

- [ ] Add `GET /api/billing/gateways/available` for checkout.
- [ ] Allow `POST /api/billing/payment-intents` and existing subscription checkout route to accept `gateway: "auto" | "vnpay" | "sepay" | "momo"`.
- [ ] Return normalized payment initiation result including `type`, `gateway_used`, `redirect_url`, or `bank_transfer` details.
- [ ] Add admin endpoints for reading/updating gateway config and testing gateway health.
- [ ] Add `POST /api/webhooks/sepay` with raw logging, signature verification, amount/reference matching, replay safety, and billing activation.
- [ ] Ensure API responses never expose production secrets.

### Task 4: Frontend Checkout And Admin UI

**Files:**
- Modify: `packages/frontend/src/app/(dashboard)/dashboard/billing/checkout/page.tsx`
- Modify: `packages/frontend/src/app/(dashboard)/dashboard/billing/return/page.tsx`
- Modify: `packages/frontend/src/app/(admin)/admin/billing/page.tsx`
- Modify: `packages/frontend/src/lib/api.ts` if existing typed helpers require updates

- [ ] Fetch available gateway config before checkout render.
- [ ] Render manual gateway selection only in `user_select` mode.
- [ ] In `auto_priority` mode, submit `gateway: "auto"` and display the gateway used after the backend responds.
- [ ] Render SePay bank-transfer/QR instructions and poll transaction status until succeeded/failed/expired.
- [ ] Add admin gateway settings panel with mode, environment, enable toggles, priority order, fallback toggle, sandbox fields, production configured/missing status, and test buttons.
- [ ] Keep VNPAY redirect behavior intact.

### Task 5: Verification And Documentation

**Files:**
- Modify: `docs/BAO-CAO-TINH-TRANG-DU-AN.md` if implementation status changes materially
- Modify: `.env.example`, `packages/backend/.env.example`, or frontend env examples if present and relevant

- [ ] Add/update env example keys for VNPAY and SePay sandbox/production usage.
- [ ] Run backend focused tests.
- [ ] Run frontend lints/tests for changed files where available.
- [ ] Run `ReadLints` for edited files.
- [ ] Summarize any verification not run and why.
