const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_OUTPUT_DIR = path.join("test-screenshots", "business-audit");

const sourceContracts = [
	{
		name: "staff-admin-nav-uses-allowlist",
		file: "packages/frontend/src/app/(admin)/layout.tsx",
		patterns: [
			/const staffAllowedAdminHrefs = new Set/,
			/staffAllowedAdminHrefs\.has\(item\.href\)/,
		],
	},
	{
		name: "staff-admin-nav-explicitly-denies-admin-only-routes",
		file: "packages/frontend/src/app/(admin)/layout.tsx",
		patterns: [
			/const staffDeniedAdminHrefs = new Set/,
			/["']\/admin\/settings["']/,
			/["']\/admin\/tutors["']/,
			/["']\/admin\/proposals["']/,
			/["']\/admin\/ai-logs["']/,
			/!staffDeniedAdminHrefs\.has\(item\.href\)/,
		],
	},
	{
		name: "staff-user-status-actions-remain-read-only",
		file: "packages/frontend/src/app/(admin)/admin/users/page.tsx",
		patterns: [/canManageUserStatus\(user\?\.role\)/, /Chỉ xem/],
	},
	{
		name: "staff-teacher-lifecycle-actions-are-hidden",
		file: "packages/frontend/src/app/(admin)/admin/teachers/page.tsx",
		patterns: [
			/canManageTeacherLifecycle/,
			/user\?\.role === ["']admin["']/,
			/canManageTeacherLifecycle && \(/,
		],
	},
	{
		name: "teacher-settings-profile-is-read-only-without-fake-save",
		file: "packages/frontend/src/app/(teacher)/teacher/settings/page.tsx",
		patterns: [
			/readOnlyProfileFields/,
			/readOnly/,
			/Chưa hỗ trợ chỉnh sửa hồ sơ/,
		],
		forbiddenPatterns: [/handleSave/, /setSaved\(true\)/, /Đã lưu thành công/],
	},
	{
		name: "backend-staff-restricted-routes-cover-hidden-staff-nav-actions",
		file: "packages/backend/src/routes/admin.routes.ts",
		patterns: [
			/function requireStaffRestricted/,
			/router\.post\(\s*["']\/teachers["'],\s*requireStaffRestricted/,
			/router\.put\(\s*["']\/teachers\/:id\/toggle["'],\s*requireAdminOnly/,
			/router\.put\(\s*["']\/users\/:id\/toggle["'],\s*requireAdminOnly/,
			/["']\/ai-tutors["'][\s\S]*requireStaffRestricted/,
			/["']\/proposals\/:id\/approve["'][\s\S]*requireAdminOnly/,
		],
	},
];

function readSource(rootDir, relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function evaluateContract(rootDir, contract) {
	const source = readSource(rootDir, contract.file);
	const missing = contract.patterns
		.filter((pattern) => !pattern.test(source))
		.map((pattern) => pattern.toString());
	const forbidden = (contract.forbiddenPatterns || [])
		.filter((pattern) => pattern.test(source))
		.map((pattern) => pattern.toString());
	return {
		name: contract.name,
		file: contract.file,
		status:
			missing.length === 0 && forbidden.length === 0 ? "passed" : "failed",
		missing_patterns: missing,
		forbidden_patterns_present: forbidden,
	};
}

function buildTeacherStaffUiAuditEvidence({ rootDir = process.cwd() } = {}) {
	const contracts = sourceContracts.map((contract) =>
		evaluateContract(rootDir, contract),
	);
	const failed = contracts.filter((contract) => contract.status !== "passed");

	return {
		gate: "teacher-staff-ui-source-contracts",
		status: failed.length === 0 ? "passed" : "failed",
		generated_at: new Date().toISOString(),
		evidence_kind: "deterministic-source-level-audit",
		source_contracts: contracts,
		browser_snapshot_evidence: {
			status: "unavailable",
			reason:
				"No Puppeteer/Playwright dependency is installed or required for this gate; screenshots are not captured or claimed.",
			screenshots_captured: false,
			artifacts: [],
		},
		sanitization: {
			contains_secrets: false,
			redaction_policy:
				"Manifest contains only repo-relative source file paths, contract names, and regex summaries; no tokens, cookies, screenshots, user data, or environment values.",
		},
	};
}

function validateTeacherStaffUiAuditEvidence(evidence) {
	const errors = [];
	if (!evidence || typeof evidence !== "object") {
		return ["evidence manifest must be an object"];
	}
	if (evidence.gate !== "teacher-staff-ui-source-contracts") {
		errors.push("gate must be teacher-staff-ui-source-contracts");
	}
	if (
		!Array.isArray(evidence.source_contracts) ||
		evidence.source_contracts.length === 0
	) {
		errors.push("source_contracts must be a non-empty array");
	} else {
		for (const contract of evidence.source_contracts) {
			if (contract.status !== "passed") {
				errors.push(`source contract ${contract.name || "unknown"} must pass`);
			}
			if (!contract.file || path.isAbsolute(contract.file)) {
				errors.push(
					`source contract ${contract.name || "unknown"} must use repo-relative file path`,
				);
			}
		}
	}
	if (evidence.browser_snapshot_evidence?.status !== "unavailable") {
		errors.push(
			"browser snapshot evidence must be unavailable for dependency-free gate",
		);
	}
	if (evidence.browser_snapshot_evidence?.screenshots_captured !== false) {
		errors.push("screenshots_captured must be false");
	}
	if ((evidence.browser_snapshot_evidence?.artifacts || []).length !== 0) {
		errors.push("browser snapshot artifacts must be empty when unavailable");
	}
	if (evidence.sanitization?.contains_secrets !== false) {
		errors.push("evidence manifest must not contain secrets");
	}
	return errors;
}

function writeEvidence(rootDir, outputDir = DEFAULT_OUTPUT_DIR) {
	const evidence = buildTeacherStaffUiAuditEvidence({ rootDir });
	const errors = validateTeacherStaffUiAuditEvidence(evidence);
	if (errors.length > 0) {
		evidence.status = "failed";
		evidence.validation_errors = errors;
	}
	const absoluteOutputDir = path.join(rootDir, outputDir);
	fs.mkdirSync(absoluteOutputDir, { recursive: true });
	const outputPath = path.join(
		absoluteOutputDir,
		"teacher-staff-ui-audit-evidence.json",
	);
	fs.writeFileSync(outputPath, JSON.stringify(evidence, null, 2));
	return { evidence, errors, outputPath };
}

function main() {
	const rootDir = process.cwd();
	const { evidence, errors, outputPath } = writeEvidence(rootDir);
	const relativeOutput = path.relative(rootDir, outputPath).replace(/\\/g, "/");
	console.log(`TEACHER_STAFF_UI_AUDIT_EVIDENCE=${relativeOutput}`);
	console.log(
		`SOURCE_CONTRACTS=${evidence.source_contracts.filter((contract) => contract.status === "passed").length}/${evidence.source_contracts.length}`,
	);
	console.log(
		"BROWSER_SNAPSHOT_EVIDENCE=unavailable:no-puppeteer-playwright-dependency",
	);
	if (errors.length > 0 || evidence.status !== "passed") {
		for (const error of errors) console.error(`ERROR: ${error}`);
		for (const contract of evidence.source_contracts.filter(
			(row) => row.status !== "passed",
		)) {
			console.error(
				`FAILED_CONTRACT: ${contract.name} missing=${contract.missing_patterns.join(",")} forbidden=${contract.forbidden_patterns_present.join(",")}`,
			);
		}
		process.exitCode = 1;
	}
}

if (require.main === module) {
	main();
}

module.exports = {
	buildTeacherStaffUiAuditEvidence,
	validateTeacherStaffUiAuditEvidence,
	writeEvidence,
};
