# Wave D1: P3 Docs-First Completion Plan

## Status

Accepted as the Wave D1 documentation completion plan for P3 product contracts.

## Scope

Wave D1 fixes the canonical documentation paths and completion criteria for the P3 docs-first contract set. It creates a stable map for P3-01 through P3-08 so future implementation work can reference one product documentation index instead of scattered or implied locations.

This wave is documentation-only. It defines readiness contracts, implementation boundaries, dependencies, deferrals, and verification commands for future runtime work.

Canonical P3 contract docs live under `docs/product/`:

- `docs/product/analytics-taxonomy.md`
- `docs/product/advanced-analytics-dashboard-contract.md`
- `docs/product/billing-architecture.md`
- `docs/product/billing-mvp-readiness.md`
- `docs/product/mobile-api-readiness.md`
- `docs/product/mobile-app-mvp-contract.md`
- `docs/product/advanced-reporting-export-contract.md`
- `docs/product/content-operations-advanced-contract.md`

## Explicit Docs-First Meaning

Docs-first means these P3 artifacts are readiness contracts, not fake runtime integrations.

A P3 document may define:

- product goals and acceptance criteria;
- event, API, reporting, billing, mobile, or operations contracts;
- expected data shapes and ownership boundaries;
- rollout gates, deferrals, and dependencies;
- verification commands and evidence expected before implementation is called complete.

A P3 document must not pretend runtime functionality exists when it does not. Specifically, docs-first work must not add fake analytics pipelines, fake billing providers, fake mobile clients, fake exports, fake operational automation, or real environment values. Runtime integration belongs in later implementation waves after the readiness contract is reviewed and accepted.

## Non-Goals

Wave D1 does not:

- implement analytics ingestion, dashboards, reports, exports, or telemetry;
- integrate payment processors, billing webhooks, subscription state, invoices, or customer portals;
- build a mobile application, native shell, push notifications, or app-store workflow;
- add backend API endpoints, database migrations, schema changes, dependencies, or secrets;
- modify `.beads`, runtime source code, CI, environment files, or deployment configuration;
- claim P3 runtime readiness beyond the documented contract and deferral state.

## P3 Mapping Table

| P3 ID | Contract area                | Canonical doc path                                      | Completion meaning for Wave D1                                                                                         | Runtime implementation status                                    |
| ----- | ---------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| P3-01 | Analytics taxonomy           | `docs/product/analytics-taxonomy.md`                    | Defines canonical analytics events, naming rules, ownership, privacy boundaries, and validation expectations.          | Deferred; no analytics runtime integration in Wave D1.           |
| P3-02 | Advanced analytics dashboard | `docs/product/advanced-analytics-dashboard-contract.md` | Defines dashboard audiences, metrics, filters, states, permissions, and evidence required before build.                | Deferred; no dashboard implementation in Wave D1.                |
| P3-03 | Billing architecture         | `docs/product/billing-architecture.md`                  | Defines billing domain model, provider boundary, state transitions, failure handling, and integration gates.           | Deferred; no payment provider or webhook integration in Wave D1. |
| P3-04 | Billing MVP readiness        | `docs/product/billing-mvp-readiness.md`                 | Defines minimum launch checklist, operational readiness, manual fallback, and blocked items.                           | Deferred; no live billing enablement in Wave D1.                 |
| P3-05 | Mobile API readiness         | `docs/product/mobile-api-readiness.md`                  | Defines API readiness expectations for mobile clients, auth/session boundaries, pagination, errors, and compatibility. | Deferred; no new API endpoints in Wave D1.                       |
| P3-06 | Mobile app MVP contract      | `docs/product/mobile-app-mvp-contract.md`               | Defines mobile MVP scope, core screens, user journeys, offline expectations, and release gates.                        | Deferred; no native or mobile web app implementation in Wave D1. |
| P3-07 | Advanced reporting export    | `docs/product/advanced-reporting-export-contract.md`    | Defines export use cases, data access rules, formats, auditability, and operational controls.                          | Deferred; no export runtime integration in Wave D1.              |
| P3-08 | Content operations advanced  | `docs/product/content-operations-advanced-contract.md`  | Defines content operations workflows, roles, quality gates, lifecycle states, and moderation/approval boundaries.      | Deferred; no content automation runtime integration in Wave D1.  |

## Dependencies and Deferrals

### Shared Dependencies

- Product review of each readiness contract before runtime work begins.
- Security and privacy review for analytics, reporting exports, billing, and mobile API surfaces.
- Role and permission confirmation for dashboards, exports, billing operations, and content operations.
- Stable API and domain ownership decisions before implementation tasks are decomposed.
- Test strategy for each runtime wave, including contract tests where relevant.

### Deferred Runtime Work

- P3-01 analytics instrumentation and ingestion are deferred until the taxonomy is reviewed.
- P3-02 dashboard UI and backend aggregation are deferred until metrics and permissions are accepted.
- P3-03 provider integration and billing persistence are deferred until architecture decisions are accepted.
- P3-04 billing launch automation is deferred until operational readiness is accepted.
- P3-05 mobile API changes are deferred until compatibility, auth, and error contracts are accepted.
- P3-06 mobile app delivery is deferred until MVP journeys and release gates are accepted.
- P3-07 export implementation is deferred until data access, audit, and format contracts are accepted.
- P3-08 advanced content operations automation is deferred until lifecycle and approval contracts are accepted.

## Verification Commands

Wave D1 verification is docs-first, but it must cover the full Wave D contract set and the P3 readiness checker so changes cannot accidentally verify only the plan and index while ignoring the eight contract docs or checker scripts:

```bash
test -f docs/plans/wave-d-p3-completion.md
test -f docs/product/README.md
test -f docs/product/analytics-taxonomy.md
test -f docs/product/advanced-analytics-dashboard-contract.md
test -f docs/product/billing-architecture.md
test -f docs/product/billing-mvp-readiness.md
test -f docs/product/mobile-api-readiness.md
test -f docs/product/mobile-app-mvp-contract.md
test -f docs/product/advanced-reporting-export-contract.md
test -f docs/product/content-operations-advanced-contract.md
test -f scripts/p3-readiness-contract-check.js
test -f scripts/p3-readiness-contract-check.test.js
grep -n "P3-01" docs/plans/wave-d-p3-completion.md docs/product/README.md
grep -n "P3-08" docs/plans/wave-d-p3-completion.md docs/product/README.md
grep -ni "docs-first" docs/plans/wave-d-p3-completion.md docs/product/README.md
grep -ni "no fake runtime" docs/plans/wave-d-p3-completion.md docs/product/README.md
grep -ni "no secrets" docs/plans/wave-d-p3-completion.md docs/product/README.md docs/product/*.md
grep -ni "no real environment values" docs/plans/wave-d-p3-completion.md docs/product/README.md docs/product/*.md
node --test scripts/p3-readiness-contract-check.test.js
node scripts/p3-readiness-contract-check.js
git diff --name-only -- docs/plans/wave-d-p3-completion.md docs/product/README.md docs/product/analytics-taxonomy.md docs/product/advanced-analytics-dashboard-contract.md docs/product/billing-architecture.md docs/product/billing-mvp-readiness.md docs/product/mobile-api-readiness.md docs/product/mobile-app-mvp-contract.md docs/product/advanced-reporting-export-contract.md docs/product/content-operations-advanced-contract.md scripts/p3-readiness-contract-check.js scripts/p3-readiness-contract-check.test.js
```

Expected result: the Wave D1 plan, product index, eight P3 contract docs, readiness checker, and checker test all exist; the checker test and project checker pass; and the docs clearly state that P3 docs are readiness contracts with no fake runtime integrations, no secrets, and no real environment values.
