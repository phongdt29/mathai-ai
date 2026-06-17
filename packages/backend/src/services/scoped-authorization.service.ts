import type { Request } from "express";
import { parentChildRepository } from "../models/parent-child.model";
import { permissionGrantRepository, type PermissionGrantRepository } from "../models/permission-grant.model";
import { StudentProfileModel } from "../models/student.model";
import { teacherAssignmentRepository, teacherClassRepository } from "../models/teacher.model";
import type { UserRole } from "../types";

export type ScopedResourceType = "student" | "teacher_class" | "teacher_assignment" | string;
export type ScopedAction = "read" | "create" | "update" | "delete" | string;
export type ScopeSource = "params" | "query" | "body";

export interface ActorContext {
	id: string;
	email?: string;
	role: UserRole;
}

export interface ScopedAuthorizationInput {
	actor?: ActorContext;
	resourceType: ScopedResourceType;
	resourceId?: string | null;
	action: ScopedAction;
	permission?: string;
	scope?: string | null;
}

export interface ScopedAuthorizationDecision {
	allowed: boolean;
	reason:
		| "missing_actor"
		| "missing_scope"
		| "admin_bypass"
		| "student_owns_profile"
		| "teacher_owns_class"
		| "teacher_owns_assignment"
		| "teacher_has_student_in_class"
		| "parent_child_relation"
		| "grant_allow"
		| "grant_deny"
		| "no_matching_rule";
}

export interface ScopedAuthorizationDependencies {
	permissionGrants?: PermissionGrantRepository;
}

const idsEqual = (left?: unknown, right?: unknown): boolean => {
	if (!left || !right) return false;
	return String(left) === String(right);
};

export class ScopedAuthorizationService {
	private readonly permissionGrants: PermissionGrantRepository;

	constructor(dependencies: ScopedAuthorizationDependencies = {}) {
		this.permissionGrants = dependencies.permissionGrants ?? permissionGrantRepository;
	}

	public async canAccess(input: ScopedAuthorizationInput): Promise<ScopedAuthorizationDecision> {
		const actor = input.actor;

		if (!actor?.id || !actor.role) {
			return { allowed: false, reason: "missing_actor" };
		}

		if (actor.role === "admin") {
			return { allowed: true, reason: "admin_bypass" };
		}

		if (!input.resourceId && !input.scope) {
			return { allowed: false, reason: "missing_scope" };
		}

		const ownershipDecision = await this.evaluateOwnership(input);
		if (ownershipDecision.allowed) {
			return ownershipDecision;
		}

		const grantDecision = await this.evaluateGrants(input);
		if (grantDecision) {
			return grantDecision;
		}

		return { allowed: false, reason: "no_matching_rule" };
	}

	private async evaluateOwnership(
		input: ScopedAuthorizationInput,
	): Promise<ScopedAuthorizationDecision> {
		const actor = input.actor!;
		const resourceId = input.resourceId;

		if (!resourceId) {
			return { allowed: false, reason: "missing_scope" };
		}

		if (input.resourceType === "teacher_class" && actor.role === "teacher") {
			const teacherClass = await teacherClassRepository.findById(resourceId);
			if (teacherClass && idsEqual(teacherClass.teacher_id, actor.id)) {
				return { allowed: true, reason: "teacher_owns_class" };
			}
		}

		if (input.resourceType === "teacher_assignment" && actor.role === "teacher") {
			const assignment = await teacherAssignmentRepository.findById(resourceId);
			if (assignment && idsEqual(assignment.teacher_id, actor.id)) {
				return { allowed: true, reason: "teacher_owns_assignment" };
			}
		}

		if (input.resourceType !== "student") {
			return { allowed: false, reason: "no_matching_rule" };
		}

		if (actor.role === "student") {
			const profile = await StudentProfileModel.findById(resourceId).select("user_id").lean().exec();
			if (profile && idsEqual((profile as any).user_id, actor.id)) {
				return { allowed: true, reason: "student_owns_profile" };
			}
		}

		if (actor.role === "parent") {
			const relation = await parentChildRepository.findRelation(actor.id, resourceId);
			if (relation) {
				return { allowed: true, reason: "parent_child_relation" };
			}
		}

		if (actor.role === "teacher") {
			const teacherClass = await teacherClassRepository.model
				.findOne({ teacher_id: actor.id, student_ids: resourceId, is_active: true })
				.select("_id")
				.lean()
				.exec();
			if (teacherClass) {
				return { allowed: true, reason: "teacher_has_student_in_class" };
			}
		}

		return { allowed: false, reason: "no_matching_rule" };
	}

	private async evaluateGrants(
		input: ScopedAuthorizationInput,
	): Promise<ScopedAuthorizationDecision | null> {
		const actor = input.actor!;
		const permission = input.permission ?? `${input.resourceType}:${input.action}`;
		const grants = await this.permissionGrants.findMatchingGrants({
			userId: actor.id,
			role: actor.role,
			permission,
			resourceType: input.resourceType,
			resourceId: input.resourceId,
			action: input.action,
			scope: input.scope,
		});

		if (grants.some((grant) => grant.effect === "deny")) {
			return { allowed: false, reason: "grant_deny" };
		}

		if (grants.some((grant) => grant.effect === "allow")) {
			return { allowed: true, reason: "grant_allow" };
		}

		return null;
	}
}

export const scopedAuthorizationService = new ScopedAuthorizationService();

export const getScopedValue = (
	req: Request,
	source: ScopeSource,
	field: string,
): string | null => {
	const container = source === "params" ? req.params : source === "query" ? req.query : req.body;
	const value = container?.[field];

	if (Array.isArray(value)) {
		return typeof value[0] === "string" ? value[0] : null;
	}

	return typeof value === "string" && value.length > 0 ? value : null;
};
