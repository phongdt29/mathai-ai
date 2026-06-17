import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";

import { requireRole } from "./role";
import { ForbiddenError } from "../utils/errors";
import type { UserRole } from "../types";

type NextCall = [] | [unknown];

const makeRequest = (role?: UserRole): Request =>
	({
		user: role
			? {
					id: "user-1",
					email: "user@example.com",
					role,
				}
			: undefined,
	} as Request);

const callRequireRole = (req: Request, ...roles: UserRole[]) => {
	const calls: NextCall[] = [];
	const next: NextFunction = (error?: unknown): void => {
		if (error === undefined) {
			calls.push([]);
			return;
		}
		calls.push([error]);
	};

	requireRole(...roles)(req, {} as Response, next);
	return calls;
};

test("requireRole allows users with an explicitly permitted role", () => {
	const calls = callRequireRole(makeRequest("admin"), "admin", "teacher");

	assert.equal(calls.length, 1);
	assert.equal(calls[0]?.length, 0);
});

test("requireRole rejects authenticated users whose role is not permitted", () => {
	const calls = callRequireRole(makeRequest("student"), "admin", "teacher");

	assert.equal(calls.length, 1);
	assert.ok(calls[0]?.[0] instanceof ForbiddenError);
	assert.equal(
		(calls[0]?.[0] as ForbiddenError).message,
		"Bạn không có quyền truy cập tài nguyên này",
	);
});

test("requireRole fails closed when request user is missing", () => {
	const calls = callRequireRole(makeRequest(), "admin");

	assert.equal(calls.length, 1);
	assert.ok(calls[0]?.[0] instanceof ForbiddenError);
});
