import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { canManageUserStatus, canAccessPath } from "./access";

describe("admin user access helpers", () => {
	test("only admins can toggle user account status", () => {
		assert.equal(canManageUserStatus("admin"), true);
		assert.equal(canManageUserStatus("staff"), false);
		assert.equal(canManageUserStatus("teacher"), false);
		assert.equal(canManageUserStatus(null), false);
		assert.equal(canManageUserStatus(undefined), false);
	});
});

describe("canAccessPath", () => {
	test("admin can access all paths", () => {
		assert.equal(canAccessPath("admin", "/admin/ai-providers"), true);
		assert.equal(canAccessPath("admin", "/admin/audit"), true);
		assert.equal(canAccessPath("admin", "/admin/billing"), true);
		assert.equal(canAccessPath("admin", "/admin/users"), true);
		assert.equal(canAccessPath("admin", "/admin/scheduler"), true);
	});

	test("staff cannot access AI providers", () => {
		assert.equal(canAccessPath("staff", "/admin/ai-providers"), false);
		assert.equal(canAccessPath("staff", "/admin/ai-providers/new"), false);
	});

	test("staff cannot access Audit logs", () => {
		assert.equal(canAccessPath("staff", "/admin/audit"), false);
		assert.equal(canAccessPath("staff", "/admin/audit/details"), false);
	});

	test("staff cannot access Billing", () => {
		assert.equal(canAccessPath("staff", "/admin/billing"), false);
		assert.equal(canAccessPath("staff", "/admin/billing/plans"), false);
	});

	test("staff can access other admin paths", () => {
		assert.equal(canAccessPath("staff", "/admin"), true);
		assert.equal(canAccessPath("staff", "/admin/users"), true);
		assert.equal(canAccessPath("staff", "/admin/classes"), true);
		assert.equal(canAccessPath("staff", "/admin/teachers"), true);
		assert.equal(canAccessPath("staff", "/admin/scheduler"), true);
		assert.equal(canAccessPath("staff", "/admin/reports"), true);
		assert.equal(canAccessPath("staff", "/admin/activity"), true);
	});

	test("null/undefined role cannot access any path", () => {
		assert.equal(canAccessPath(null, "/admin"), false);
		assert.equal(canAccessPath(undefined, "/admin/users"), false);
	});

	test("non-admin/staff roles cannot access admin paths", () => {
		assert.equal(canAccessPath("teacher", "/admin"), false);
		assert.equal(canAccessPath("student", "/admin/users"), false);
	});
});
