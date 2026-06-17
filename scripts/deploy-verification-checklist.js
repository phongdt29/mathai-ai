#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const {
	buildDrillEvidence,
	validateBackupRestoreEvidenceManifest,
} = require("./mongo-backup-restore-plan");

const rootDir = path.resolve(__dirname, "..");

const SENSITIVE_PATTERN =
	/(password|passwd|pwd|secret|token|api[_-]?key|authorization|credential|origin|uri|url|connection|string)/i;
const EVIDENCE_SECRET_KEY_PATTERN =
	/(password|passwd|pwd|secret|token|api[_-]?key|authorization|credential|connection[_-]?string|mongodb[_-]?uri|database[_-]?url)/i;
const EVIDENCE_SECRET_VALUE_PATTERN =
	/(mongodb(?:\+srv)?:\/\/|postgres(?:ql)?:\/\/|mysql:\/\/|redis:\/\/|bearer\s+[a-z0-9._~+/-]{12,}=*|password\s*[=:]|secret\s*[=:]|token\s*[=:]|api[_-]?key\s*[=:]|sk-[a-z0-9]{12,}|eyj[a-z0-9_-]{20,})/i;
const EVIDENCE_WEBHOOK_URL_PATTERN =
	/https:\/\/(?:hooks\.slack\.com|discord(?:app)?\.com\/api\/webhooks|[^\s/]+\.webhook\.[^\s/]+|[^\s/]+\/webhook[s]?\/)[^\s]*/i;
const EVIDENCE_USER_EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

const REQUIRED_ENV_KEYS = [
	"NODE_ENV",
	"BACKEND_PORT",
	"CORS_ORIGIN",
	"APP_BASE_URL",
	"MONGODB_URI",
	"DB_NAME",
	"JWT_SECRET",
	"JWT_REFRESH_SECRET",
	"JWT_EXPIRES_IN",
	"EMAIL_PROVIDER",
	"EMAIL_FROM",
	"EMAIL_API_URL",
	"EMAIL_API_KEY",
	"ENABLE_DEMO_AUTH_TOKENS",
	"NEXT_PUBLIC_API_URL",
	"NEXT_PUBLIC_ENABLE_DEMO_LOGIN",
];
const AI_REQUIRED_ENV_KEYS = [
	"OPENAI_API_KEY",
	"OPENAI_BASE_URL",
	"OPENAI_MODEL",
];

const FEATURE_FLAG_DEFINITIONS = [
	{
		key: "scopedAuthorizationEnforcement",
		env: "FEATURE_SCOPED_AUTHORIZATION_ENFORCEMENT",
		defaultEnabled: true,
	},
	{
		key: "auditLogging",
		env: "FEATURE_AUDIT_LOGGING",
		defaultEnabled: true,
	},
	{
		key: "aiSafetyGuard",
		env: "FEATURE_AI_SAFETY_GUARD",
		defaultEnabled: true,
	},
	{
		key: "antiFraudSignalGeneration",
		env: "FEATURE_ANTI_FRAUD_SIGNAL_GENERATION",
		defaultEnabled: true,
	},
	{
		key: "gradebookSummaries",
		env: "FEATURE_GRADEBOOK_SUMMARIES",
		defaultEnabled: true,
	},
	{
		key: "deploymentCheckpoints",
		env: "FEATURE_DEPLOYMENT_CHECKPOINTS",
		defaultEnabled: false,
	},
];

const CI_WORKFLOW_PATH = ".github/workflows/verify.yml";
const DEFAULT_STUDENT_SMOKE_EVIDENCE_PATH =
	"artifacts/deployment/student-smoke-evidence.json";
const DEFAULT_OPERATIONAL_EVIDENCE_PATH =
	"artifacts/deployment/operational-readiness-evidence.json";
const DEFAULT_BACKUP_RESTORE_EVIDENCE_PATH =
	"artifacts/deployment/backup-restore-evidence.json";

const OPERATIONAL_MONITORING_CONTRACT_TEMPLATE = {
	criticalLogs: [
		"backend application errors with request id and route family",
		"authentication and password-reset failures without user identifiers",
		"database connectivity and migration/seed failures",
		"email delivery provider failures without recipient addresses",
		"AI provider fallback or safety-guard events without prompt payloads",
	],
	criticalMetrics: [
		"/health/ready status and latency",
		"HTTP 5xx rate",
		"password-reset request and delivery failure rate",
		"email provider failure rate",
		"AI provider error/fallback rate",
		"MongoDB connection state",
	],
	criticalAlerts: [
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
	],
	sampleAlertTestRecord: {
		alertName: "readiness_degraded_test",
		triggeredAt: "<iso-8601-timestamp>",
		destination: "<route-name-only>",
		delivered: "<true-or-false>",
		acknowledgedByRole: "Operations owner",
		evidence: "<sanitized-ticket-or-artifact-path>",
	},
	redactionRules: [
		"Do not include webhook URLs, auth credentials, provider keys, JWTs, MongoDB addresses, or connection details.",
		"Do not include user emails, reset secrets, prompt payloads, student content, or raw provider responses.",
		"Use route families, role names, ticket ids, and sanitized artifact paths instead of identifiers.",
	],
};

const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", "disabled"]);

function parseArgs(argv = process.argv.slice(2)) {
	const options = {
		dryRun: true,
		json: false,
		expectedBranch: "feat/phase-6-deploy-safety",
		checkpointTag: "checkpoint/phase-6-complete",
		preReleaseTag: "checkpoint/pre-release-candidate",
		backendHealthUrl: "http://localhost:3001/health",
		frontendHealthUrl: "http://localhost:3444",
		studentSmokeEvidencePath: DEFAULT_STUDENT_SMOKE_EVIDENCE_PATH,
		operationalEvidencePath: DEFAULT_OPERATIONAL_EVIDENCE_PATH,
		backupRestoreEvidencePath: DEFAULT_BACKUP_RESTORE_EVIDENCE_PATH,
	};

	for (const arg of argv) {
		if (arg === "--help" || arg === "-h") {
			options.help = true;
		} else if (arg === "--dry-run") {
			options.dryRun = true;
		} else if (arg === "--execute") {
			options.dryRun = false;
		} else if (arg === "--json") {
			options.json = true;
		} else if (arg.startsWith("--expected-branch=")) {
			options.expectedBranch = arg.slice("--expected-branch=".length);
		} else if (arg.startsWith("--checkpoint-tag=")) {
			options.checkpointTag = arg.slice("--checkpoint-tag=".length);
		} else if (arg.startsWith("--pre-release-tag=")) {
			options.preReleaseTag = arg.slice("--pre-release-tag=".length);
		} else if (arg.startsWith("--backend-health-url=")) {
			options.backendHealthUrl = arg.slice("--backend-health-url=".length);
		} else if (arg.startsWith("--frontend-health-url=")) {
			options.frontendHealthUrl = arg.slice("--frontend-health-url=".length);
		} else if (arg.startsWith("--student-smoke-evidence=")) {
			options.studentSmokeEvidencePath = arg.slice(
				"--student-smoke-evidence=".length,
			);
		} else if (arg.startsWith("--operational-evidence=")) {
			options.operationalEvidencePath = arg.slice(
				"--operational-evidence=".length,
			);
		} else if (arg.startsWith("--backup-restore-evidence=")) {
			options.backupRestoreEvidencePath = arg.slice(
				"--backup-restore-evidence=".length,
			);
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return options;
}

function runGit(command) {
	try {
		return execSync(command, {
			cwd: rootDir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			shell: true,
		}).trim();
	} catch (error) {
		return "";
	}
}

function maskValue(key, value) {
	if (value === undefined || value === "") {
		return "<not-set>";
	}

	return SENSITIVE_PATTERN.test(key) ? "<redacted>" : "<set>";
}

function parseBoolean(value, defaultValue) {
	if (value === undefined || value.trim() === "") {
		return defaultValue;
	}

	const normalized = value.trim().toLowerCase();
	if (TRUE_VALUES.has(normalized)) {
		return true;
	}

	if (FALSE_VALUES.has(normalized)) {
		return false;
	}

	return defaultValue;
}

function pathExists(relativePath) {
	return fs.existsSync(path.join(rootDir, relativePath));
}

function findSecretLikeEvidenceEntries(value, currentPath = "manifest") {
	const findings = [];

	if (Array.isArray(value)) {
		value.forEach((item, index) => {
			findings.push(
				...findSecretLikeEvidenceEntries(item, `${currentPath}[${index}]`),
			);
		});
		return findings;
	}

	if (value && typeof value === "object") {
		for (const [key, nestedValue] of Object.entries(value)) {
			const nestedPath = `${currentPath}.${key}`;
			if (EVIDENCE_SECRET_KEY_PATTERN.test(key)) {
				findings.push(nestedPath);
			}
			findings.push(...findSecretLikeEvidenceEntries(nestedValue, nestedPath));
		}
		return findings;
	}

	if (typeof value === "string" && EVIDENCE_SECRET_VALUE_PATTERN.test(value)) {
		if (!/\.redaction_rules\[\d+\]$/.test(currentPath)) {
			findings.push(currentPath);
		}
	}
	if (typeof value === "string" && EVIDENCE_WEBHOOK_URL_PATTERN.test(value)) {
		findings.push(`${currentPath} (webhook URL)`);
	}
	if (typeof value === "string" && EVIDENCE_USER_EMAIL_PATTERN.test(value)) {
		findings.push(`${currentPath} (user email)`);
	}

	return findings;
}

function hasAtLeastEntries(value, minimum) {
	return Array.isArray(value) && value.length >= minimum;
}

function validateMonitoringContract(manifest, evidenceLabel, errors) {
	if (!evidenceLabel.startsWith("Operational readiness")) {
		return;
	}

	const contract = manifest.monitoring_contract;
	if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
		errors.push(
			`${evidenceLabel} evidence manifest monitoring_contract must be an object.`,
		);
		return;
	}

	const requiredArrays = [
		["critical_logs", 3],
		["critical_metrics", 3],
		["critical_alerts", 3],
		["thresholds", 3],
		["redaction_rules", 2],
	];
	for (const [key, minimum] of requiredArrays) {
		if (!hasAtLeastEntries(contract[key], minimum)) {
			errors.push(
				`${evidenceLabel} evidence manifest monitoring_contract.${key} must include at least ${minimum} entries.`,
			);
		}
	}

	if (Array.isArray(contract.thresholds)) {
		contract.thresholds.forEach((threshold, index) => {
			const thresholdPath = `${evidenceLabel} evidence manifest monitoring_contract.thresholds[${index}]`;
			if (
				!threshold ||
				typeof threshold !== "object" ||
				Array.isArray(threshold)
			) {
				errors.push(`${thresholdPath} must be an object.`);
				return;
			}

			for (const field of ["name", "operator", "value", "severity"]) {
				if (
					typeof threshold[field] !== "string" ||
					threshold[field].trim() === ""
				) {
					errors.push(`${thresholdPath}.${field} must be a non-empty string.`);
				}
			}
		});
	}

	const sample = contract.sample_alert_test_record;
	if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
		errors.push(
			`${evidenceLabel} evidence manifest monitoring_contract.sample_alert_test_record must be an object.`,
		);
		return;
	}

	if (sample.delivered !== true) {
		errors.push(
			`${evidenceLabel} evidence manifest monitoring_contract.sample_alert_test_record.delivered must be true.`,
		);
	}
}

function validateEmailProviderSmokeContract(manifest, evidenceLabel, errors) {
	if (!evidenceLabel.startsWith("Operational readiness")) {
		return;
	}

	const emailSmokeCheck = Array.isArray(manifest.checks)
		? manifest.checks.find(
				(check) => check?.name === "email_provider_smoke_contract",
			)
		: undefined;
	if (!emailSmokeCheck) {
		errors.push(
			`${evidenceLabel} evidence manifest checks must include email_provider_smoke_contract.`,
		);
		return;
	}

	const smoke = emailSmokeCheck.emailProviderSmoke;
	if (!smoke || typeof smoke !== "object" || Array.isArray(smoke)) {
		errors.push(
			`${evidenceLabel} evidence manifest email_provider_smoke_contract.emailProviderSmoke must be an object.`,
		);
		return;
	}

	if (smoke.provider !== "http") {
		errors.push(
			`${evidenceLabel} evidence manifest emailProviderSmoke.provider must equal "http".`,
		);
	}
	if (
		typeof smoke.environment !== "string" ||
		smoke.environment.trim() === ""
	) {
		errors.push(
			`${evidenceLabel} evidence manifest emailProviderSmoke.environment must be a non-empty string.`,
		);
	}
	if (smoke.status !== "passed") {
		errors.push(
			`${evidenceLabel} evidence manifest emailProviderSmoke.status must equal "passed".`,
		);
	}
}

function validateEvidenceManifest(evidencePath, evidenceLabel) {
	const absolutePath = path.join(rootDir, evidencePath);
	const errors = [];
	let manifest;

	try {
		manifest = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
	} catch (error) {
		return {
			valid: false,
			errors: [
				`${evidenceLabel} evidence manifest must be readable JSON: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}

	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		errors.push(`${evidenceLabel} evidence manifest must be a JSON object.`);
		return { valid: false, errors };
	}

	if (
		typeof manifest.generated_at !== "string" ||
		manifest.generated_at === ""
	) {
		errors.push(
			`${evidenceLabel} evidence manifest generated_at must be a non-empty string.`,
		);
	}
	if (typeof manifest.environment !== "string" || manifest.environment === "") {
		errors.push(
			`${evidenceLabel} evidence manifest environment must be a non-empty string.`,
		);
	}
	if (manifest.status !== "passed") {
		errors.push(
			`${evidenceLabel} evidence manifest status must equal "passed".`,
		);
	}
	if (!Array.isArray(manifest.checks) || manifest.checks.length === 0) {
		errors.push(
			`${evidenceLabel} evidence manifest checks must be a non-empty array.`,
		);
	} else {
		manifest.checks.forEach((check, index) => {
			const checkPath = `${evidenceLabel} evidence manifest checks[${index}]`;
			if (!check || typeof check !== "object" || Array.isArray(check)) {
				errors.push(`${checkPath} must be an object.`);
				return;
			}

			if (typeof check.name !== "string" || check.name.trim() === "") {
				errors.push(`${checkPath}.name must be a non-empty string.`);
			}
			if (check.status !== "passed") {
				errors.push(`${checkPath}.status must equal "passed".`);
			}
			if (typeof check.evidence !== "string" || check.evidence.trim() === "") {
				errors.push(`${checkPath}.evidence must be a non-empty string.`);
			}
		});
	}

	validateMonitoringContract(manifest, evidenceLabel, errors);
	validateEmailProviderSmokeContract(manifest, evidenceLabel, errors);

	const secretLikePaths = findSecretLikeEvidenceEntries(manifest);
	if (secretLikePaths.length > 0) {
		errors.push(
			`${evidenceLabel} evidence manifest contains secret-like keys or values at: ${secretLikePaths.join(", ")}`,
		);
	}

	return { valid: errors.length === 0, errors };
}

function buildEnvSnapshot(env = process.env) {
	const requiredKeys = [...REQUIRED_ENV_KEYS];
	if (parseBoolean(env.FEATURE_AI_SAFETY_GUARD, false)) {
		requiredKeys.push(...AI_REQUIRED_ENV_KEYS);
	}

	return requiredKeys.map((key) => ({
		key,
		present: env[key] !== undefined && env[key] !== "",
		value: maskValue(key, env[key]),
	}));
}

function buildFeatureFlagSnapshot(env = process.env) {
	return FEATURE_FLAG_DEFINITIONS.map((definition) => ({
		key: definition.key,
		env: definition.env,
		configured: env[definition.env] !== undefined && env[definition.env] !== "",
		enabled: parseBoolean(env[definition.env], definition.defaultEnabled),
		defaultEnabled: definition.defaultEnabled,
	}));
}

function buildStudentSmokeEvidence(options = {}) {
	const evidencePath =
		options.studentSmokeEvidencePath || DEFAULT_STUDENT_SMOKE_EVIDENCE_PATH;
	const evidenceExists = pathExists(evidencePath);
	const validation = evidenceExists
		? validateEvidenceManifest(evidencePath, "Student smoke")
		: { valid: false, errors: [] };
	const requiredArtifacts = [
		{
			key: "target_environment",
			description:
				"Production-like environment name, release commit, frontend URL, and backend URL.",
		},
		{
			key: "backend_readiness",
			description:
				"Captured /health/ready response from the release candidate.",
		},
		{
			key: "frontend_reachability",
			description: "Captured frontend load result for the student entry point.",
		},
		{
			key: "student_auth_flow",
			description:
				"Student can sign in or register using the production-like path.",
		},
		{
			key: "student_dashboard",
			description:
				"Student dashboard loads personalized learning data without console errors.",
		},
		{
			key: "student_assignment_list",
			description: "Student assignment list loads from the backend API.",
		},
		{
			key: "student_assignment_detail",
			description: "Student can open an assignment detail from the list.",
		},
		{
			key: "student_submission_path",
			description:
				"Student can submit a non-destructive test response or record why submission was intentionally skipped.",
		},
		{
			key: "evidence_log_or_screenshot",
			description:
				"Link or path to sanitized run log/screenshots for the smoke flow.",
		},
		{
			key: "tester_signoff",
			description: "Tester name, timestamp, and release ticket reference.",
		},
	];

	return {
		status: evidenceExists
			? validation.valid
				? "provided"
				: "invalid"
			: "evidence_required",
		evidencePath,
		validationErrors: validation.errors,
		requiredArtifacts,
		manifestTemplate: {
			generated_at: "<iso-8601-timestamp>",
			environment: "<production-like-environment-name>",
			status: "passed",
			checks: requiredArtifacts.map((artifact) => ({
				name: artifact.key,
				status: "passed",
				evidence: `<sanitized-evidence-for-${artifact.key}>`,
			})),
		},
	};
}

function buildOperationalReadinessEvidence(options = {}) {
	const evidencePath =
		options.operationalEvidencePath || DEFAULT_OPERATIONAL_EVIDENCE_PATH;
	const evidenceExists = pathExists(evidencePath);
	const validation = evidenceExists
		? validateEvidenceManifest(evidencePath, "Operational readiness")
		: { valid: false, errors: [] };
	const requiredArtifacts = [
		{
			key: "monitoring_alert_destination",
			description:
				"Named alert destination/owner for production error, health, and uptime alerts; no webhook secrets.",
		},
		{
			key: "monitoring_thresholds",
			description:
				"Thresholds for /health/ready failures, HTTP 5xx rate, auth reset delivery failures, and AI provider failures.",
		},
		{
			key: "test_alert_result",
			description:
				"Sanitized evidence that a staging or production-like test alert reached the responsible owner.",
		},
		{
			key: "security_headers_review",
			description:
				"Captured review of Helmet/security headers, CORS origin, and demo-login flags for the release candidate.",
		},
		{
			key: "rate_limit_review",
			description:
				"Auth/password-reset rate-limit policy and any sensitive endpoint limits verified for the environment.",
		},
		{
			key: "email_provider_smoke_contract",
			description:
				"Redacted email provider smoke contract records provider, environment, and passed status only; no recipient PII, tokens, provider payloads, or API secrets.",
		},
		{
			key: "email_delivery_check",
			description:
				"Password-reset email provider delivery or approved fallback evidence with account enumeration protected.",
		},
		{
			key: "backup_restore_evidence",
			description:
				"Dry-run backup plan, restore rehearsal plan, checksum location, retention owner, and explicit restore approval gate.",
		},
		{
			key: "operator_signoff",
			description:
				"Deployment, security, data, and release owners with timestamp and deployment ticket reference.",
		},
	];

	return {
		status: evidenceExists
			? validation.valid
				? "provided"
				: "invalid"
			: "evidence_required",
		evidencePath,
		validationErrors: validation.errors,
		requiredArtifacts,
		manifestTemplate: {
			generated_at: "<iso-8601-timestamp>",
			environment: "<production-like-environment-name>",
			status: "passed",
			monitoring_contract: {
				critical_logs: OPERATIONAL_MONITORING_CONTRACT_TEMPLATE.criticalLogs,
				critical_metrics:
					OPERATIONAL_MONITORING_CONTRACT_TEMPLATE.criticalMetrics,
				critical_alerts:
					OPERATIONAL_MONITORING_CONTRACT_TEMPLATE.criticalAlerts,
				thresholds: OPERATIONAL_MONITORING_CONTRACT_TEMPLATE.thresholds,
				sample_alert_test_record: {
					alert_name:
						OPERATIONAL_MONITORING_CONTRACT_TEMPLATE.sampleAlertTestRecord
							.alertName,
					triggered_at:
						OPERATIONAL_MONITORING_CONTRACT_TEMPLATE.sampleAlertTestRecord
							.triggeredAt,
					destination:
						OPERATIONAL_MONITORING_CONTRACT_TEMPLATE.sampleAlertTestRecord
							.destination,
					delivered:
						OPERATIONAL_MONITORING_CONTRACT_TEMPLATE.sampleAlertTestRecord
							.delivered,
					acknowledged_by_role:
						OPERATIONAL_MONITORING_CONTRACT_TEMPLATE.sampleAlertTestRecord
							.acknowledgedByRole,
					evidence:
						OPERATIONAL_MONITORING_CONTRACT_TEMPLATE.sampleAlertTestRecord
							.evidence,
				},
				redaction_rules:
					OPERATIONAL_MONITORING_CONTRACT_TEMPLATE.redactionRules,
			},
			checks: requiredArtifacts.map((artifact) => ({
				name: artifact.key,
				status: "passed",
				evidence: `<sanitized-evidence-for-${artifact.key}>`,
				...(artifact.key === "email_provider_smoke_contract"
					? {
							emailProviderSmoke: {
								provider: "http",
								environment: "<production-like-environment-name>",
								status: "passed",
							},
						}
					: {}),
			})),
		},
		monitoringContract: OPERATIONAL_MONITORING_CONTRACT_TEMPLATE,
	};
}

function buildBackupRestoreEvidence(options = {}) {
	const evidencePath =
		options.backupRestoreEvidencePath || DEFAULT_BACKUP_RESTORE_EVIDENCE_PATH;
	const evidenceExists = pathExists(evidencePath);
	let validation = { valid: false, errors: [] };

	if (evidenceExists) {
		try {
			const manifest = JSON.parse(
				fs.readFileSync(path.join(rootDir, evidencePath), "utf8"),
			);
			validation = validateBackupRestoreEvidenceManifest(manifest);
		} catch (error) {
			validation = {
				valid: false,
				errors: [
					`Backup/restore evidence manifest must be readable JSON: ${error instanceof Error ? error.message : String(error)}`,
				],
			};
		}
	}

	const drillEvidence = buildDrillEvidence(
		"backup_restore_drill",
		"mathai",
		"<iso-8601-timestamp>",
	);

	return {
		status: evidenceExists
			? validation.valid
				? "provided"
				: "invalid"
			: "evidence_required",
		evidencePath,
		validationErrors: validation.errors,
		requiredArtifacts: drillEvidence.requiredArtifacts,
		acceptanceCriteria: drillEvidence.acceptanceCriteria,
		manifestTemplate: drillEvidence.manifestTemplate,
	};
}

function buildReleaseGate({
	git,
	requiredFiles,
	envSnapshot,
	studentSmokeEvidence,
	operationalEvidence,
	backupRestoreEvidence,
}) {
	const missingFiles = requiredFiles
		.filter((entry) => !entry.exists)
		.map((entry) => entry.relativePath);
	const missingEnvKeys = envSnapshot
		.filter((entry) => !entry.present)
		.map((entry) => entry.key);
	const studentSmokeStatus =
		studentSmokeEvidence?.status || "evidence_required";
	const operationalStatus = operationalEvidence?.status || "evidence_required";
	const backupRestoreStatus =
		backupRestoreEvidence?.status || "evidence_required";

	const blockingConditions = [
		{
			key: "expected_branch",
			pass: git.branch === git.expectedBranch,
			note: `Expected ${git.expectedBranch}; actual ${git.branch || "<unknown>"}`,
		},
		{
			key: "clean_working_tree",
			pass: git.cleanWorkingTree,
			note: git.cleanWorkingTree
				? "No local changes detected."
				: "Review and commit or intentionally exclude all local changes before release sign-off.",
		},
		{
			key: "ci_workflow_present",
			pass: requiredFiles.some(
				(entry) => entry.relativePath === CI_WORKFLOW_PATH && entry.exists,
			),
			note: `${CI_WORKFLOW_PATH} must exist and run the release verification commands.`,
		},
		{
			key: "required_files_present",
			pass: missingFiles.length === 0,
			note:
				missingFiles.length === 0
					? "All release-critical files are present."
					: `Missing release-critical files: ${missingFiles.join(", ")}`,
		},
		{
			key: "required_env_present",
			pass: missingEnvKeys.length === 0,
			note:
				missingEnvKeys.length === 0
					? "All required environment keys are configured."
					: `Missing environment keys: ${missingEnvKeys.join(", ")}`,
		},
		{
			key: "student_smoke_evidence",
			pass: studentSmokeStatus === "provided",
			note:
				studentSmokeStatus === "provided"
					? `Production-like student smoke evidence recorded at ${studentSmokeEvidence.evidencePath}.`
					: `Production-like student smoke evidence required at ${studentSmokeEvidence?.evidencePath || DEFAULT_STUDENT_SMOKE_EVIDENCE_PATH}.`,
		},
		{
			key: "operational_readiness_evidence",
			pass: operationalStatus === "provided",
			note:
				operationalStatus === "provided"
					? `Operational readiness evidence recorded at ${operationalEvidence.evidencePath}.`
					: `Monitoring, security, email, and backup readiness evidence required at ${operationalEvidence?.evidencePath || DEFAULT_OPERATIONAL_EVIDENCE_PATH}.`,
		},
		{
			key: "backup_restore_evidence",
			pass: backupRestoreStatus === "provided",
			note:
				backupRestoreStatus === "provided"
					? `Backup/restore drill evidence recorded at ${backupRestoreEvidence.evidencePath}.`
					: `Backup/restore drill evidence required at ${backupRestoreEvidence?.evidencePath || DEFAULT_BACKUP_RESTORE_EVIDENCE_PATH}.`,
		},
	];

	return {
		status: blockingConditions.every((condition) => condition.pass)
			? "pass"
			: "review_required",
		blockingConditions,
		signOffRoles: [
			"Deployment owner",
			"Data owner",
			"Security owner",
			"Release manager or incident commander",
		],
	};
}

function buildChecklist(options, env = process.env) {
	const branch = runGit("git branch --show-current");
	const head = runGit("git rev-parse --short HEAD");
	const status = runGit("git status --short");
	const tags = runGit("git tag --points-at HEAD");
	const checkpointTagExists =
		runGit(`git tag --list "${options.checkpointTag}"`) ===
		options.checkpointTag;
	const preReleaseTagExists =
		runGit(`git tag --list "${options.preReleaseTag}"`) ===
		options.preReleaseTag;

	const requiredFiles = [
		CI_WORKFLOW_PATH,
		"package.json",
		".env.example",
		"packages/backend/package.json",
		"packages/backend/.env.example",
		"packages/backend/src/config/feature-flags.ts",
		"packages/frontend/.env.example",
		"packages/frontend/env-config.cjs",
		"scripts/build-deploy.js",
		"scripts/mongo-backup-restore-plan.js",
		"deploy/package.json",
		"deploy/README.md",
		"deploy/.env.example",
		"deploy/backend/.env.example",
		"deploy/frontend/.env.example",
		"docs/runbooks/mongo-backup-restore.md",
		"docs/runbooks/deployment-verification-recovery-drills.md",
	].map((relativePath) => ({ relativePath, exists: pathExists(relativePath) }));

	const git = {
		expectedBranch: options.expectedBranch,
		branch,
		head,
		cleanWorkingTree: status === "",
		statusSummary: status === "" ? "<clean>" : status.split("\n"),
		tagsAtHead: tags === "" ? [] : tags.split("\n"),
		checkpointTag: options.checkpointTag,
		checkpointTagExists,
		preReleaseTag: options.preReleaseTag,
		preReleaseTagExists,
		gates: [
			{
				name: "expected branch",
				pass: branch === options.expectedBranch,
				note: `Expected ${options.expectedBranch}; actual ${branch || "<unknown>"}`,
			},
			{
				name: "working tree reviewed",
				pass: status === "",
				note:
					status === ""
						? "No local changes detected."
						: "Local changes exist; commit only Phase 6.3-6.5 files and preserve pre-existing documentation changes.",
			},
		],
	};
	const envSnapshot = buildEnvSnapshot(env);
	const studentSmokeEvidence = buildStudentSmokeEvidence(options);
	const operationalEvidence = buildOperationalReadinessEvidence(options);
	const backupRestoreEvidence = buildBackupRestoreEvidence(options);
	const releaseGate = buildReleaseGate({
		git,
		requiredFiles,
		envSnapshot,
		studentSmokeEvidence,
		operationalEvidence,
		backupRestoreEvidence,
	});

	return {
		phase: "Phase 6.3-6.5 deployment verification checkpoint",
		dryRun: options.dryRun,
		generatedAt: new Date().toISOString(),
		safety: [
			"Local checks only: this script does not call production, health URLs, MongoDB, or external services.",
			"Secret-like environment values are reported only as <redacted>, <set>, or <not-set>.",
			"Use --execute only as future metadata; this script still refuses network or destructive operations.",
		],
		git,
		releaseGate,
		studentSmokeEvidence,
		operationalEvidence,
		backupRestoreEvidence,
		commands: {
			requiredVerification: [
				"npm run verify",
				"npm test --workspace packages/backend",
				"npm run build --workspace packages/backend",
				"npm run test:backup-plan",
				"npm run deploy:verify",
			],
			optionalArtifactBuild: "npm run build:deploy",
			rollbackByTag: [
				"git fetch --tags",
				"git checkout <known-good-tag>",
				"npm test --workspace packages/backend",
				"npm run build --workspace packages/backend",
			],
		},
		environment: {
			requiredKeys: envSnapshot,
			healthcheckPlaceholders: {
				backend: options.backendHealthUrl,
				frontend: options.frontendHealthUrl,
				note: "Placeholders only; no HTTP requests are made by this script.",
			},
		},
		featureFlags: buildFeatureFlagSnapshot(env),
		backupPlan: {
			available:
				pathExists("scripts/mongo-backup-restore-plan.js") &&
				pathExists("docs/runbooks/mongo-backup-restore.md"),
			dryRunCommand:
				"npm run backup:plan -- --backup --output-dir=backups/mongodb",
			restoreDrillCommand:
				"npm run backup:plan -- --restore --backup-file=backups/mongodb/mathai-<timestamp>.archive.gz",
			evidencePath: backupRestoreEvidence.evidencePath,
		},
		requiredFiles,
		manualGoNoGo: [
			"Deployment owner confirms branch, commit, checkpoint tag, and verification command outputs.",
			"Data owner confirms recent backup plan, restore drill evidence, and rollback decision owner.",
			"Security owner confirms feature flag snapshot, security hardening evidence, and no secrets in logs.",
			"Operations owner confirms monitoring thresholds, alert route, and test-alert evidence.",
			"Email owner confirms password-reset delivery evidence or approved fallback.",
			"QA owner confirms production-like student smoke evidence artifact and release ticket links.",
			"Incident commander or release manager records final go/no-go in the deployment ticket.",
		],
	};
}

function printChecklist(checklist) {
	console.log(`${checklist.phase}`);
	console.log(`Dry run: ${checklist.dryRun}`);
	console.log(`Generated at: ${checklist.generatedAt}`);
	console.log("\nSafety:");
	checklist.safety.forEach((item) => console.log(`- ${item}`));
	console.log("\nGit gates:");
	checklist.git.gates.forEach((gate) =>
		console.log(
			`- [${gate.pass ? "PASS" : "REVIEW"}] ${gate.name}: ${gate.note}`,
		),
	);
	console.log(`- HEAD: ${checklist.git.head || "<unknown>"}`);
	console.log(
		`- Tags at HEAD: ${checklist.git.tagsAtHead.length > 0 ? checklist.git.tagsAtHead.join(", ") : "<none>"}`,
	);
	console.log(
		`- Checkpoint tag exists: ${checklist.git.checkpointTagExists} (${checklist.git.checkpointTag})`,
	);
	console.log(
		`- Pre-release checkpoint tag exists: ${checklist.git.preReleaseTagExists} (${checklist.git.preReleaseTag})`,
	);
	console.log(`\nRelease gate: ${checklist.releaseGate.status}`);
	checklist.releaseGate.blockingConditions.forEach((condition) =>
		console.log(
			`- [${condition.pass ? "PASS" : "REVIEW"}] ${condition.key}: ${condition.note}`,
		),
	);
	console.log("\nRequired verification commands:");
	checklist.commands.requiredVerification.forEach((command) =>
		console.log(`- ${command}`),
	);
	console.log("\nEnvironment required key presence (values never printed):");
	checklist.environment.requiredKeys.forEach((entry) =>
		console.log(`- ${entry.key}: ${entry.value}`),
	);
	console.log("\nFeature flag snapshot:");
	checklist.featureFlags.forEach((flag) =>
		console.log(
			`- ${flag.env}: enabled=${flag.enabled} configured=${flag.configured}`,
		),
	);
	console.log("\nBackup and restore drill:");
	console.log(`- Available: ${checklist.backupPlan.available}`);
	console.log(`- Backup plan: ${checklist.backupPlan.dryRunCommand}`);
	console.log(`- Restore drill: ${checklist.backupPlan.restoreDrillCommand}`);
	console.log(`- Evidence status: ${checklist.backupRestoreEvidence.status}`);
	console.log(
		`- Evidence path: ${checklist.backupRestoreEvidence.evidencePath}`,
	);
	checklist.backupRestoreEvidence.requiredArtifacts.forEach((artifact) =>
		console.log(`- ${artifact.key}: ${artifact.description}`),
	);
	console.log("\nStudent smoke evidence:");
	console.log(`- Status: ${checklist.studentSmokeEvidence.status}`);
	console.log(
		`- Evidence path: ${checklist.studentSmokeEvidence.evidencePath}`,
	);
	checklist.studentSmokeEvidence.requiredArtifacts.forEach((artifact) =>
		console.log(`- ${artifact.key}: ${artifact.description}`),
	);
	console.log("\nOperational readiness evidence:");
	console.log(`- Status: ${checklist.operationalEvidence.status}`);
	console.log(`- Evidence path: ${checklist.operationalEvidence.evidencePath}`);
	checklist.operationalEvidence.requiredArtifacts.forEach((artifact) =>
		console.log(`- ${artifact.key}: ${artifact.description}`),
	);
	console.log("\nHealthcheck placeholders (not called):");
	console.log(
		`- Backend: ${checklist.environment.healthcheckPlaceholders.backend}`,
	);
	console.log(
		`- Frontend: ${checklist.environment.healthcheckPlaceholders.frontend}`,
	);
	console.log("\nManual go/no-go approvals:");
	checklist.manualGoNoGo.forEach((item) => console.log(`- ${item}`));
	console.log("\nRequired sign-off roles:");
	checklist.releaseGate.signOffRoles.forEach((role) =>
		console.log(`- ${role}`),
	);
}

function printHelp() {
	console.log(
		`MathAI Phase 6 deployment verification checklist\n\nUsage:\n  node scripts/deploy-verification-checklist.js [--dry-run] [--json] [--expected-branch=feat/phase-6-deploy-safety] [--student-smoke-evidence=path] [--operational-evidence=path] [--backup-restore-evidence=path]\n\nSafety:\n  - Dry-run is the default.\n  - The script performs local filesystem and Git checks only.\n  - It never calls production, health URLs, MongoDB, or external services.\n  - It never prints secret values.\n`,
	);
}

function main(argv = process.argv.slice(2)) {
	const options = parseArgs(argv);

	if (options.help) {
		printHelp();
		return;
	}

	const checklist = buildChecklist(options);

	if (options.json) {
		console.log(JSON.stringify(checklist, null, 2));
	} else {
		printChecklist(checklist);
	}

	if (!options.dryRun) {
		console.error(
			"Refusing to execute deployment operations. This Phase 6 script is local-check/dry-run only.",
		);
		process.exitCode = 2;
	}
}

if (require.main === module) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

module.exports = {
	buildBackupRestoreEvidence,
	buildChecklist,
	buildEnvSnapshot,
	buildFeatureFlagSnapshot,
	buildOperationalReadinessEvidence,
	buildReleaseGate,
	buildStudentSmokeEvidence,
	maskValue,
	parseArgs,
};
