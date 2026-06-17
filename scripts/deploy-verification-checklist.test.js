const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");
const evidenceFixtureDir = path.join(
	rootDir,
	"artifacts/deployment/deploy-verification-test-fixtures",
);

function writeEvidenceFixture(fileName, manifest) {
	fs.mkdirSync(evidenceFixtureDir, { recursive: true });
	const absolutePath = path.join(evidenceFixtureDir, fileName);
	fs.writeFileSync(absolutePath, JSON.stringify(manifest, null, 2));
	return path.relative(rootDir, absolutePath);
}

function buildValidMonitoringContract(overrides = {}) {
	return {
		critical_logs: [
			"backend application errors with request id and route family",
			"authentication and password-reset failures without user identifiers",
			"database connectivity and migration/seed failures",
			"email delivery provider failures without recipient addresses",
			"AI provider fallback or safety-guard events without prompt payloads",
		],
		critical_metrics: [
			"/health/ready status and latency",
			"HTTP 5xx rate by route family",
			"password-reset request and delivery failure rate",
			"email provider failure rate",
			"AI provider error/fallback rate",
			"MongoDB connection state",
		],
		critical_alerts: [
			"readiness degraded",
			"HTTP 5xx error budget burn",
			"password-reset delivery failure spike",
			"email provider failure spike",
			"AI provider fallback spike",
			"MongoDB disconnected",
		],
		thresholds: [
			{
				name: "readiness_degraded",
				metric: "/health/ready status",
				operator: ">=",
				value: "2 consecutive degraded checks over 2 minutes",
				severity: "critical",
			},
			{
				name: "http_5xx_rate",
				metric: "HTTP 5xx rate",
				operator: ">=",
				value: "5% over 5 minutes or 20 responses over 5 minutes",
				severity: "critical",
			},
			{
				name: "password_reset_delivery_failures",
				metric: "password reset delivery failures",
				operator: ">=",
				value: "3 failed deliveries over 10 minutes",
				severity: "high",
			},
			{
				name: "email_provider_failures",
				metric: "email provider failures",
				operator: ">=",
				value: "5% failures over 10 minutes",
				severity: "high",
			},
			{
				name: "ai_provider_fallback_rate",
				metric: "AI provider fallback or error rate",
				operator: ">=",
				value: "10% fallback/error rate over 10 minutes",
				severity: "medium",
			},
		],
		sample_alert_test_record: {
			alert_name: "readiness_degraded_test",
			triggered_at: "2026-05-12T00:00:00.000Z",
			destination: "operations-on-call route name only",
			delivered: true,
			acknowledged_by_role: "Operations owner",
			evidence:
				"Sanitized ticket attachment path; webhook URL and private channel id redacted.",
		},
		redaction_rules: [
			"Do not include webhook URLs, auth credentials, provider keys, JWTs, MongoDB addresses, or connection details.",
			"Do not include user emails, reset secrets, prompt payloads, student content, or raw provider responses.",
			"Use route families, role names, ticket ids, and sanitized artifact paths instead of identifiers.",
		],
		...overrides,
	};
}

test.after(() => {
	fs.rmSync(evidenceFixtureDir, { recursive: true, force: true });
});

const {
	buildBackupRestoreEvidence,
	buildChecklist,
	buildEnvSnapshot,
	buildFeatureFlagSnapshot,
	buildOperationalReadinessEvidence,
	buildReleaseGate,
	buildStudentSmokeEvidence,
	maskValue,
	parseArgs,
} = require("./deploy-verification-checklist");

function buildValidBackupRestoreEvidenceManifest(overrides = {}) {
	return {
		generated_at: "2026-05-12T00:00:00.000Z",
		environment: "production-like-staging",
		drill_id: "backup-restore-drill-2026-05-12",
		status: "passed",
		rto: {
			target_minutes: 60,
			observed_minutes: 42,
			evidence: "Restore rehearsal completed inside target window.",
		},
		rpo: {
			target_minutes: 15,
			observed_minutes: 5,
			evidence: "Backup timestamp and checkpoint timestamp compared in ticket.",
		},
		backup_artifact: {
			archive_path: "immutable://backup-vault/mathai/archive-redacted.gz",
			sha256:
				"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			size_bytes: 4096,
			created_at: "2026-05-12T00:00:00.000Z",
			storage_location: "immutable backup vault path recorded in ticket",
			retention_until: "2026-08-12T00:00:00.000Z",
			metadata_redacted: true,
		},
		restore_to_staging: {
			target_environment: "isolated-staging-restore",
			dry_run_log_path: "artifacts/deployment/restore-dry-run-redacted.log",
			validation_log_path:
				"artifacts/deployment/restore-validation-redacted.log",
			status: "passed",
		},
		validations: {
			checksum_verified: true,
			collection_counts: [
				{
					collection: "users",
					source_count: 25,
					restored_count: 25,
					match: true,
				},
			],
			critical_workflows: [
				{
					name: "auth-readiness-smoke",
					status: "passed",
					evidence: "Sanitized staging smoke result attached.",
				},
			],
		},
		approvals: {
			data_owner: "pending-data-owner-signoff",
			deployment_owner: "pending-deployment-owner-signoff",
			release_manager: "pending-release-manager-signoff",
			approved_for_production_restore: false,
		},
		...overrides,
	};
}

test("deployment verification checklist defaults to dry-run local checks", () => {
	const options = parseArgs([]);
	const checklist = buildChecklist(options, {
		NODE_ENV: "production",
		MONGODB_URI: "mongodb://user:password@example.invalid/mathai",
		JWT_SECRET: "super-secret",
		FEATURE_DEPLOYMENT_CHECKPOINTS: "true",
	});

	assert.equal(options.dryRun, true);
	assert.equal(checklist.dryRun, true);
	assert.match(checklist.phase, /Phase 6/);
	assert.equal(checklist.backupPlan.available, true);
	assert.ok(checklist.commands.requiredVerification.includes("npm run verify"));
	assert.ok(
		checklist.commands.requiredVerification.includes(
			"npm run test:backup-plan",
		),
	);
	assert.ok(
		checklist.requiredFiles.some(
			(entry) =>
				entry.relativePath === ".github/workflows/verify.yml" && entry.exists,
		),
	);
	assert.ok(
		checklist.requiredFiles.some(
			(entry) => entry.relativePath === "deploy/.env.example" && entry.exists,
		),
	);
	assert.ok(
		checklist.requiredFiles.some(
			(entry) => entry.relativePath === "deploy/package.json" && entry.exists,
		),
	);
	assert.ok(
		checklist.requiredFiles.some(
			(entry) => entry.relativePath === "deploy/README.md" && entry.exists,
		),
	);
	assert.ok(checklist.releaseGate);
	assert.equal(checklist.releaseGate.signOffRoles.length, 4);
	assert.equal(checklist.studentSmokeEvidence.status, "evidence_required");
	assert.equal(
		checklist.studentSmokeEvidence.evidencePath,
		"artifacts/deployment/student-smoke-evidence.json",
	);
	assert.ok(
		checklist.studentSmokeEvidence.requiredArtifacts.some(
			(artifact) => artifact.key === "student_assignment_detail",
		),
	);
	assert.ok(
		checklist.releaseGate.blockingConditions.some(
			(condition) =>
				condition.key === "student_smoke_evidence" && !condition.pass,
		),
	);
	assert.equal(checklist.operationalEvidence.status, "evidence_required");
	assert.equal(checklist.backupRestoreEvidence.status, "evidence_required");
	assert.equal(
		checklist.backupRestoreEvidence.evidencePath,
		"artifacts/deployment/backup-restore-evidence.json",
	);
	assert.equal(
		checklist.operationalEvidence.evidencePath,
		"artifacts/deployment/operational-readiness-evidence.json",
	);
	assert.ok(
		checklist.releaseGate.blockingConditions.some(
			(condition) =>
				condition.key === "operational_readiness_evidence" && !condition.pass,
		),
	);
	assert.ok(
		checklist.releaseGate.blockingConditions.some(
			(condition) =>
				condition.key === "backup_restore_evidence" && !condition.pass,
		),
	);
	assert.ok(
		checklist.requiredFiles.some(
			(entry) =>
				entry.relativePath === "packages/frontend/env-config.cjs" &&
				entry.exists,
		),
	);
	assert.doesNotMatch(
		JSON.stringify(checklist),
		/password@example|super-secret/,
	);
});

test("environment snapshot redacts secret-like values and only reports presence", () => {
	const snapshot = buildEnvSnapshot({
		NODE_ENV: "production",
		BACKEND_PORT: "3001",
		CORS_ORIGIN: "https://app.example.invalid",
		APP_BASE_URL: "https://app.example.invalid",
		MONGODB_URI: "mongodb://secret-host",
		JWT_SECRET: "jwt-secret",
		EMAIL_PROVIDER: "http",
		EMAIL_API_URL: "https://email.example.invalid/send",
		EMAIL_API_KEY: "email-secret",
	});

	const byKey = Object.fromEntries(snapshot.map((entry) => [entry.key, entry]));
	assert.equal(byKey.NODE_ENV.value, "<set>");
	assert.equal(byKey.BACKEND_PORT.value, "<set>");
	assert.equal(byKey.CORS_ORIGIN.value, "<redacted>");
	assert.equal(byKey.APP_BASE_URL.value, "<redacted>");
	assert.equal(byKey.MONGODB_URI.value, "<redacted>");
	assert.equal(byKey.JWT_SECRET.value, "<redacted>");
	assert.equal(byKey.JWT_REFRESH_SECRET.value, "<not-set>");
	assert.equal(byKey.EMAIL_PROVIDER.value, "<set>");
	assert.equal(byKey.EMAIL_API_URL.value, "<redacted>");
	assert.equal(byKey.EMAIL_API_KEY.value, "<redacted>");
});

test("blank or missing BACKEND_API_URL does not block the required production environment gate", () => {
	const requiredProductionEnv = {
		NODE_ENV: "production",
		BACKEND_PORT: "3001",
		CORS_ORIGIN: "https://app.example.invalid",
		APP_BASE_URL: "https://app.example.invalid",
		MONGODB_URI: "mongodb://user:password@example.invalid/mathai",
		DB_NAME: "mathai",
		JWT_SECRET: "jwt-secret",
		JWT_REFRESH_SECRET: "refresh-secret",
		JWT_EXPIRES_IN: "15m",
		EMAIL_PROVIDER: "http",
		EMAIL_FROM: "MathAI <noreply@example.invalid>",
		EMAIL_API_URL: "https://email.example.invalid/send",
		EMAIL_API_KEY: "email-secret",
		OPENAI_API_KEY: "openai-secret",
		OPENAI_BASE_URL: "https://api.openai.example.invalid/v1",
		OPENAI_MODEL: "gpt-test",
		ENABLE_DEMO_AUTH_TOKENS: "false",
		NEXT_PUBLIC_API_URL: "https://api.example.invalid",
		NEXT_PUBLIC_ENABLE_DEMO_LOGIN: "false",
	};

	for (const backendApiUrl of [undefined, ""]) {
		const env = { ...requiredProductionEnv };
		if (backendApiUrl !== undefined) {
			env.BACKEND_API_URL = backendApiUrl;
		}

		const gate = buildReleaseGate({
			git: { branch: "main", expectedBranch: "main", cleanWorkingTree: true },
			requiredFiles: [
				{ relativePath: ".github/workflows/verify.yml", exists: true },
			],
			envSnapshot: buildEnvSnapshot(env),
			studentSmokeEvidence: {
				status: "provided",
				evidencePath: "student-smoke-evidence.json",
			},
			operationalEvidence: {
				status: "provided",
				evidencePath: "operational-readiness-evidence.json",
			},
			backupRestoreEvidence: {
				status: "provided",
				evidencePath: "backup-restore-evidence.json",
			},
		});
		const envCondition = gate.blockingConditions.find(
			(condition) => condition.key === "required_env_present",
		);

		assert.equal(envCondition.pass, true);
		assert.doesNotMatch(envCondition.note, /BACKEND_API_URL/);
	}
});

test("OpenAI env keys are required only when the AI safety runtime flag is explicitly enabled", () => {
	const productionEnvWithoutAi = {
		NODE_ENV: "production",
		BACKEND_PORT: "3001",
		CORS_ORIGIN: "https://app.example.invalid",
		APP_BASE_URL: "https://app.example.invalid",
		MONGODB_URI: "mongodb://user:password@example.invalid/mathai",
		DB_NAME: "mathai",
		JWT_SECRET: "jwt-secret",
		JWT_REFRESH_SECRET: "refresh-secret",
		JWT_EXPIRES_IN: "15m",
		EMAIL_PROVIDER: "http",
		EMAIL_FROM: "MathAI <noreply@example.invalid>",
		EMAIL_API_URL: "https://email.example.invalid/send",
		EMAIL_API_KEY: "email-secret",
		ENABLE_DEMO_AUTH_TOKENS: "false",
		NEXT_PUBLIC_API_URL: "https://api.example.invalid",
		NEXT_PUBLIC_ENABLE_DEMO_LOGIN: "false",
	};
	const buildGateForEnv = (env) =>
		buildReleaseGate({
			git: { branch: "main", expectedBranch: "main", cleanWorkingTree: true },
			requiredFiles: [
				{ relativePath: ".github/workflows/verify.yml", exists: true },
			],
			envSnapshot: buildEnvSnapshot(env),
			studentSmokeEvidence: {
				status: "provided",
				evidencePath: "student-smoke-evidence.json",
			},
			operationalEvidence: {
				status: "provided",
				evidencePath: "operational-readiness-evidence.json",
			},
			backupRestoreEvidence: {
				status: "provided",
				evidencePath: "backup-restore-evidence.json",
			},
		});

	const nonAiGate = buildGateForEnv(productionEnvWithoutAi);
	const aiEnabledGate = buildGateForEnv({
		...productionEnvWithoutAi,
		FEATURE_AI_SAFETY_GUARD: "true",
	});
	const nonAiEnvCondition = nonAiGate.blockingConditions.find(
		(condition) => condition.key === "required_env_present",
	);
	const aiEnabledEnvCondition = aiEnabledGate.blockingConditions.find(
		(condition) => condition.key === "required_env_present",
	);

	assert.equal(nonAiEnvCondition.pass, true);
	assert.doesNotMatch(nonAiEnvCondition.note, /OPENAI_/);
	assert.equal(aiEnabledEnvCondition.pass, false);
	assert.match(
		aiEnabledEnvCondition.note,
		/OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL/,
	);
});

test("feature flag snapshot parses configured values without secrets", () => {
	const snapshot = buildFeatureFlagSnapshot({
		FEATURE_SCOPED_AUTHORIZATION_ENFORCEMENT: "false",
		FEATURE_DEPLOYMENT_CHECKPOINTS: "enabled",
	});

	const byEnv = Object.fromEntries(snapshot.map((entry) => [entry.env, entry]));
	assert.equal(byEnv.FEATURE_SCOPED_AUTHORIZATION_ENFORCEMENT.enabled, false);
	assert.equal(byEnv.FEATURE_SCOPED_AUTHORIZATION_ENFORCEMENT.configured, true);
	assert.equal(byEnv.FEATURE_AUDIT_LOGGING.enabled, true);
	assert.equal(byEnv.FEATURE_DEPLOYMENT_CHECKPOINTS.enabled, true);
});

test("maskValue never prints secret-like values", () => {
	assert.equal(maskValue("OPENAI_API_KEY", "abc123"), "<redacted>");
	assert.equal(maskValue("BACKEND_PORT", "3001"), "<set>");
	assert.equal(maskValue("DB_NAME", ""), "<not-set>");
});

test("release gate standardizes pass/fail conditions for manual sign-off", () => {
	const requiredFiles = [
		{ relativePath: ".github/workflows/verify.yml", exists: true },
		{ relativePath: "deploy/.env.example", exists: true },
	];
	const envSnapshot = [
		{ key: "NODE_ENV", present: true, value: "<set>" },
		{ key: "MONGODB_URI", present: true, value: "<redacted>" },
	];
	const passingGate = buildReleaseGate({
		git: {
			branch: "main",
			expectedBranch: "main",
			cleanWorkingTree: true,
		},
		requiredFiles,
		envSnapshot,
		studentSmokeEvidence: { status: "provided", evidencePath: "artifact.json" },
		operationalEvidence: { status: "provided", evidencePath: "ops.json" },
		backupRestoreEvidence: { status: "provided", evidencePath: "backup.json" },
	});

	assert.equal(passingGate.status, "pass");
	assert.deepEqual(passingGate.signOffRoles, [
		"Deployment owner",
		"Data owner",
		"Security owner",
		"Release manager or incident commander",
	]);

	const blockedGate = buildReleaseGate({
		git: {
			branch: "feature/unsafe",
			expectedBranch: "main",
			cleanWorkingTree: false,
		},
		requiredFiles: [
			{ relativePath: ".github/workflows/verify.yml", exists: false },
			{ relativePath: "deploy/.env.example", exists: true },
		],
		envSnapshot: [
			{ key: "NODE_ENV", present: true, value: "<set>" },
			{ key: "MONGODB_URI", present: false, value: "<not-set>" },
		],
	});
	const conditions = Object.fromEntries(
		blockedGate.blockingConditions.map((condition) => [
			condition.key,
			condition,
		]),
	);

	assert.equal(blockedGate.status, "review_required");
	assert.equal(conditions.expected_branch.pass, false);
	assert.equal(conditions.clean_working_tree.pass, false);
	assert.equal(conditions.ci_workflow_present.pass, false);
	assert.equal(conditions.required_files_present.pass, false);
	assert.equal(conditions.required_env_present.pass, false);
	assert.equal(conditions.student_smoke_evidence.pass, false);
	assert.equal(conditions.operational_readiness_evidence.pass, false);
	assert.equal(conditions.backup_restore_evidence.pass, false);
	assert.match(conditions.required_env_present.note, /MONGODB_URI/);
	assert.match(conditions.student_smoke_evidence.note, /student smoke/i);
	assert.match(conditions.operational_readiness_evidence.note, /Monitoring/i);
});

test("student smoke evidence manifest covers production-like learner flows", () => {
	const evidence = buildStudentSmokeEvidence({
		studentSmokeEvidencePath:
			"artifacts/deployment/student-smoke-evidence.json",
	});

	assert.equal(evidence.status, "evidence_required");
	assert.equal(
		evidence.evidencePath,
		"artifacts/deployment/student-smoke-evidence.json",
	);
	assert.deepEqual(
		evidence.requiredArtifacts.map((artifact) => artifact.key),
		[
			"target_environment",
			"backend_readiness",
			"frontend_reachability",
			"student_auth_flow",
			"student_dashboard",
			"student_assignment_list",
			"student_assignment_detail",
			"student_submission_path",
			"evidence_log_or_screenshot",
			"tester_signoff",
		],
	);
	assert.deepEqual(Object.keys(evidence.manifestTemplate), [
		"generated_at",
		"environment",
		"status",
		"checks",
	]);
	assert.equal(evidence.manifestTemplate.status, "passed");
	assert.ok(evidence.manifestTemplate.checks.length > 0);
	assert.doesNotMatch(
		JSON.stringify(evidence),
		/mongodb:\/\/|api[_-]?key|jwt-secret|super-secret|password@example/i,
	);
});

test("malformed or empty evidence manifests fail release evidence validation", () => {
	const emptyStudentPath = writeEvidenceFixture(
		"empty-student-evidence.json",
		{},
	);
	const malformedOperationalPath = writeEvidenceFixture(
		"malformed-operational-evidence.json",
		{
			generated_at: "2026-05-12T00:00:00.000Z",
			environment: "production-like",
			status: "failed",
			checks: [],
			api_key: "redacted-value-should-not-appear",
		},
	);

	const studentEvidence = buildStudentSmokeEvidence({
		studentSmokeEvidencePath: emptyStudentPath,
	});
	const operationalEvidence = buildOperationalReadinessEvidence({
		operationalEvidencePath: malformedOperationalPath,
	});
	const gate = buildReleaseGate({
		git: { branch: "main", expectedBranch: "main", cleanWorkingTree: true },
		requiredFiles: [
			{ relativePath: ".github/workflows/verify.yml", exists: true },
		],
		envSnapshot: [{ key: "NODE_ENV", present: true, value: "<set>" }],
		studentSmokeEvidence: studentEvidence,
		operationalEvidence,
		backupRestoreEvidence: { status: "provided", evidencePath: "backup.json" },
	});
	const conditions = Object.fromEntries(
		gate.blockingConditions.map((condition) => [condition.key, condition]),
	);

	assert.equal(studentEvidence.status, "invalid");
	assert.match(studentEvidence.validationErrors.join("\n"), /generated_at/);
	assert.equal(operationalEvidence.status, "invalid");
	assert.match(operationalEvidence.validationErrors.join("\n"), /status/);
	assert.match(operationalEvidence.validationErrors.join("\n"), /checks/);
	assert.match(operationalEvidence.validationErrors.join("\n"), /secret-like/);
	assert.equal(conditions.student_smoke_evidence.pass, false);
	assert.equal(conditions.operational_readiness_evidence.pass, false);
});

test("evidence manifests reject malformed or failed per-check records", () => {
	const malformedStudentPath = writeEvidenceFixture(
		"malformed-check-student-evidence.json",
		{
			generated_at: "2026-05-12T00:00:00.000Z",
			environment: "production-like",
			status: "passed",
			checks: [
				{
					name: "student dashboard",
					status: "passed",
					evidence: "Dashboard loaded.",
				},
				{ name: "student assignment", status: "passed", evidence: "" },
			],
		},
	);
	const failedOperationalPath = writeEvidenceFixture(
		"failed-check-operational-evidence.json",
		{
			generated_at: "2026-05-12T00:00:00.000Z",
			environment: "production-like",
			status: "passed",
			checks: [
				{
					name: "monitoring route",
					status: "failed",
					evidence: "Alert routing failed in staging.",
				},
			],
		},
	);

	const studentEvidence = buildStudentSmokeEvidence({
		studentSmokeEvidencePath: malformedStudentPath,
	});
	const operationalEvidence = buildOperationalReadinessEvidence({
		operationalEvidencePath: failedOperationalPath,
	});
	const gate = buildReleaseGate({
		git: { branch: "main", expectedBranch: "main", cleanWorkingTree: true },
		requiredFiles: [
			{ relativePath: ".github/workflows/verify.yml", exists: true },
		],
		envSnapshot: [{ key: "NODE_ENV", present: true, value: "<set>" }],
		studentSmokeEvidence: studentEvidence,
		operationalEvidence,
		backupRestoreEvidence: { status: "provided", evidencePath: "backup.json" },
	});
	const conditions = Object.fromEntries(
		gate.blockingConditions.map((condition) => [condition.key, condition]),
	);

	assert.equal(studentEvidence.status, "invalid");
	assert.match(
		studentEvidence.validationErrors.join("\n"),
		/checks\[1\]\.evidence/,
	);
	assert.equal(operationalEvidence.status, "invalid");
	assert.match(
		operationalEvidence.validationErrors.join("\n"),
		/checks\[0\]\.status must equal "passed"/,
	);
	assert.equal(conditions.student_smoke_evidence.pass, false);
	assert.equal(conditions.operational_readiness_evidence.pass, false);
});

test("evidence manifests reject webhook URLs and user emails", () => {
	const webhookEvidencePath = writeEvidenceFixture(
		"webhook-leak-evidence.json",
		{
			generated_at: "2026-05-12T00:00:00.000Z",
			environment: "production-like",
			status: "passed",
			checks: [
				{
					name: "monitoring alert",
					status: "passed",
					evidence: "https://hooks.slack.com/services/T000/B000/secret",
				},
			],
		},
	);
	const emailEvidencePath = writeEvidenceFixture("email-leak-evidence.json", {
		generated_at: "2026-05-12T00:00:00.000Z",
		environment: "production-like",
		status: "passed",
		checks: [
			{
				name: "student auth",
				status: "passed",
				evidence: "Student user alice@example.com signed in",
			},
		],
	});

	const operationalEvidence = buildOperationalReadinessEvidence({
		operationalEvidencePath: webhookEvidencePath,
	});
	const studentEvidence = buildStudentSmokeEvidence({
		studentSmokeEvidencePath: emailEvidencePath,
	});

	assert.equal(operationalEvidence.status, "invalid");
	assert.match(operationalEvidence.validationErrors.join("\n"), /webhook URL/i);
	assert.equal(studentEvidence.status, "invalid");
	assert.match(studentEvidence.validationErrors.join("\n"), /user email/i);
});

test("valid evidence manifests pass release evidence validation", () => {
	const validStudentPath = writeEvidenceFixture("valid-student-evidence.json", {
		generated_at: "2026-05-12T00:00:00.000Z",
		environment: "production-like",
		status: "passed",
		checks: [
			{
				name: "student dashboard",
				status: "passed",
				evidence: "Sanitized dashboard smoke evidence attached.",
			},
		],
	});
	const validOperationalPath = writeEvidenceFixture(
		"valid-operational-evidence.json",
		{
			generated_at: "2026-05-12T00:00:00.000Z",
			environment: "production-like",
			status: "passed",
			monitoring_contract: buildValidMonitoringContract(),
			checks: [
				{
					name: "monitoring route",
					status: "passed",
					evidence: "Sanitized monitoring route evidence attached.",
				},
				{
					name: "email_provider_smoke_contract",
					status: "passed",
					evidence:
						"Provider smoke passed; provider=http environment=production-like status=passed.",
					emailProviderSmoke: {
						provider: "http",
						environment: "production-like",
						status: "passed",
					},
				},
			],
		},
	);

	const studentEvidence = buildStudentSmokeEvidence({
		studentSmokeEvidencePath: validStudentPath,
	});
	const operationalEvidence = buildOperationalReadinessEvidence({
		operationalEvidencePath: validOperationalPath,
	});
	const gate = buildReleaseGate({
		git: { branch: "main", expectedBranch: "main", cleanWorkingTree: true },
		requiredFiles: [
			{ relativePath: ".github/workflows/verify.yml", exists: true },
		],
		envSnapshot: [{ key: "NODE_ENV", present: true, value: "<set>" }],
		studentSmokeEvidence: studentEvidence,
		operationalEvidence,
		backupRestoreEvidence: { status: "provided", evidencePath: "backup.json" },
	});
	const conditions = Object.fromEntries(
		gate.blockingConditions.map((condition) => [condition.key, condition]),
	);

	assert.equal(studentEvidence.status, "provided");
	assert.deepEqual(studentEvidence.validationErrors, []);
	assert.equal(operationalEvidence.status, "provided");
	assert.deepEqual(operationalEvidence.validationErrors, []);
	assert.equal(conditions.student_smoke_evidence.pass, true);
	assert.equal(conditions.operational_readiness_evidence.pass, true);
	assert.equal(conditions.backup_restore_evidence.pass, true);
});

test("backup restore evidence manifest has a canonical release gate path and schema", () => {
	const evidence = buildBackupRestoreEvidence({
		backupRestoreEvidencePath:
			"artifacts/deployment/backup-restore-evidence.json",
	});

	assert.equal(evidence.status, "evidence_required");
	assert.equal(
		evidence.evidencePath,
		"artifacts/deployment/backup-restore-evidence.json",
	);
	assert.deepEqual(
		evidence.requiredArtifacts.map((artifact) => artifact.key),
		[
			"rto",
			"rpo",
			"backup_artifact",
			"restore_to_staging",
			"validations",
			"approvals",
		],
	);
	assert.equal(evidence.manifestTemplate.status, "passed");
	assert.equal(
		evidence.manifestTemplate.backup_artifact.metadata_redacted,
		true,
	);
	assert.equal(
		evidence.manifestTemplate.approvals.approved_for_production_restore,
		false,
	);
	assert.doesNotMatch(
		JSON.stringify(evidence),
		/mongodb:\/\/|password@example/i,
	);
});

test("backup restore evidence path validates redacted evidence and blocks malformed or secret evidence", () => {
	const validBackupPath = writeEvidenceFixture(
		"valid-backup-restore-evidence.json",
		buildValidBackupRestoreEvidenceManifest(),
	);
	const invalidBackupPath = writeEvidenceFixture(
		"invalid-backup-restore-evidence.json",
		buildValidBackupRestoreEvidenceManifest({
			backup_artifact: {
				...buildValidBackupRestoreEvidenceManifest().backup_artifact,
				archive_path: "mongodb://user:password@example.invalid/mathai",
				metadata_redacted: false,
			},
		}),
	);

	const validEvidence = buildBackupRestoreEvidence({
		backupRestoreEvidencePath: validBackupPath,
	});
	const invalidEvidence = buildBackupRestoreEvidence({
		backupRestoreEvidencePath: invalidBackupPath,
	});

	assert.equal(validEvidence.status, "provided");
	assert.deepEqual(validEvidence.validationErrors, []);
	assert.equal(invalidEvidence.status, "invalid");
	assert.match(invalidEvidence.validationErrors.join("\n"), /secret-like/);
	assert.match(
		invalidEvidence.validationErrors.join("\n"),
		/metadata_redacted/,
	);
});

test("operational readiness evidence manifest covers P0 monitoring, security, email, and backup gates", () => {
	const evidence = buildOperationalReadinessEvidence({
		operationalEvidencePath:
			"artifacts/deployment/operational-readiness-evidence.json",
	});

	assert.equal(evidence.status, "evidence_required");
	assert.equal(
		evidence.evidencePath,
		"artifacts/deployment/operational-readiness-evidence.json",
	);
	assert.deepEqual(
		evidence.requiredArtifacts.map((artifact) => artifact.key),
		[
			"monitoring_alert_destination",
			"monitoring_thresholds",
			"test_alert_result",
			"security_headers_review",
			"rate_limit_review",
			"email_provider_smoke_contract",
			"email_delivery_check",
			"backup_restore_evidence",
			"operator_signoff",
		],
	);
	assert.deepEqual(Object.keys(evidence.manifestTemplate), [
		"generated_at",
		"environment",
		"status",
		"monitoring_contract",
		"checks",
	]);
	assert.equal(evidence.manifestTemplate.status, "passed");
	assert.ok(
		evidence.monitoringContract.criticalLogs.some((item) =>
			item.includes("password-reset"),
		),
	);
	assert.ok(
		evidence.monitoringContract.criticalMetrics.includes("HTTP 5xx rate"),
	);
	assert.ok(
		evidence.monitoringContract.criticalAlerts.includes("readiness degraded"),
	);
	assert.ok(
		evidence.monitoringContract.thresholds.some(
			(threshold) =>
				threshold.name === "http_5xx_rate" &&
				threshold.operator === ">=" &&
				threshold.value,
		),
	);
	assert.ok(
		evidence.monitoringContract.thresholds.every(
			(threshold) => !("key" in threshold) && !("threshold" in threshold),
		),
	);
	assert.equal(
		evidence.monitoringContract.sampleAlertTestRecord.delivered,
		"<true-or-false>",
	);
	assert.ok(
		evidence.monitoringContract.redactionRules.some((rule) =>
			rule.includes("webhook URLs"),
		),
	);
	assert.ok(evidence.manifestTemplate.checks.length > 0);
	assert.doesNotMatch(
		JSON.stringify(evidence),
		/mongodb:\/\/|api[_-]?key|jwt-secret|super-secret|password@example/i,
	);
});

test("operational evidence validator rejects legacy or incomplete threshold entries", () => {
	const legacyThresholdPath = writeEvidenceFixture(
		"legacy-threshold-evidence.json",
		{
			generated_at: "2026-05-12T00:00:00.000Z",
			environment: "production-like",
			status: "passed",
			monitoring_contract: buildValidMonitoringContract({
				thresholds: [
					{
						key: "http_5xx_rate",
						metric: "HTTP 5xx rate",
						threshold: ">= 5% over 5 minutes",
						severity: "critical",
					},
					{
						name: "readiness_degraded",
						metric: "/health/ready status",
						operator: ">=",
						value: "2 consecutive degraded checks over 2 minutes",
						severity: "critical",
					},
					{
						name: "email_provider_failures",
						metric: "email provider failures",
						operator: ">=",
						value: "5% failures over 10 minutes",
						severity: "high",
					},
				],
			}),
			checks: [
				{
					name: "email_provider_smoke_contract",
					status: "passed",
					evidence:
						"Provider smoke passed; provider=http environment=production-like status=passed.",
					emailProviderSmoke: {
						provider: "http",
						environment: "production-like",
						status: "passed",
					},
				},
			],
		},
	);

	const evidence = buildOperationalReadinessEvidence({
		operationalEvidencePath: legacyThresholdPath,
	});

	assert.equal(evidence.status, "invalid");
	assert.match(
		evidence.validationErrors.join("\n"),
		/thresholds\[0\]\.name must be a non-empty string/,
	);
	assert.match(
		evidence.validationErrors.join("\n"),
		/thresholds\[0\]\.operator must be a non-empty string/,
	);
	assert.match(
		evidence.validationErrors.join("\n"),
		/thresholds\[0\]\.value must be a non-empty string/,
	);
});

test("operational readiness evidence rejects missing or incomplete monitoring contract", () => {
	const missingContractPath = writeEvidenceFixture(
		"missing-monitoring-contract.json",
		{
			generated_at: "2026-05-12T00:00:00.000Z",
			environment: "production-like",
			status: "passed",
			checks: [
				{
					name: "monitoring route",
					status: "passed",
					evidence: "Sanitized monitoring route evidence attached.",
				},
			],
		},
	);
	const incompleteContractPath = writeEvidenceFixture(
		"incomplete-monitoring-contract.json",
		{
			generated_at: "2026-05-12T00:00:00.000Z",
			environment: "production-like",
			status: "passed",
			monitoring_contract: buildValidMonitoringContract({
				critical_alerts: ["readiness degraded"],
				sample_alert_test_record: {
					alert_name: "readiness_degraded_test",
					triggered_at: "2026-05-12T00:00:00.000Z",
					destination: "operations route",
					delivered: false,
					acknowledged_by_role: "Operations owner",
					evidence: "Alert did not deliver.",
				},
			}),
			checks: [
				{
					name: "monitoring route",
					status: "passed",
					evidence: "Sanitized monitoring route evidence attached.",
				},
			],
		},
	);

	const missingContractEvidence = buildOperationalReadinessEvidence({
		operationalEvidencePath: missingContractPath,
	});
	const incompleteContractEvidence = buildOperationalReadinessEvidence({
		operationalEvidencePath: incompleteContractPath,
	});

	assert.equal(missingContractEvidence.status, "invalid");
	assert.match(
		missingContractEvidence.validationErrors.join("\n"),
		/monitoring_contract must be an object/,
	);
	assert.equal(incompleteContractEvidence.status, "invalid");
	assert.match(
		incompleteContractEvidence.validationErrors.join("\n"),
		/critical_alerts must include at least 3 entries/,
	);
	assert.match(
		incompleteContractEvidence.validationErrors.join("\n"),
		/sample_alert_test_record.delivered must be true/,
	);
});

test("operational evidence validator requires redacted email provider smoke contract fields", () => {
	const missingEmailSmokePath = writeEvidenceFixture(
		"missing-email-smoke-evidence.json",
		{
			generated_at: "2026-05-12T00:00:00.000Z",
			environment: "production-like",
			status: "passed",
			monitoring_contract: buildValidMonitoringContract(),
			checks: [
				{
					name: "email_provider_smoke_contract",
					status: "passed",
					evidence: "Email smoke completed without recipient data.",
				},
			],
		},
	);
	const validEmailSmokePath = writeEvidenceFixture(
		"valid-email-smoke-evidence.json",
		{
			generated_at: "2026-05-12T00:00:00.000Z",
			environment: "production-like",
			status: "passed",
			monitoring_contract: buildValidMonitoringContract(),
			checks: [
				{
					name: "email_provider_smoke_contract",
					status: "passed",
					evidence:
						"Provider smoke passed; provider=http environment=production-like status=passed.",
					emailProviderSmoke: {
						provider: "http",
						environment: "production-like",
						status: "passed",
					},
				},
			],
		},
	);

	const missingEmailSmoke = buildOperationalReadinessEvidence({
		operationalEvidencePath: missingEmailSmokePath,
	});
	const validEmailSmoke = buildOperationalReadinessEvidence({
		operationalEvidencePath: validEmailSmokePath,
	});

	assert.equal(missingEmailSmoke.status, "invalid");
	assert.match(
		missingEmailSmoke.validationErrors.join("\n"),
		/emailProviderSmoke/,
	);
	assert.equal(validEmailSmoke.status, "provided");
	assert.deepEqual(validEmailSmoke.validationErrors, []);
});
