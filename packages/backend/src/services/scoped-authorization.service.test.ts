import assert from "node:assert/strict";
import test from "node:test";

import { ScopedAuthorizationService } from "./scoped-authorization.service";
import type { PermissionGrantRepository } from "../models/permission-grant.model";
import { parentChildRepository } from "../models/parent-child.model";
import { teacherAssignmentRepository, teacherClassRepository } from "../models/teacher.model";

const serviceWithGrants = (grants: Array<{ effect: "allow" | "deny" }>) =>
	new ScopedAuthorizationService({
		permissionGrants: {
			findMatchingGrants: async () => grants,
		} as unknown as PermissionGrantRepository,
	});

test("scoped authorization fails closed when actor is missing", async () => {
	const service = serviceWithGrants([]);

	const decision = await service.canAccess({
		resourceType: "student",
		resourceId: "student-1",
		action: "read",
	});

	assert.deepEqual(decision, { allowed: false, reason: "missing_actor" });
});

test("scoped authorization grants admin bypass without requiring scope", async () => {
	const service = serviceWithGrants([]);

	const decision = await service.canAccess({
		actor: { id: "admin-1", role: "admin" },
		resourceType: "student",
		action: "read",
	});

	assert.deepEqual(decision, { allowed: true, reason: "admin_bypass" });
});

test("scoped authorization fails closed when non-admin request has no resource id or scope", async () => {
	const service = serviceWithGrants([]);

	const decision = await service.canAccess({
		actor: { id: "teacher-1", role: "teacher" },
		resourceType: "student",
		action: "read",
	});

	assert.deepEqual(decision, { allowed: false, reason: "missing_scope" });
});

test("scoped authorization allows matching explicit permission grant", async () => {
	const service = serviceWithGrants([{ effect: "allow" }]);

	const decision = await service.canAccess({
		actor: { id: "teacher-1", role: "teacher" },
		resourceType: "report",
		resourceId: "report-1",
		action: "read",
		permission: "report:read",
	});

	assert.deepEqual(decision, { allowed: true, reason: "grant_allow" });
});

test("scoped authorization deny grant takes precedence over allow", async () => {
	const service = serviceWithGrants([{ effect: "allow" }, { effect: "deny" }]);

	const decision = await service.canAccess({
		actor: { id: "teacher-1", role: "teacher" },
		resourceType: "report",
		resourceId: "report-1",
		action: "read",
		permission: "report:read",
	});

	assert.deepEqual(decision, { allowed: false, reason: "grant_deny" });
});

test("scoped authorization allows teacher assigned to class", async (t) => {
	const originalFindById = teacherClassRepository.findById;
	t.after(() => {
		teacherClassRepository.findById = originalFindById;
	});

	teacherClassRepository.findById = async () => ({ teacher_id: "teacher-1" }) as any;
	const service = serviceWithGrants([]);

	const decision = await service.canAccess({
		actor: { id: "teacher-1", role: "teacher" },
		resourceType: "teacher_class",
		resourceId: "class-1",
		action: "read",
	});

	assert.deepEqual(decision, { allowed: true, reason: "teacher_owns_class" });
});

test("scoped authorization denies teacher for unassigned class", async (t) => {
	const originalFindById = teacherClassRepository.findById;
	t.after(() => {
		teacherClassRepository.findById = originalFindById;
	});

	teacherClassRepository.findById = async () => ({ teacher_id: "teacher-2" }) as any;
	const service = serviceWithGrants([]);

	const decision = await service.canAccess({
		actor: { id: "teacher-1", role: "teacher" },
		resourceType: "teacher_class",
		resourceId: "class-1",
		action: "read",
	});

	assert.deepEqual(decision, { allowed: false, reason: "no_matching_rule" });
});

test("scoped authorization allows teacher assigned to assignment", async (t) => {
	const originalFindById = teacherAssignmentRepository.findById;
	t.after(() => {
		teacherAssignmentRepository.findById = originalFindById;
	});

	teacherAssignmentRepository.findById = async () => ({ teacher_id: "teacher-1" }) as any;
	const service = serviceWithGrants([]);

	const decision = await service.canAccess({
		actor: { id: "teacher-1", role: "teacher" },
		resourceType: "teacher_assignment",
		resourceId: "assignment-1",
		action: "read",
	});

	assert.deepEqual(decision, { allowed: true, reason: "teacher_owns_assignment" });
});

test("scoped authorization allows parent linked to child", async (t) => {
	const originalFindRelation = parentChildRepository.findRelation;
	t.after(() => {
		parentChildRepository.findRelation = originalFindRelation;
	});

	parentChildRepository.findRelation = async () => ({ parent_user_id: "parent-1", student_id: "student-1" }) as any;
	const service = serviceWithGrants([]);

	const decision = await service.canAccess({
		actor: { id: "parent-1", role: "parent" },
		resourceType: "student",
		resourceId: "student-1",
		action: "read",
	});

	assert.deepEqual(decision, { allowed: true, reason: "parent_child_relation" });
});

test("scoped authorization denies parent without child link", async (t) => {
	const originalFindRelation = parentChildRepository.findRelation;
	t.after(() => {
		parentChildRepository.findRelation = originalFindRelation;
	});

	parentChildRepository.findRelation = async () => null;
	const service = serviceWithGrants([]);

	const decision = await service.canAccess({
		actor: { id: "parent-1", role: "parent" },
		resourceType: "student",
		resourceId: "student-1",
		action: "read",
	});

	assert.deepEqual(decision, { allowed: false, reason: "no_matching_rule" });
});
