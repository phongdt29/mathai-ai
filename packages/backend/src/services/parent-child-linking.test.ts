import assert from "node:assert/strict";
import test from "node:test";

import { ParentMonitoringService } from "./parent-monitoring.service";

const studentUser = {
	id: "user-student-1",
	_id: "user-student-1",
	email: "child@example.com",
	full_name: "Nguyễn An",
	role: "student",
	is_active: true,
};

const studentProfile = {
	id: "student-profile-1",
	_id: "student-profile-1",
	user_id: "user-student-1",
	date_of_birth: new Date("2012-04-15T00:00:00.000Z"),
};

function createService(existingRelation: unknown = null) {
	const created: unknown[] = [];
	const deleted: unknown[] = [];
	const service = new ParentMonitoringService() as any;
	service.userRepo = {
		async findByEmail(email: string) {
			return email === "child@example.com" ? studentUser : null;
		},
		async findById(userId: string) {
			return userId === studentUser.id ? studentUser : null;
		},
	};
	service.studentRepo = {
		async findByUserId(userId: string) {
			return userId === studentUser.id ? studentProfile : null;
		},
		async findById(studentId: string) {
			return studentId === studentProfile.id ? studentProfile : null;
		},
	};
	service.parentChildRepository = {
		async findRelation(parentUserId: string, studentId: string) {
			assert.equal(parentUserId, "parent-user-1");
			assert.equal(studentId, studentProfile.id);
			return existingRelation;
		},
		async create(payload: unknown) {
			created.push(payload);
			return payload;
		},
		async deleteRelation(parentUserId: string, studentId: string) {
			deleted.push({ parentUserId, studentId });
			return Boolean(existingRelation);
		},
	};
	return { service, created, deleted };
}

test("linkChild verifies student email and birth date before creating relation", async () => {
	const { service, created } = createService();

	const result = await service.linkChild("parent-user-1", {
		student_email: " Child@Example.com ",
		date_of_birth: "2012-04-15",
	});

	assert.deepEqual(created, [
		{
			parent_user_id: "parent-user-1",
			student_id: studentProfile.id,
		},
	]);
	assert.deepEqual(result, {
		student_id: studentProfile.id,
		full_name: studentUser.full_name,
		already_linked: false,
	});
});

test("linkChild returns the existing child without creating duplicates", async () => {
	const { service, created } = createService({ id: "relation-1" });

	const result = await service.linkChild("parent-user-1", {
		student_email: "child@example.com",
		date_of_birth: "2012-04-15",
	});

	assert.deepEqual(created, []);
	assert.deepEqual(result, {
		student_id: studentProfile.id,
		full_name: studentUser.full_name,
		already_linked: true,
	});
});

test("linkChild rejects mismatched birth date", async () => {
	const { service, created } = createService();

	await assert.rejects(
		() =>
			service.linkChild("parent-user-1", {
				student_email: "child@example.com",
				date_of_birth: "2011-04-15",
			}),
		/Không thể xác minh học sinh/,
	);
	assert.deepEqual(created, []);
});

test("unlinkChild deletes an existing parent-child relation", async () => {
	const { service, deleted } = createService({ id: "relation-1" });

	const result = await service.unlinkChild("parent-user-1", studentProfile.id);

	assert.deepEqual(deleted, [
		{
			parentUserId: "parent-user-1",
			studentId: studentProfile.id,
		},
	]);
	assert.deepEqual(result, {
		student_id: studentProfile.id,
		full_name: studentUser.full_name,
	});
});

test("unlinkChild rejects a child that is not linked to the parent", async () => {
	const { service, deleted } = createService();

	await assert.rejects(
		() => service.unlinkChild("parent-user-1", studentProfile.id),
		/Không có quyền truy cập thông tin học sinh này/,
	);
	assert.deepEqual(deleted, []);
});
