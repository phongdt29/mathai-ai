const assert = require("node:assert/strict");
const test = require("node:test");

const {
	buildPlan,
	validateBackupRestoreEvidenceManifest,
	getSanitizedEnvironment,
	parseArgs,
} = require("./mongo-backup-restore-plan");

function buildValidBackupRestoreEvidence(overrides = {}) {
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

test("mongo backup planner defaults to safe dry-run backup mode", () => {
	const options = parseArgs([]);
	const plan = buildPlan(
		options,
		{
			MONGODB_URI: "mongodb://user:password@example.invalid/mathai",
			DB_NAME: "mathai_test",
		},
		new Date("2026-05-06T00:00:00.000Z"),
	);

	assert.equal(plan.mode, "backup");
	assert.equal(plan.dryRun, true);
	assert.equal(plan.sanitizedEnvironment.MONGODB_URI, "<redacted>");
	assert.match(plan.commands[0], /mongodump/);
	assert.equal(plan.drillEvidence.status, "evidence_required");
	assert.ok(
		plan.drillEvidence.requiredArtifacts.some(
			(artifact) => artifact.key === "restore_to_staging",
		),
	);
	assert.doesNotMatch(JSON.stringify(plan), /password@example/);
});

test("mongo restore planner keeps restore commands dry-run by default", () => {
	const options = parseArgs([
		"--restore",
		"--backup-file=backups/mongodb/mathai.archive.gz",
	]);
	const plan = buildPlan(
		options,
		{ DB_NAME: "mathai" },
		new Date("2026-05-06T00:00:00.000Z"),
	);

	assert.equal(plan.mode, "restore");
	assert.equal(plan.dryRun, true);
	assert.match(plan.commands[0], /mongorestore/);
	assert.match(plan.commands[0], /--dryRun/);
	assert.match(plan.rollback.join("\n"), /Git tag/);
	assert.ok(
		plan.drillEvidence.acceptanceCriteria.includes(
			"Checksum verification and restored staging collection counts all pass.",
		),
	);
});

test("backup planner exposes a release-ready evidence manifest template", () => {
	const plan = buildPlan(
		parseArgs(["--backup"]),
		{
			MONGODB_URI: "mongodb://user:password@example.invalid/mathai",
			DB_NAME: "mathai_prod",
		},
		new Date("2026-05-06T00:00:00.000Z"),
	);

	assert.deepEqual(plan.drillEvidence.signOffRoles, [
		"Data owner",
		"Deployment owner",
		"Release manager or incident commander",
	]);
	assert.equal(
		plan.drillEvidence.evidencePath,
		"artifacts/deployment/backup-restore-evidence.json",
	);
	assert.deepEqual(Object.keys(plan.drillEvidence.manifestTemplate), [
		"generated_at",
		"environment",
		"drill_id",
		"status",
		"rto",
		"rpo",
		"backup_artifact",
		"restore_to_staging",
		"validations",
		"approvals",
	]);
	assert.equal(
		plan.drillEvidence.manifestTemplate.backup_artifact.metadata_redacted,
		true,
	);
	assert.equal(
		plan.drillEvidence.manifestTemplate.approvals
			.approved_for_production_restore,
		false,
	);
	assert.doesNotMatch(JSON.stringify(plan.drillEvidence), /password@example/);
});

test("sanitized environment never prints secret-like values", () => {
	const sanitized = getSanitizedEnvironment({
		NODE_ENV: "production",
		DB_NAME: "mathai",
		MONGODB_URI: "mongodb://secret-host",
		BACKUP_OBJECT_ROOT: "uploads",
		BACKUP_CONFIG_ROOT: "secret-config-root",
	});

	assert.equal(sanitized.NODE_ENV, "production");
	assert.equal(sanitized.DB_NAME, "mathai");
	assert.equal(sanitized.MONGODB_URI, "<redacted>");
	assert.equal(sanitized.BACKUP_CONFIG_ROOT, "<redacted>");
});

test("backup restore evidence validator accepts canonical redacted drill evidence", () => {
	const result = validateBackupRestoreEvidenceManifest(
		buildValidBackupRestoreEvidence(),
	);

	assert.equal(result.valid, true);
	assert.deepEqual(result.errors, []);
});

test("backup restore evidence validator rejects malformed drill evidence", () => {
	const result = validateBackupRestoreEvidenceManifest(
		buildValidBackupRestoreEvidence({
			status: "failed",
			rto: { target_minutes: 60, observed_minutes: 90, evidence: "late" },
			backup_artifact: {
				archive_path: "immutable://backup-vault/mathai/archive-redacted.gz",
				sha256: "not-a-sha256",
				size_bytes: 0,
				created_at: "2026-05-12T00:00:00.000Z",
				storage_location: "immutable backup vault path recorded in ticket",
				retention_until: "2026-08-12T00:00:00.000Z",
				metadata_redacted: false,
			},
			validations: {
				checksum_verified: false,
				collection_counts: [
					{
						collection: "users",
						source_count: 25,
						restored_count: 24,
						match: false,
					},
				],
				critical_workflows: [],
			},
		}),
	);

	assert.equal(result.valid, false);
	assert.match(result.errors.join("\n"), /status must equal "passed"/);
	assert.match(result.errors.join("\n"), /rto\.observed_minutes/);
	assert.match(result.errors.join("\n"), /backup_artifact\.sha256/);
	assert.match(result.errors.join("\n"), /metadata_redacted/);
	assert.match(result.errors.join("\n"), /checksum_verified/);
	assert.match(
		result.errors.join("\n"),
		/collection_counts\[0\] counts must match/,
	);
});

test("backup restore evidence validator rejects secret-containing evidence", () => {
	const result = validateBackupRestoreEvidenceManifest(
		buildValidBackupRestoreEvidence({
			backup_artifact: {
				...buildValidBackupRestoreEvidence().backup_artifact,
				archive_path:
					"mongodb://user:password@example.invalid/mathai/archive.gz",
			},
		}),
	);

	assert.equal(result.valid, false);
	assert.match(result.errors.join("\n"), /secret-like/);
});

test("backup restore evidence validator rejects webhook URLs and user emails", () => {
	const webhookCases = [
		"https://hooks.slack.com/services/T000/B000/secret",
		"https://discord.com/api/webhooks/123/secret",
		"https://discordapp.com/api/webhooks/123/secret",
	];

	for (const webhookUrl of webhookCases) {
		const result = validateBackupRestoreEvidenceManifest(
			buildValidBackupRestoreEvidence({
				restore_to_staging: {
					...buildValidBackupRestoreEvidence().restore_to_staging,
					validation_log_path: webhookUrl,
				},
			}),
		);

		assert.equal(result.valid, false);
		assert.match(result.errors.join("\n"), /webhook URL/i);
	}

	const userEmailValue = validateBackupRestoreEvidenceManifest(
		buildValidBackupRestoreEvidence({
			validations: {
				...buildValidBackupRestoreEvidence().validations,
				critical_workflows: [
					{
						name: "auth-readiness-smoke",
						status: "passed",
						evidence: "Student alice@example.com completed auth smoke.",
					},
				],
			},
		}),
	);
	const userEmailKey = validateBackupRestoreEvidenceManifest(
		buildValidBackupRestoreEvidence({
			approvals: {
				...buildValidBackupRestoreEvidence().approvals,
				user_email: "redacted",
			},
		}),
	);

	assert.equal(userEmailValue.valid, false);
	assert.match(userEmailValue.errors.join("\n"), /user email/i);
	assert.equal(userEmailKey.valid, false);
	assert.match(userEmailKey.errors.join("\n"), /user email/i);
});
