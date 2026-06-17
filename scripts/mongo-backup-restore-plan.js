#!/usr/bin/env node

const path = require("path");

const SENSITIVE_PATTERN =
	/(password|passwd|pwd|secret|token|api[_-]?key|authorization|credential|config|uri|url|connection|string)/i;
const EVIDENCE_SECRET_KEY_PATTERN =
	/(password|passwd|pwd|secret|token|api[_-]?key|authorization|credential|connection[_-]?string|mongodb[_-]?uri|database[_-]?url)/i;
const EVIDENCE_SECRET_VALUE_PATTERN =
	/(mongodb(?:\+srv)?:\/\/|postgres(?:ql)?:\/\/|mysql:\/\/|redis:\/\/|bearer\s+[a-z0-9._~+/-]+=*|password\s*[=:]|secret\s*[=:]|token\s*[=:]|api[_-]?key\s*[=:]|sk-[a-z0-9]{12,}|eyj[a-z0-9_-]{20,})/i;
const EVIDENCE_WEBHOOK_URL_PATTERN =
	/https:\/\/(?:hooks\.slack\.com|discord(?:app)?\.com\/api\/webhooks|[^\s/]+\.webhook\.[^\s/]+|[^\s/]+\/webhook[s]?\/)[^\s]*/i;
const EVIDENCE_USER_EMAIL_KEY_PATTERN = /(?:^|[_-])user[_-]?email(?:$|[_-])/i;
const EVIDENCE_USER_EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function parseArgs(argv = process.argv.slice(2)) {
	const options = {
		dryRun: true,
		mode: "backup",
		outputDir: "backups/mongodb",
		includeObjects: true,
		includeConfig: true,
	};

	for (const arg of argv) {
		if (arg === "--help" || arg === "-h") {
			options.help = true;
		} else if (arg === "--restore") {
			options.mode = "restore";
		} else if (arg === "--backup") {
			options.mode = "backup";
		} else if (arg === "--execute") {
			options.dryRun = false;
		} else if (arg === "--dry-run") {
			options.dryRun = true;
		} else if (arg === "--no-objects") {
			options.includeObjects = false;
		} else if (arg === "--no-config") {
			options.includeConfig = false;
		} else if (arg.startsWith("--output-dir=")) {
			options.outputDir =
				arg.slice("--output-dir=".length) || options.outputDir;
		} else if (arg.startsWith("--backup-file=")) {
			options.backupFile = arg.slice("--backup-file=".length);
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return options;
}

function maskValue(key, value) {
	if (value === undefined || value === "") {
		return "<not-set>";
	}

	return SENSITIVE_PATTERN.test(key) ? "<redacted>" : value;
}

function getSanitizedEnvironment(env = process.env) {
	return {
		NODE_ENV: maskValue("NODE_ENV", env.NODE_ENV),
		DB_NAME: maskValue("DB_NAME", env.DB_NAME || "mathai"),
		MONGODB_URI: maskValue("MONGODB_URI", env.MONGODB_URI),
		BACKUP_OBJECT_ROOT: maskValue(
			"BACKUP_OBJECT_ROOT",
			env.BACKUP_OBJECT_ROOT || "uploads",
		),
		BACKUP_CONFIG_ROOT: maskValue(
			"BACKUP_CONFIG_ROOT",
			env.BACKUP_CONFIG_ROOT ||
				".env.example deploy/.env.example packages/backend/.env.example",
		),
	};
}

function buildTimestamp(date = new Date()) {
	return date.toISOString().replace(/[:.]/g, "-");
}

function buildDrillEvidence(mode, dbName, timestamp) {
	const canonicalManifestPath =
		"artifacts/deployment/backup-restore-evidence.json";

	return {
		status: "evidence_required",
		evidencePath: canonicalManifestPath,
		requiredArtifacts: [
			{
				key: "rto",
				description:
					"Recovery Time Objective target, observed restore rehearsal duration, and sanitized evidence summary.",
			},
			{
				key: "rpo",
				description:
					"Recovery Point Objective target, observed backup/checkpoint gap, and sanitized evidence summary.",
			},
			{
				key: "backup_artifact",
				description:
					"Redacted backup archive metadata: artifact path/reference, SHA-256, size, creation time, storage location, retention, and metadata_redacted=true.",
			},
			{
				key: "restore_to_staging",
				description:
					"Restore-to-staging dry-run and validation log paths with status passed; no production restore is executed.",
			},
			{
				key: "validations",
				description:
					"Checksum verification, source/restored collection counts with match=true, and critical workflow smoke evidence.",
			},
			{
				key: "approvals",
				description:
					"Data owner, deployment owner, release manager placeholders, and approved_for_production_restore=false for drills.",
			},
		],
		acceptanceCriteria: [
			"RTO and RPO targets and observed drill values are recorded and within target.",
			"Backup archive metadata is redacted and includes SHA-256, size, creation time, storage location, and retention.",
			"Restore-to-staging dry-run and validation evidence is recorded without executing production restore.",
			"Checksum verification and restored staging collection counts all pass.",
			"Approval/signoff placeholders are present and production restore approval remains false for the drill.",
		],
		signOffRoles: [
			"Data owner",
			"Deployment owner",
			"Release manager or incident commander",
		],
		manifestTemplate: {
			generated_at: timestamp,
			environment: "<production-like-staging>",
			drill_id: `<${mode}-${dbName}-backup-restore-drill-id>`,
			status: "passed",
			rto: {
				target_minutes: 60,
				observed_minutes: "<observed-restore-rehearsal-minutes>",
				evidence: "<sanitized-rto-evidence-summary-or-path>",
			},
			rpo: {
				target_minutes: 15,
				observed_minutes: "<observed-backup-gap-minutes>",
				evidence: "<sanitized-rpo-evidence-summary-or-path>",
			},
			backup_artifact: {
				archive_path: "<redacted-immutable-artifact-reference>",
				sha256: "<64-character-sha256>",
				size_bytes: "<positive-byte-count>",
				created_at: "<iso-8601-timestamp>",
				storage_location: "<redacted-storage-location-or-ticket-reference>",
				retention_until: "<iso-8601-timestamp>",
				metadata_redacted: true,
			},
			restore_to_staging: {
				target_environment: "<isolated-staging-restore-environment>",
				dry_run_log_path: "<sanitized-dry-run-log-path>",
				validation_log_path: "<sanitized-validation-log-path>",
				status: "passed",
			},
			validations: {
				checksum_verified: true,
				collection_counts: [
					{
						collection: "<collection-name>",
						source_count: "<non-negative-count>",
						restored_count: "<matching-non-negative-count>",
						match: true,
					},
				],
				critical_workflows: [
					{
						name: "<workflow-name>",
						status: "passed",
						evidence: "<sanitized-workflow-evidence>",
					},
				],
			},
			approvals: {
				data_owner: "<pending-data-owner-signoff>",
				deployment_owner: "<pending-deployment-owner-signoff>",
				release_manager: "<pending-release-manager-signoff>",
				approved_for_production_restore: false,
			},
		},
	};
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
			if (EVIDENCE_USER_EMAIL_KEY_PATTERN.test(key)) {
				findings.push(`${nestedPath} (user email)`);
			}
			findings.push(...findSecretLikeEvidenceEntries(nestedValue, nestedPath));
		}
		return findings;
	}

	if (typeof value === "string" && EVIDENCE_SECRET_VALUE_PATTERN.test(value)) {
		findings.push(currentPath);
	}
	if (typeof value === "string" && EVIDENCE_WEBHOOK_URL_PATTERN.test(value)) {
		findings.push(`${currentPath} (webhook URL)`);
	}
	if (typeof value === "string" && EVIDENCE_USER_EMAIL_PATTERN.test(value)) {
		findings.push(`${currentPath} (user email)`);
	}

	return findings;
}

function requireString(errors, manifest, key, label) {
	if (typeof manifest[key] !== "string" || manifest[key].trim() === "") {
		errors.push(`${label}.${key} must be a non-empty string.`);
	}
}

function validateObjective(errors, manifest, key) {
	const objective = manifest[key];
	if (!objective || typeof objective !== "object" || Array.isArray(objective)) {
		errors.push(`${key} must be an object.`);
		return;
	}

	if (
		!Number.isFinite(objective.target_minutes) ||
		objective.target_minutes <= 0
	) {
		errors.push(`${key}.target_minutes must be a positive number.`);
	}
	if (
		!Number.isFinite(objective.observed_minutes) ||
		objective.observed_minutes < 0
	) {
		errors.push(`${key}.observed_minutes must be a non-negative number.`);
	} else if (
		Number.isFinite(objective.target_minutes) &&
		objective.observed_minutes > objective.target_minutes
	) {
		errors.push(`${key}.observed_minutes must be within target_minutes.`);
	}
	requireString(errors, objective, "evidence", key);
}

function validateBackupRestoreEvidenceManifest(manifest) {
	const errors = [];

	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		return {
			valid: false,
			errors: ["Backup/restore evidence manifest must be a JSON object."],
		};
	}

	requireString(errors, manifest, "generated_at", "manifest");
	requireString(errors, manifest, "environment", "manifest");
	requireString(errors, manifest, "drill_id", "manifest");
	if (manifest.status !== "passed") {
		errors.push('manifest.status must equal "passed".');
	}

	validateObjective(errors, manifest, "rto");
	validateObjective(errors, manifest, "rpo");

	const artifact = manifest.backup_artifact;
	if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
		errors.push("backup_artifact must be an object.");
	} else {
		requireString(errors, artifact, "archive_path", "backup_artifact");
		if (
			typeof artifact.sha256 !== "string" ||
			!SHA256_PATTERN.test(artifact.sha256)
		) {
			errors.push(
				"backup_artifact.sha256 must be a 64-character hex SHA-256 value.",
			);
		}
		if (!Number.isFinite(artifact.size_bytes) || artifact.size_bytes <= 0) {
			errors.push("backup_artifact.size_bytes must be a positive number.");
		}
		requireString(errors, artifact, "created_at", "backup_artifact");
		requireString(errors, artifact, "storage_location", "backup_artifact");
		requireString(errors, artifact, "retention_until", "backup_artifact");
		if (artifact.metadata_redacted !== true) {
			errors.push("backup_artifact.metadata_redacted must equal true.");
		}
	}

	const restore = manifest.restore_to_staging;
	if (!restore || typeof restore !== "object" || Array.isArray(restore)) {
		errors.push("restore_to_staging must be an object.");
	} else {
		requireString(errors, restore, "target_environment", "restore_to_staging");
		requireString(errors, restore, "dry_run_log_path", "restore_to_staging");
		requireString(errors, restore, "validation_log_path", "restore_to_staging");
		if (restore.status !== "passed") {
			errors.push('restore_to_staging.status must equal "passed".');
		}
	}

	const validations = manifest.validations;
	if (
		!validations ||
		typeof validations !== "object" ||
		Array.isArray(validations)
	) {
		errors.push("validations must be an object.");
	} else {
		if (validations.checksum_verified !== true) {
			errors.push("validations.checksum_verified must equal true.");
		}
		if (
			!Array.isArray(validations.collection_counts) ||
			validations.collection_counts.length === 0
		) {
			errors.push("validations.collection_counts must be a non-empty array.");
		} else {
			validations.collection_counts.forEach((entry, index) => {
				const entryPath = `validations.collection_counts[${index}]`;
				if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
					errors.push(`${entryPath} must be an object.`);
					return;
				}
				requireString(errors, entry, "collection", entryPath);
				if (!Number.isInteger(entry.source_count) || entry.source_count < 0) {
					errors.push(
						`${entryPath}.source_count must be a non-negative integer.`,
					);
				}
				if (
					!Number.isInteger(entry.restored_count) ||
					entry.restored_count < 0
				) {
					errors.push(
						`${entryPath}.restored_count must be a non-negative integer.`,
					);
				}
				if (
					entry.match !== true ||
					entry.source_count !== entry.restored_count
				) {
					errors.push(`${entryPath} counts must match.`);
				}
			});
		}
		if (
			!Array.isArray(validations.critical_workflows) ||
			validations.critical_workflows.length === 0
		) {
			errors.push("validations.critical_workflows must be a non-empty array.");
		} else {
			validations.critical_workflows.forEach((workflow, index) => {
				const workflowPath = `validations.critical_workflows[${index}]`;
				if (
					!workflow ||
					typeof workflow !== "object" ||
					Array.isArray(workflow)
				) {
					errors.push(`${workflowPath} must be an object.`);
					return;
				}
				requireString(errors, workflow, "name", workflowPath);
				if (workflow.status !== "passed") {
					errors.push(`${workflowPath}.status must equal "passed".`);
				}
				requireString(errors, workflow, "evidence", workflowPath);
			});
		}
	}

	const approvals = manifest.approvals;
	if (!approvals || typeof approvals !== "object" || Array.isArray(approvals)) {
		errors.push("approvals must be an object.");
	} else {
		for (const key of ["data_owner", "deployment_owner", "release_manager"]) {
			requireString(errors, approvals, key, "approvals");
		}
		if (approvals.approved_for_production_restore !== false) {
			errors.push(
				"approvals.approved_for_production_restore must equal false for dry-run drills.",
			);
		}
	}

	const secretLikePaths = findSecretLikeEvidenceEntries(manifest);
	if (secretLikePaths.length > 0) {
		errors.push(
			`Backup/restore evidence manifest contains secret-like keys or values at: ${secretLikePaths.join(", ")}`,
		);
	}

	return { valid: errors.length === 0, errors };
}

function buildPlan(options, env = process.env, date = new Date()) {
	const dbName = env.DB_NAME || "mathai";
	const timestamp = buildTimestamp(date);
	const outputDir = path.posix.normalize(options.outputDir.replace(/\\/g, "/"));
	const archivePath = `${outputDir}/${dbName}-${timestamp}.archive.gz`;
	const backupFile = options.backupFile || archivePath;

	const commands = [];
	const preflight = [
		"Verify current Git commit/tag and create a deployment checkpoint tag before any migration.",
		"Confirm MONGODB_URI is loaded from a protected secret store; do not paste it into logs.",
		"Run this plan in dry-run first and store command output with the deployment ticket.",
	];

	if (options.mode === "backup") {
		commands.push(
			`mongodump --uri "<redacted MONGODB_URI>" --db "${dbName}" --archive="${archivePath}" --gzip`,
			`mongorestore --uri "<redacted TEST_MONGODB_URI>" --nsFrom "${dbName}.*" --nsTo "${dbName}_restore_test.*" --archive="${archivePath}" --gzip --dryRun`,
			`node -e "require('crypto').createHash('sha256').update(require('fs').readFileSync('${archivePath}')).digest('hex')" > "${archivePath}.sha256"`,
		);
	} else {
		commands.push(
			`mongorestore --uri "<redacted MONGODB_URI>" --db "${dbName}" --archive="${backupFile}" --gzip --dryRun`,
			`mongorestore --uri "<redacted TEST_MONGODB_URI>" --db "${dbName}_restore_test" --archive="${backupFile}" --gzip`,
			`git checkout <rollback-tag> -- . && npm run build:backend`,
		);
	}

	if (options.includeObjects) {
		commands.push(
			"Copy object artifacts (uploads/private object store) to immutable backup storage with checksum manifest.",
		);
	}

	if (options.includeConfig) {
		commands.push(
			"Export sanitized config artifact inventory from secret manager keys, deployment manifests, and .env.example templates.",
		);
	}

	return {
		mode: options.mode,
		dryRun: options.dryRun,
		timestamp,
		sanitizedEnvironment: getSanitizedEnvironment(env),
		preflight,
		commands,
		rollback: [
			"Stop writes or put application in maintenance mode before restore.",
			"Restore MongoDB into a staging database first and compare counts/checksums.",
			"Rollback application code to the last known-good Git tag when data contract changes are involved.",
			"Only run destructive restore commands after explicit human approval and verified backups.",
		],
		drillEvidence: buildDrillEvidence(options.mode, dbName, timestamp),
	};
}

function printHelp() {
	console.log(
		`MathAI Mongo-first backup/restore planner\n\nUsage:\n  node scripts/mongo-backup-restore-plan.js [--backup|--restore] [--dry-run] [--output-dir=backups/mongodb]\n\nSafety:\n  - Dry-run is the default.\n  - The script prints a plan only; it does not call MongoDB, delete data, or print secret values.\n  - --execute is accepted for future automation metadata, but this Phase 6.2 script still never executes commands.\n`,
	);
}

function main(argv = process.argv.slice(2)) {
	const options = parseArgs(argv);

	if (options.help) {
		printHelp();
		return;
	}

	const plan = buildPlan(options);
	console.log(JSON.stringify(plan, null, 2));

	if (!options.dryRun) {
		console.error(
			"Refusing to execute commands in Phase 6.2. Use the runbook for manual, approved execution.",
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
	buildDrillEvidence,
	buildPlan,
	getSanitizedEnvironment,
	maskValue,
	parseArgs,
	validateBackupRestoreEvidenceManifest,
};
