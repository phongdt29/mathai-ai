#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const expectedDocuments = [
	{
		path: "docs/plans/wave-d-p3-completion.md",
		label: "Wave D P3 master plan",
	},
	{ path: "docs/product/README.md", label: "P3 product contract index" },
	{
		p3Id: "P3-01",
		path: "docs/product/analytics-taxonomy.md",
		label: "Analytics taxonomy",
		headings: [
			"Status",
			"Current Baseline",
			"Event Naming Standard",
			"Event Groups",
			"Required Fields",
			"Forbidden Fields",
			"Standard Dimensions",
			"Standard Metrics",
			"Ownership",
			"Data Quality Rules",
			"Retention and Privacy",
			"Backfill and Replay",
			"Future Implementation Checklist",
		],
		keywords: [
			"event_name",
			"actor_type",
			"privacy",
			"redaction",
			"analytics",
			"taxonomy",
		],
		requiresDocsFirstRuntimeGuard: true,
	},
	{
		p3Id: "P3-02",
		path: "docs/product/advanced-analytics-dashboard-contract.md",
		label: "Advanced analytics dashboard",
		headings: [
			"Status",
			"Current Baseline",
			"Personas",
			"KPIs",
			"Filters",
			"Permissions",
			"Freshness",
			"Empty States",
			"Loading States",
			"Error States",
			"Drilldowns",
			"Export and Redaction",
			"Verification and Data-Quality Gates",
		],
		keywords: [
			"dashboard",
			"metrics",
			"filters",
			"permissions",
			"freshness",
			"redaction",
		],
		requiresDocsFirstRuntimeGuard: true,
	},
	{
		p3Id: "P3-03",
		path: "docs/product/billing-architecture.md",
		label: "Billing architecture",
		headings: [
			"Status",
			"Goals",
			"Non-goals",
			"Provider-agnostic integration boundary",
			"Domain model",
			"State machines",
			"RBAC and permissions",
			"Audit events",
			"Webhook, idempotency, and reconciliation",
			"Security and privacy",
			"Risk assessment",
			"Decisions required before runtime implementation",
		],
		keywords: [
			"billing",
			"subscription",
			"entitlement",
			"webhook",
			"provider",
			"audit",
		],
		infrastructureDependent: true,
	},
	{
		p3Id: "P3-04",
		path: "docs/product/billing-mvp-readiness.md",
		label: "Billing MVP readiness",
		headings: [
			"Status",
			"MVP principle",
			"Sandbox-only MVP scope",
			"Required product decisions",
			"Required finance/legal decisions",
			"Placeholder environment key names",
			"Sanitized evidence shapes",
			"Sandbox readiness checks",
			"Explicit blockers before runtime implementation",
			"Definition of ready for implementation planning",
		],
		keywords: [
			"sandbox",
			"checkout",
			"webhook",
			"idempotency",
			"entitlement",
			"readiness",
		],
		infrastructureDependent: true,
	},
	{
		p3Id: "P3-05",
		path: "docs/product/mobile-api-readiness.md",
		label: "Mobile API readiness",
		headings: [
			"Status",
			"Scope",
			"Supported Roles",
			"Auth and Session Contract",
			"API Conventions for Mobile",
			"Endpoint Inventory",
			"Readiness Risks",
			"Contract Tests Needed",
		],
		keywords: ["auth", "session", "pagination", "error", "rate", "offline"],
		infrastructureDependent: true,
	},
	{
		p3Id: "P3-06",
		path: "docs/product/mobile-app-mvp-contract.md",
		label: "Mobile app MVP contract",
		headings: [
			"Status",
			"Product Goal",
			"Primary Users",
			"MVP Screens and Flows",
			"Explicit Non-goals",
			"Framework Decision Placeholder",
			"Build and Release Prerequisites",
			"Signing and Secrets Handling",
			"Prototype Acceptance Criteria",
			"Release-candidate Acceptance Criteria",
		],
		keywords: ["student", "parent", "screens", "flows", "signing", "release"],
		infrastructureDependent: true,
	},
	{
		p3Id: "P3-07",
		path: "docs/product/advanced-reporting-export-contract.md",
		label: "Advanced reporting export",
		headings: [
			"Status",
			"Purpose",
			"Non-Goals",
			"Report Matrix",
			"Export Formats",
			"Permission and Scope Rules",
			"Redaction and Privacy Rules",
			"Async Export Readiness",
			"Retention",
			"Data Freshness",
			"Acceptance Criteria",
		],
		keywords: ["export", "CSV", "XLSX", "JSON", "permission", "retention"],
		infrastructureDependent: true,
	},
	{
		p3Id: "P3-08",
		path: "docs/product/content-operations-advanced-contract.md",
		label: "Content operations advanced",
		headings: [
			"Status",
			"Purpose",
			"Non-Goals",
			"Content Entities in Scope",
			"Bulk Operations",
			"Rollback Model",
			"Audit Trail",
			"Dry-Run Mode",
			"Batch Safety",
			"Approval Workflow",
			"Emergency Unpublish",
			"Future Implementation Checklist",
			"Acceptance Criteria",
		],
		keywords: ["bulk", "rollback", "audit", "dry-run", "approval", "emergency"],
		infrastructureDependent: true,
	},
];

const contractDocuments = expectedDocuments.filter((doc) => doc.p3Id);
const contractPaths = contractDocuments.map((doc) => doc.path);
const p3Ids = contractDocuments.map((doc) => doc.p3Id);
const productIndexPath = "docs/product/README.md";
const verificationDocPaths = [
	"docs/plans/wave-d-p3-completion.md",
	productIndexPath,
	...contractPaths,
	"scripts/p3-readiness-contract-check.js",
	"scripts/p3-readiness-contract-check.test.js",
];
const checkerCommands = [
	"node --test scripts/p3-readiness-contract-check.test.js",
	"node scripts/p3-readiness-contract-check.js",
];

const docsFirstLanguageGroups = [
	{
		label: "docs-first/readiness contract",
		patterns: [
			/docs-first/i,
			/readiness contract/i,
			/product contract/i,
			/readiness checklist/i,
			/proposed (?:documentation|contract)/i,
		],
	},
	{
		label: "non-fake runtime boundary",
		patterns: [
			/no fake runtime integration/i,
			/does (?:\*\*)?not(?:\*\*)? (?:add|create|implement|scaffold|assume)/i,
			/does not (?:select|recommend|configure)/i,
			/no runtime|no live|no new endpoints|no scaffolded|no queue|no storage integration/i,
			/Non-Goals?|Non-goals/i,
		],
	},
	{
		label: "deferred/future runtime status",
		patterns: [
			/deferred/i,
			/future implementation/i,
			/future scope/i,
			/future (?:billing|MathAI|advanced|async-ready|background|mobile)/i,
			/before runtime implementation/i,
			/before implementation begins/i,
		],
	},
	{
		label: "no secrets or real env values",
		patterns: [
			/no secrets/i,
			/no real environment values/i,
			/no production credentials/i,
			/Do not place real values/i,
			/Do not document real values/i,
			/must never be committed/i,
			/secrets?.*(?:docs|logs|source|repository|committed files)/i,
		],
	},
];

const secretPatterns = [
	{
		name: "live provider key",
		pattern:
			/\b(?:sk|pk|rk|whsec|stripe|polar)_(?:live|test)_[A-Za-z0-9]{12,}\b/i,
	},
	{
		name: "mongodb URI with embedded credentials",
		pattern: /mongodb(?:\+srv)?:\/\/[^\s`'"<>:]+:[^\s`'"<>@]+@[^\s`'"<>]+/i,
	},
	{
		name: "JWT-like token value",
		pattern:
			/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/,
	},
	{
		name: "secret/API key assignment",
		pattern:
			/^\s*(?:[A-Z0-9_]*(?:SECRET|TOKEN|PRIVATE_KEY|API_KEY|WEBHOOK_SECRET|JWT)[A-Z0-9_]*)\s*=\s*(?!<[^>]+>\s*$)(?!placeholder(?:-[A-Za-z0-9_]+)*\s*$)(?!redacted\s*$)(?!sha256:redacted\s*$)(?!sandbox\s*$)(?!test\s*$)(?!false\s*$)(?!true\s*$)[^\s#`'"]{12,}\s*$/im,
	},
	{
		name: "billing API key assignment",
		pattern:
			/^\s*BILLING_[A-Z0-9_]*(?:API_KEY|SECRET_KEY|WEBHOOK_SECRET)\s*=\s*(?!<[^>]+>\s*$)(?!placeholder(?:-[A-Za-z0-9_]+)*\s*$)(?!redacted\s*$)[^\s#`'"]{8,}\s*$/im,
	},
];

function readExpectedFiles(rootDir, issues) {
	const files = new Map();
	for (const doc of expectedDocuments) {
		const fullPath = path.join(rootDir, doc.path);
		if (!fs.existsSync(fullPath)) {
			issues.push(`Missing expected document: ${doc.path}`);
			continue;
		}
		if (!fs.statSync(fullPath).isFile()) {
			issues.push(`Expected document path is not a file: ${doc.path}`);
			continue;
		}
		files.set(doc.path, fs.readFileSync(fullPath, "utf8"));
	}
	return files;
}

function hasHeading(content, heading) {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^#{2,6}\\s+${escaped}\\s*$`, "im").test(content);
}

function includesCaseInsensitive(content, needle) {
	return content.toLowerCase().includes(needle.toLowerCase());
}

function validateMasterReferences(files, issues) {
	const masterPath = "docs/plans/wave-d-p3-completion.md";
	const master = files.get(masterPath);
	if (!master) {
		return;
	}

	for (const p3Id of p3Ids) {
		if (!master.includes(p3Id)) {
			issues.push(`${masterPath} does not reference ${p3Id}`);
		}
	}

	for (const contractPath of contractPaths) {
		if (!master.includes(contractPath)) {
			issues.push(
				`${masterPath} does not reference contract path ${contractPath}`,
			);
		}
	}
}

function validateProductIndex(files, issues) {
	const readme = files.get(productIndexPath);
	if (!readme) {
		return;
	}

	for (const doc of contractDocuments) {
		if (!hasProductIndexMapping(readme, doc)) {
			issues.push(
				`${productIndexPath} does not map ${doc.p3Id} to ${doc.path}`,
			);
		}
	}

	const requiredLanguage = [
		{ label: "docs-first", pattern: /docs-first/i },
		{ label: "no fake runtime", pattern: /no fake runtime/i },
		{ label: "no secrets", pattern: /no secrets/i },
		{
			label: "no real environment values",
			pattern: /no real environment values/i,
		},
	];
	for (const requirement of requiredLanguage) {
		if (!requirement.pattern.test(readme)) {
			issues.push(
				`${productIndexPath} README missing required ${requirement.label} language`,
			);
		}
	}
}

function hasProductIndexMapping(readme, doc) {
	return readme
		.split(/\r?\n/)
		.some((line) => line.includes(doc.p3Id) && line.includes(doc.path));
}

function validateVerificationSections(files, issues) {
	for (const filePath of [
		"docs/plans/wave-d-p3-completion.md",
		productIndexPath,
	]) {
		const content = files.get(filePath);
		if (!content) {
			continue;
		}
		for (const expectedPath of verificationDocPaths) {
			if (!content.includes(expectedPath)) {
				issues.push(
					`${filePath} verification section does not reference ${expectedPath}`,
				);
			}
		}
		for (const command of checkerCommands) {
			if (!content.includes(command)) {
				issues.push(
					`${filePath} verification section does not reference ${command}`,
				);
			}
		}
	}
}

function validateProductContracts(files, issues) {
	for (const doc of contractDocuments) {
		const content = files.get(doc.path);
		if (!content) {
			continue;
		}

		if (!content.includes(doc.p3Id)) {
			issues.push(`${doc.p3Id} ${doc.path} does not include its P3 ID`);
		}

		for (const heading of doc.headings) {
			if (!hasHeading(content, heading)) {
				issues.push(
					`${doc.p3Id} ${doc.path} missing required heading: ${heading}`,
				);
			}
		}

		for (const keyword of doc.keywords) {
			if (!includesCaseInsensitive(content, keyword)) {
				issues.push(
					`${doc.p3Id} ${doc.path} missing required keyword: ${keyword}`,
				);
			}
		}

		if (doc.infrastructureDependent || doc.requiresDocsFirstRuntimeGuard) {
			validateDocsFirstRuntimeLanguage(doc, content, issues);
		}
	}
}

function validateDocsFirstRuntimeLanguage(doc, content, issues) {
	const requiredGroups = doc.requiresDocsFirstRuntimeGuard
		? docsFirstLanguageGroups.filter((group) =>
				["docs-first/readiness contract", "non-fake runtime boundary"].includes(
					group.label,
				),
			)
		: docsFirstLanguageGroups;
	for (const group of requiredGroups) {
		if (!group.patterns.some((pattern) => pattern.test(content))) {
			issues.push(
				`${doc.p3Id} ${doc.path} missing docs-first/non-fake runtime language for ${group.label}`,
			);
		}
	}
}

function validateSecretHygiene(files, issues) {
	for (const [filePath, content] of files) {
		for (const { name, pattern } of secretPatterns) {
			const match = content.match(pattern);
			if (match) {
				issues.push(
					`${filePath} contains obvious secret-like value (${name}): ${match[0].trim()}`,
				);
			}
		}
	}
}

function isSafeExampleValue(value, context) {
	if (/^<[^>]+>$/.test(value)) {
		return true;
	}
	if (/^<[^>\s]+$/.test(value)) {
		return true;
	}
	value = value.replace(/[)>}\],.;:]+$/g, "");
	if (
		/^(?:placeholder(?:-[A-Za-z0-9_]+)*|redacted|sha256:redacted|sandbox|test|false|true)$/i.test(
			value,
		)
	) {
		return true;
	}
	if (
		/^https?:\/\/(?:[^/]+\.)?(?:example\.com|example\.test|localhost)(?::\d+)?(?:\/\S*)?$/i.test(
			value,
		)
	) {
		return /(?:example|non-production|sandbox|placeholder)/i.test(context);
	}
	if (/^https?:\/\/[^\s/]*sandbox[^\s]*(?:\/\S*)?$/i.test(value)) {
		return /(?:non-production|sandbox|placeholder)/i.test(context);
	}
	return false;
}

function validateRealEnvironmentValues(files, issues) {
	const patterns = [
		{
			label: "assignment",
			pattern:
				/^\s*(?:[-*]\s*)?`?([A-Z][A-Z0-9_]{2,})`?\s*=\s*`?([^`\s#]+)`?\s*$/g,
		},
		{
			label: "config URL",
			pattern:
				/["'`]?([A-Za-z][A-Za-z0-9_]*(?:BaseUrl|Url|URL|Uri|URI|Endpoint|Host))["'`]?\s*[:=]\s*["'`]?([^"'`\s,;}>]+)["'`]?/g,
		},
	];

	for (const [filePath, content] of files) {
		const lines = content.split(/\r?\n/);
		for (let index = 0; index < lines.length; index += 1) {
			const context = lines
				.slice(Math.max(0, index - 2), Math.min(lines.length, index + 3))
				.join("\n");
			for (const { label, pattern } of patterns) {
				pattern.lastIndex = 0;
				for (const match of lines[index].matchAll(pattern)) {
					const [, key, value] = match;
					if (isSafeExampleValue(value, context)) {
						continue;
					}
					issues.push(
						`${filePath} contains real environment value ${label}: ${key}=${value}`,
					);
				}
			}
		}
	}
}

function checkProject(rootDir = process.cwd()) {
	const issues = [];
	const files = readExpectedFiles(rootDir, issues);
	validateMasterReferences(files, issues);
	validateProductIndex(files, issues);
	validateVerificationSections(files, issues);
	validateProductContracts(files, issues);
	validateSecretHygiene(files, issues);
	validateRealEnvironmentValues(files, issues);
	return { ok: issues.length === 0, issues };
}

function main() {
	const rootDir = process.argv[2]
		? path.resolve(process.argv[2])
		: process.cwd();
	const result = checkProject(rootDir);
	if (result.ok) {
		console.log("P3 readiness contract check passed.");
		console.log(
			`Validated ${expectedDocuments.length} expected Wave D documents.`,
		);
		return;
	}

	console.error("P3 readiness contract check failed:");
	for (const issue of result.issues) {
		console.error(`- ${issue}`);
	}
	process.exitCode = 1;
}

if (require.main === module) {
	main();
}

module.exports = {
	checkProject,
	expectedDocuments,
	secretPatterns,
};
