import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";

import { requireScopedAccess } from "./scoped-authorization";
import { auditService } from "../services/audit.service";
import { ForbiddenError } from "../utils/errors";

const makeRequest = (overrides: Partial<Request> = {}): Request =>
	({
		params: {},
		query: {},
		body: {},
		...overrides,
	} as Request);

const callMiddleware = async (req: Request) => {
	const calls: Array<[] | [unknown]> = [];
	const next: NextFunction = (error?: unknown): void => {
		if (error === undefined) {
			calls.push([]);
			return;
		}
		calls.push([error]);
	};

	await requireScopedAccess({
		resourceType: "student",
		action: "read",
		resourceId: { source: "params", field: "studentId" },
	})(req, {} as Response, next);

	return calls;
};

test("requireScopedAccess fails closed when request user is missing", async (t) => {
	const originalRecordFromRequest = auditService.recordFromRequest;
	const auditedDeniedEvents: unknown[] = [];
	auditService.recordFromRequest = async (_req, input) => {
		auditedDeniedEvents.push(input);
		return null;
	};
	t.after(() => {
		auditService.recordFromRequest = originalRecordFromRequest;
	});

	const calls = await callMiddleware(
		makeRequest({ params: { studentId: "student-profile-1" } as any }),
	);

	assert.equal(calls.length, 1);
	assert.ok(calls[0]?.[0] instanceof ForbiddenError);
	assert.equal(auditedDeniedEvents.length, 1);
	assert.match(
		(auditedDeniedEvents[0] as { action: string }).action,
		/^scoped_access_denied:/,
	);
});

test("requireScopedAccess allows admin bypass", async () => {
	const calls = await callMiddleware(
		makeRequest({
			params: { studentId: "student-profile-1" } as any,
			user: { id: "admin-1", email: "admin@example.com", role: "admin" },
		}),
	);

	assert.equal(calls.length, 1);
	assert.equal(calls[0]?.length, 0);
});
