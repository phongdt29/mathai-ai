import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const adminRoutesSource = readFileSync(
	join(__dirname, "admin.routes.ts"),
	"utf8",
);

test("AI provider admin mutations are wired to audit logging", () => {
	assert.match(
		adminRoutesSource,
		/auditService\.recordFromRequest\(req, \{[\s\S]*action: "ai_provider\.create"/,
	);
	assert.match(
		adminRoutesSource,
		/auditService\.recordFromRequest\(req, \{[\s\S]*action: "ai_provider\.update"/,
	);
	assert.match(
		adminRoutesSource,
		/auditService\.recordFromRequest\(req, \{[\s\S]*action: "ai_provider\.activate"/,
	);
	assert.match(
		adminRoutesSource,
		/auditService\.recordFromRequest\(req, \{[\s\S]*action: "ai_provider\.delete"/,
	);
	assert.match(adminRoutesSource, /resourceType: "ai_provider"/);
	assert.match(adminRoutesSource, /before:/);
	assert.match(adminRoutesSource, /after:/);
});

test("AI provider admin routes are admin-only and return readable Vietnamese messages", () => {
	for (const routePattern of [
		/router\.get\(\s*"\/ai\/providers",\s*requireAdminOnly/,
		/router\.post\(\s*"\/ai\/providers",\s*requireAdminOnly/,
		/router\.put\(\s*"\/ai\/providers\/:id",\s*requireAdminOnly/,
		/router\.post\(\s*"\/ai\/providers\/:id\/activate",\s*requireAdminOnly/,
		/router\.delete\(\s*"\/ai\/providers\/:id",\s*requireAdminOnly/,
	]) {
		assert.match(adminRoutesSource, routePattern);
	}

	assert.match(adminRoutesSource, /message: "Đã tạo AI provider"/);
	assert.match(adminRoutesSource, /message: "Đã cập nhật AI provider"/);
	assert.match(adminRoutesSource, /message: "Đã kích hoạt AI provider"/);
	assert.match(adminRoutesSource, /message: "Đã xóa AI provider"/);
	assert.doesNotMatch(adminRoutesSource, /message: "\?\?/);
});
