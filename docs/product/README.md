# Product Contract Docs

This directory is the canonical home for P3 product readiness contracts. These documents are docs-first contracts: they define scope, acceptance criteria, dependencies, deferrals, and verification expectations before runtime implementation begins.

Docs-first means readiness contracts, not fake runtime integrations. Do not use these docs to imply that analytics, billing, mobile, reporting, or content operations runtime features exist before implementation, review, and verification have happened. Keep no secrets, no real environment values, and no provider credentials in product docs.

## Scope

The P3 product docs cover advanced product capabilities that need explicit contracts before engineering implementation:

- analytics taxonomy and dashboard behavior;
- billing architecture and MVP readiness;
- mobile API readiness and mobile app MVP boundaries;
- advanced reporting exports;
- advanced content operations workflows.

Each document should describe what future implementation must satisfy, what is intentionally deferred, and what evidence is required before runtime work can be called complete.

## Non-Goals

The P3 product docs do not:

- create runtime integrations;
- add dependencies, environment values, source code, database migrations, or CI configuration;
- replace engineering implementation plans for specific runtime waves;
- store secrets, API keys, tokens, customer data, production URLs, or real provider configuration;
- claim that deferred P3 features are already available in the product.

## Canonical P3 Mapping

| P3 ID | Contract area                | Canonical doc path                                      | Purpose                                                                                                          |
| ----- | ---------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| P3-01 | Analytics taxonomy           | `docs/product/analytics-taxonomy.md`                    | Canonical event names, properties, privacy boundaries, owners, and validation expectations.                      |
| P3-02 | Advanced analytics dashboard | `docs/product/advanced-analytics-dashboard-contract.md` | Dashboard users, metrics, filters, permissions, loading states, empty states, and acceptance criteria.           |
| P3-03 | Billing architecture         | `docs/product/billing-architecture.md`                  | Billing domain boundaries, provider abstraction, state transitions, failure handling, and operational ownership. |
| P3-04 | Billing MVP readiness        | `docs/product/billing-mvp-readiness.md`                 | Launch checklist, manual fallback, support operations, blocked items, and readiness evidence.                    |
| P3-05 | Mobile API readiness         | `docs/product/mobile-api-readiness.md`                  | Mobile-facing API expectations for auth, compatibility, errors, pagination, performance, and versioning.         |
| P3-06 | Mobile app MVP contract      | `docs/product/mobile-app-mvp-contract.md`               | Mobile MVP users, journeys, screens, offline expectations, accessibility, and release gates.                     |
| P3-07 | Advanced reporting export    | `docs/product/advanced-reporting-export-contract.md`    | Export use cases, formats, access controls, auditing, data retention, and operational guardrails.                |
| P3-08 | Content operations advanced  | `docs/product/content-operations-advanced-contract.md`  | Advanced content workflows, lifecycle states, approval rules, moderation boundaries, and quality gates.          |

## Dependencies and Deferrals

The P3 contract set depends on product, engineering, security, privacy, and operations review before runtime implementation starts. Any implementation wave should link back to the relevant canonical product contract and state which deferred items it addresses.

Current deferrals:

- P3-01 analytics runtime instrumentation is deferred.
- P3-02 advanced analytics dashboard implementation is deferred.
- P3-03 billing provider integration is deferred.
- P3-04 billing MVP launch automation is deferred.
- P3-05 mobile-specific API changes are deferred.
- P3-06 mobile app implementation is deferred.
- P3-07 advanced reporting export runtime is deferred.
- P3-08 advanced content operations automation is deferred.

## Verification Commands

Use these checks when updating the P3 product index, Wave D1 completion plan, any P3 contract doc, or the readiness checker. Verification must cover the full Wave D docs-first contract set, not only the plan and index:

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

These checks verify that the Wave D1 plan, product index, eight P3 contract docs, readiness checker, and checker test all exist; the first and last P3 IDs remain mapped; docs-first/no fake runtime/no secrets/no real environment values language is preserved; and the executable readiness contract check passes.
