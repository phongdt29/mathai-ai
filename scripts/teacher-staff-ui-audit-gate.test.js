const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");

const {
	buildTeacherStaffUiAuditEvidence,
	validateTeacherStaffUiAuditEvidence,
} = require("./teacher-staff-ui-audit-gate");

test("teacher/staff UI audit evidence is source-level and explicitly marks browser snapshots unavailable", () => {
	const evidence = buildTeacherStaffUiAuditEvidence({ rootDir });

	assert.equal(evidence.gate, "teacher-staff-ui-source-contracts");
	assert.equal(evidence.status, "passed");
	assert.equal(evidence.browser_snapshot_evidence.status, "unavailable");
	assert.match(
		evidence.browser_snapshot_evidence.reason,
		/no Puppeteer\/Playwright dependency/i,
	);
	assert.equal(evidence.browser_snapshot_evidence.screenshots_captured, false);
	assert.ok(evidence.source_contracts.length >= 5);
	assert.ok(
		evidence.source_contracts.every((contract) => contract.status === "passed"),
	);
	assert.deepEqual(validateTeacherStaffUiAuditEvidence(evidence), []);
});

test("teacher/staff UI audit evidence rejects screenshot claims and secrets", () => {
	const evidence = buildTeacherStaffUiAuditEvidence({ rootDir });
	const invalid = {
		...evidence,
		browser_snapshot_evidence: {
			status: "captured",
			screenshots_captured: true,
			artifacts: ["test-screenshots/teacher.png"],
		},
		sanitization: {
			...evidence.sanitization,
			contains_secrets: true,
		},
	};

	const errors = validateTeacherStaffUiAuditEvidence(invalid);
	assert.ok(
		errors.some((error) =>
			/browser snapshot evidence must be unavailable/i.test(error),
		),
	);
	assert.ok(errors.some((error) => /must not contain secrets/i.test(error)));
});
