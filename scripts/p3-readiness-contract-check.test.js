const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
	checkProject,
	expectedDocuments,
} = require("./p3-readiness-contract-check");

function writeFixture(root, overrides = {}) {
	for (const doc of expectedDocuments) {
		const content = Object.hasOwn(overrides, doc.path)
			? overrides[doc.path]
			: completeContentFor(doc.p3Id, doc.path);
		if (content === null) {
			continue;
		}
		const fullPath = path.join(root, doc.path);
		fs.mkdirSync(path.dirname(fullPath), { recursive: true });
		fs.writeFileSync(fullPath, content);
	}
}

function completeContentFor(p3Id, docPath) {
	if (docPath === "docs/product/README.md") {
		return `# P3 Product Contracts\n\nDocs-first readiness contract index. No fake runtime integrations, no secrets, and no real environment values. Do not document real production URLs or provider configuration.\n\n${expectedDocuments
			.filter((doc) => doc.p3Id)
			.map((doc) => `- ${doc.p3Id}: \`${doc.path}\``)
			.join(
				"\n",
			)}\n\n## Verification Commands\n\n\`\`\`bash\ntest -f docs/plans/wave-d-p3-completion.md\ntest -f docs/product/README.md\ntest -f docs/product/analytics-taxonomy.md\ntest -f docs/product/advanced-analytics-dashboard-contract.md\ntest -f docs/product/billing-architecture.md\ntest -f docs/product/billing-mvp-readiness.md\ntest -f docs/product/mobile-api-readiness.md\ntest -f docs/product/mobile-app-mvp-contract.md\ntest -f docs/product/advanced-reporting-export-contract.md\ntest -f docs/product/content-operations-advanced-contract.md\ntest -f scripts/p3-readiness-contract-check.js\ntest -f scripts/p3-readiness-contract-check.test.js\nnode --test scripts/p3-readiness-contract-check.test.js\nnode scripts/p3-readiness-contract-check.js\n\`\`\`\n`;
	}

	if (docPath === "docs/plans/wave-d-p3-completion.md") {
		return `# Wave D P3 Completion Plan\n\n## Status\n\nDocs-first readiness contract master plan. These are readiness contracts only, not fake runtime integrations. Runtime work is deferred and must not claim deployed queues, billing, mobile clients, analytics warehouses, exports, provider webhooks, or content automation exists. No secrets and no real environment values.\n\n## P3 Mapping Table\n\n${expectedDocuments
			.filter((doc) => doc.p3Id)
			.map((doc) => `- ${doc.p3Id}: \`${doc.path}\``)
			.join(
				"\n",
			)}\n\n## Verification Commands\n\n\`\`\`bash\ntest -f docs/plans/wave-d-p3-completion.md\ntest -f docs/product/README.md\ntest -f docs/product/analytics-taxonomy.md\ntest -f docs/product/advanced-analytics-dashboard-contract.md\ntest -f docs/product/billing-architecture.md\ntest -f docs/product/billing-mvp-readiness.md\ntest -f docs/product/mobile-api-readiness.md\ntest -f docs/product/mobile-app-mvp-contract.md\ntest -f docs/product/advanced-reporting-export-contract.md\ntest -f docs/product/content-operations-advanced-contract.md\ntest -f scripts/p3-readiness-contract-check.js\ntest -f scripts/p3-readiness-contract-check.test.js\nnode --test scripts/p3-readiness-contract-check.test.js\nnode scripts/p3-readiness-contract-check.js\n\`\`\`\n`;
	}

	const itemText = {
		"P3-01":
			"## Status\n## Current Baseline\n## Event Naming Standard\n## Event Groups\n## Required Fields\n## Forbidden Fields\n## Standard Dimensions\n## Standard Metrics\n## Ownership\n## Data Quality Rules\n## Retention and Privacy\n## Backfill and Replay\n## Future Implementation Checklist\nAnalytics taxonomy events event_name actor_type privacy redaction docs-first readiness contract only. No fake runtime integration, no analytics warehouse, no event stream, no secrets, no real environment values.",
		"P3-02":
			"## Status\n## Current Baseline\n## Personas\n## KPIs\n## Filters\n## Permissions\n## Freshness\n## Empty States\n## Loading States\n## Error States\n## Drilldowns\n## Export and Redaction\n## Verification and Data-Quality Gates\nAdvanced analytics dashboard metrics filters permissions freshness drilldowns redaction docs-first readiness contract only. No fake runtime integration, no BI platform, no cached aggregate service, no secrets, no real environment values.",
		"P3-03":
			"## Status\n## Goals\n## Non-goals\n## Provider-agnostic integration boundary\n## Domain model\n## State machines\n## RBAC and permissions\n## Audit events\n## Webhook, idempotency, and reconciliation\n## Security and privacy\n## Risk assessment\n## Decisions required before runtime implementation\nBilling architecture subscription entitlement invoice webhook provider gateway docs-first readiness contract only. Future implementation is deferred. No fake runtime integration, no payment provider, no production credentials, no secrets, no real environment values.",
		"P3-04":
			"## Status\n## MVP principle\n## Sandbox-only MVP scope\n## Required product decisions\n## Required finance/legal decisions\n## Placeholder environment key names\n## Sanitized evidence shapes\n## Sandbox readiness checks\n## Explicit blockers before runtime implementation\n## Definition of ready for implementation planning\nBilling MVP sandbox checkout webhook idempotency entitlement readiness checklist docs-first readiness contract only. Future implementation is deferred. No fake runtime integration, no live billing, no production payments, no secrets, no real environment values.",
		"P3-05":
			"## Status\n## Scope\n## Supported Roles\n## Auth and Session Contract\n## API Conventions for Mobile\n## Endpoint Inventory\n## Readiness Risks\n## Contract Tests Needed\nMobile API auth session pagination filtering error shape rate limits offline endpoint inventory docs-first readiness contract only. Future implementation is deferred. No fake runtime integration, no new endpoints, no mobile infrastructure, no secrets, no real environment values.",
		"P3-06":
			"## Status\n## Product Goal\n## Primary Users\n## MVP Screens and Flows\n## Explicit Non-goals\n## Framework Decision Placeholder\n## Build and Release Prerequisites\n## Signing and Secrets Handling\n## Prototype Acceptance Criteria\n## Release-candidate Acceptance Criteria\nMobile app MVP screens flows student parent signing release candidate offline docs-first readiness contract only. Future implementation is deferred. No fake runtime integration, no scaffolded mobile app, no framework installed, no secrets, no real environment values.",
		"P3-07":
			"## Status\n## Purpose\n## Non-Goals\n## Report Matrix\n## Export Formats\n## Permission and Scope Rules\n## Redaction and Privacy Rules\n## Async Export Readiness\n## Retention\n## Data Freshness\n## Acceptance Criteria\nAdvanced reporting export CSV XLSX JSON PDF permission scope redaction retention freshness docs-first readiness contract only. Future implementation is deferred. No fake runtime integration, no queue, no storage integration, no secrets, no real environment values.",
		"P3-08":
			"## Status\n## Purpose\n## Non-Goals\n## Content Entities in Scope\n## Bulk Operations\n## Rollback Model\n## Audit Trail\n## Dry-Run Mode\n## Batch Safety\n## Approval Workflow\n## Emergency Unpublish\n## Future Implementation Checklist\n## Acceptance Criteria\nContent operations bulk rollback audit dry-run approval emergency unpublish lifecycle docs-first readiness contract only. Future implementation is deferred. No fake runtime integration, no runtime queue, no storage integration, no secrets, no real environment values.",
	};

	return `# ${p3Id} Fixture Contract\n\n${itemText[p3Id]}\n`;
}

function withTempFixture(fn) {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mathai-p3-contract-"));
	try {
		return fn(tempDir);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

test("fails when an expected Wave D document is missing", () => {
	withTempFixture((root) => {
		writeFixture(root, { "docs/product/mobile-api-readiness.md": null });

		const result = checkProject(root);

		assert.equal(result.ok, false);
		assert.match(
			result.issues.join("\n"),
			/Missing expected document: docs\/product\/mobile-api-readiness\.md/,
		);
	});
});

test("fails when a product contract is missing a required heading", () => {
	withTempFixture((root) => {
		writeFixture(root, {
			"docs/product/advanced-reporting-export-contract.md": completeContentFor(
				"P3-07",
				"docs/product/advanced-reporting-export-contract.md",
			).replace("## Report Matrix\n", ""),
		});

		const result = checkProject(root);

		assert.equal(result.ok, false);
		assert.match(
			result.issues.join("\n"),
			/P3-07.*missing required heading.*Report Matrix/,
		);
	});
});

test("fails when docs contain obvious secret values", () => {
	withTempFixture((root) => {
		writeFixture(root, {
			"docs/product/billing-mvp-readiness.md": `${completeContentFor(
				"P3-04",
				"docs/product/billing-mvp-readiness.md",
			)}\nBILLING_API_KEY=sk_live_${"51NxRealSecretValueForTest"}\n`,
		});

		const result = checkProject(root);

		assert.equal(result.ok, false);
		assert.match(result.issues.join("\n"), /secret-like value/i);
		assert.match(result.issues.join("\n"), /BILLING_API_KEY/);
	});
});

test("fails when README omits a P3 contract mapping", () => {
	withTempFixture((root) => {
		writeFixture(root, {
			"docs/product/README.md": completeContentFor(
				undefined,
				"docs/product/README.md",
			).replace(
				"- P3-08: `docs/product/content-operations-advanced-contract.md`\n",
				"",
			),
		});

		const result = checkProject(root);

		assert.equal(result.ok, false);
		assert.match(
			result.issues.join("\n"),
			/docs\/product\/README\.md does not map P3-08 to docs\/product\/content-operations-advanced-contract\.md/,
		);
	});
});

test("fails when README swaps paths between P3 contract mappings", () => {
	withTempFixture((root) => {
		writeFixture(root, {
			"docs/product/README.md": completeContentFor(
				undefined,
				"docs/product/README.md",
			)
				.replace(
					"- P3-05: `docs/product/mobile-api-readiness.md`",
					"- P3-05: `docs/product/mobile-app-mvp-contract.md`",
				)
				.replace(
					"- P3-06: `docs/product/mobile-app-mvp-contract.md`",
					"- P3-06: `docs/product/mobile-api-readiness.md`",
				),
		});

		const result = checkProject(root);

		assert.equal(result.ok, false);
		assert.match(
			result.issues.join("\n"),
			/docs\/product\/README\.md does not map P3-05 to docs\/product\/mobile-api-readiness\.md/,
		);
		assert.match(
			result.issues.join("\n"),
			/docs\/product\/README\.md does not map P3-06 to docs\/product\/mobile-app-mvp-contract\.md/,
		);
	});
});

test("fails when README omits docs-first and safety language", () => {
	withTempFixture((root) => {
		writeFixture(root, {
			"docs/product/README.md": `# P3 Product Contracts\n\n${expectedDocuments
				.filter((doc) => doc.p3Id)
				.map((doc) => `- ${doc.p3Id}: \`${doc.path}\``)
				.join("\n")}\n`,
		});

		const result = checkProject(root);

		assert.equal(result.ok, false);
		assert.match(result.issues.join("\n"), /README.*docs-first/i);
		assert.match(result.issues.join("\n"), /README.*no fake runtime/i);
		assert.match(result.issues.join("\n"), /README.*no secrets/i);
		assert.match(
			result.issues.join("\n"),
			/README.*no real environment values/i,
		);
	});
});

test("fails when analytics docs omit docs-first and no-fake-runtime language", () => {
	withTempFixture((root) => {
		writeFixture(root, {
			"docs/product/analytics-taxonomy.md": completeContentFor(
				"P3-01",
				"docs/product/analytics-taxonomy.md",
			)
				.replace(/docs-first readiness contract only\. /i, "")
				.replace(/No fake runtime integration, /i, ""),
			"docs/product/advanced-analytics-dashboard-contract.md":
				completeContentFor(
					"P3-02",
					"docs/product/advanced-analytics-dashboard-contract.md",
				)
					.replace(/docs-first readiness contract only\. /i, "")
					.replace(/No fake runtime integration, /i, ""),
		});

		const result = checkProject(root);

		assert.equal(result.ok, false);
		assert.match(result.issues.join("\n"), /P3-01.*docs-first/i);
		assert.match(result.issues.join("\n"), /P3-01.*non-fake runtime/i);
		assert.match(result.issues.join("\n"), /P3-02.*docs-first/i);
		assert.match(result.issues.join("\n"), /P3-02.*non-fake runtime/i);
	});
});

test("fails when Wave D docs contain real-looking environment URL assignments", () => {
	withTempFixture((root) => {
		writeFixture(root, {
			"docs/product/billing-mvp-readiness.md": `${completeContentFor(
				"P3-04",
				"docs/product/billing-mvp-readiness.md",
			)}\nBILLING_SUCCESS_URL=https://pay.real-domain.com/success\n`,
			"docs/product/mobile-api-readiness.md": `${completeContentFor(
				"P3-05",
				"docs/product/mobile-api-readiness.md",
			)}\nMOBILE_API_BASE_URL=https://api.real-domain.com\n`,
		});

		const result = checkProject(root);

		assert.equal(result.ok, false);
		assert.match(result.issues.join("\n"), /real environment value/i);
		assert.match(result.issues.join("\n"), /BILLING_SUCCESS_URL/);
		assert.match(result.issues.join("\n"), /MOBILE_API_BASE_URL/);
	});
});

test("fails when docs contain real-looking config URLs outside KEY=value assignments", () => {
	withTempFixture((root) => {
		writeFixture(root, {
			"docs/product/mobile-api-readiness.md": `${completeContentFor(
				"P3-05",
				"docs/product/mobile-api-readiness.md",
			)}

JSON example:

\`\`\`json
{ "baseUrl": "https://api.real-domain.com" }
\`\`\`

YAML example:

\`\`\`yaml
callbackUrl: https://pay.vendor.com/success
\`\`\`

Code example:

\`\`\`ts
const mobileApiBaseUrl = "https://api.real-domain.com";
\`\`\`
`,
		});

		const result = checkProject(root);

		assert.equal(result.ok, false);
		assert.match(result.issues.join("\n"), /real environment value/i);
		assert.match(result.issues.join("\n"), /baseUrl/);
		assert.match(result.issues.join("\n"), /callbackUrl/);
		assert.match(result.issues.join("\n"), /mobileApiBaseUrl/);
	});
});

test("passes placeholder and explicit non-production config URL examples", () => {
	withTempFixture((root) => {
		writeFixture(root, {
			"docs/product/mobile-api-readiness.md": `${completeContentFor(
				"P3-05",
				"docs/product/mobile-api-readiness.md",
			)}

Placeholder examples:

\`\`\`json
{ "baseUrl": "<mobile-api-base-url>" }
\`\`\`

Explicit non-production examples only:

\`\`\`yaml
callbackUrl: https://pay.sandbox.vendor.com/success
mobileApiBaseUrl: "https://api.example.com"
localApiBaseUrl: "http://localhost:3001"
testApiBaseUrl: "https://api.example.test"
\`\`\`
`,
		});

		const result = checkProject(root);

		assert.equal(result.ok, true, result.issues.join("\n"));
	});
});

test("passes placeholder-only environment key names", () => {
	withTempFixture((root) => {
		writeFixture(root, {
			"docs/product/billing-mvp-readiness.md": `${completeContentFor(
				"P3-04",
				"docs/product/billing-mvp-readiness.md",
			)}\n\nAllowed placeholder-only key names:\n- BILLING_SUCCESS_URL\n- BILLING_CANCEL_URL\n- BILLING_WEBHOOK_SECRET\n- MOBILE_API_BASE_URL\n\nExplicit non-production examples:\n- BILLING_SUCCESS_URL=<sandbox-success-url>\n- MOBILE_API_BASE_URL=https://api.example.test\n`,
		});

		const result = checkProject(root);

		assert.equal(result.ok, true, result.issues.join("\n"));
	});
});

test("fails when docs verification sections omit Wave D artifacts and checker commands", () => {
	withTempFixture((root) => {
		writeFixture(root, {
			"docs/plans/wave-d-p3-completion.md": completeContentFor(
				undefined,
				"docs/plans/wave-d-p3-completion.md",
			).replace("node scripts/p3-readiness-contract-check.js\n", ""),
		});

		const result = checkProject(root);

		assert.equal(result.ok, false);
		assert.match(
			result.issues.join("\n"),
			/docs\/plans\/wave-d-p3-completion\.md verification section does not reference node scripts\/p3-readiness-contract-check\.js/,
		);
	});
});

test("passes a complete docs-first fixture", () => {
	withTempFixture((root) => {
		writeFixture(root);

		const result = checkProject(root);

		assert.equal(result.ok, true, result.issues.join("\n"));
		assert.deepEqual(result.issues, []);
	});
});
