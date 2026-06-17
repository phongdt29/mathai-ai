import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
	isExactAttemptIndex,
	migratePointLedgerIndexes,
} from "./migrate-point-ledger-indexes";

const scriptPath = join(__dirname, "migrate-point-ledger-indexes.ts");

const expectedFilter = {
	attempt_id: { $exists: true, $ne: null },
	source_type: {
		$in: ["assessment", "lesson", "teacher_assignment"],
	},
};

test("point ledger index detection requires exact key and partial filter", () => {
	assert.equal(
		isExactAttemptIndex(
			{
				name: "legacy",
				unique: true,
				key: { student_id: 1, source_type: 1, attempt_id: 1 },
				partialFilterExpression: expectedFilter,
			},
			{ student_id: 1, source_type: 1, attempt_id: 1 },
			expectedFilter,
		),
		true,
	);

	assert.equal(
		isExactAttemptIndex(
			{
				name: "missing-filter",
				unique: true,
				key: { student_id: 1, source_type: 1, attempt_id: 1 },
			},
			{ student_id: 1, source_type: 1, attempt_id: 1 },
			expectedFilter,
		),
		false,
	);

	assert.equal(
		isExactAttemptIndex(
			{
				name: "wrong-filter",
				unique: true,
				key: { student_id: 1, source_type: 1, attempt_id: 1 },
				partialFilterExpression: {
					attempt_id: { $exists: true },
					source_type: { $in: ["assessment", "lesson"] },
				},
			},
			{ student_id: 1, source_type: 1, attempt_id: 1 },
			expectedFilter,
		),
		false,
	);
	assert.equal(
		isExactAttemptIndex(
			{
				name: "different-filter-order",
				unique: true,
				key: { student_id: 1, source_type: 1, attempt_id: 1 },
				partialFilterExpression: {
					source_type: {
						$in: ["assessment", "lesson", "teacher_assignment"],
					},
					attempt_id: { $ne: null, $exists: true },
				},
			},
			{ student_id: 1, source_type: 1, attempt_id: 1 },
			expectedFilter,
		),
		true,
	);
	assert.equal(
		isExactAttemptIndex(
			{
				name: "not-unique",
				key: { student_id: 1, source_type: 1, attempt_id: 1 },
				partialFilterExpression: expectedFilter,
			},
			{ student_id: 1, source_type: 1, attempt_id: 1 },
			expectedFilter,
		),
		false,
	);
});

test("point ledger index migration creates new index before dropping exact old index", async () => {
	const script = await readFile(scriptPath, "utf8");
	const createIndexPosition = script.indexOf("collection.createIndex(");
	const dropIndexPosition = script.indexOf("collection.dropIndex(");

	assert.notEqual(
		createIndexPosition,
		-1,
		"script should create the new index",
	);
	assert.notEqual(dropIndexPosition, -1, "script should drop the old index");
	assert.ok(
		createIndexPosition < dropIndexPosition,
		"script should create the new index before dropping the legacy index",
	);
	assert.match(
		script,
		/createIndex\([\s\S]*?catch \(error\)[\s\S]*?The legacy index was not dropped/,
		"script should catch createIndex duplicate failures before any legacy drop can run",
	);
});

test("point ledger index migration keeps destructive index APIs out of source", async () => {
	const script = await readFile(scriptPath, "utf8");

	assert.doesNotMatch(
		script,
		/dropIndexes\(/,
		"script must not drop all collection indexes",
	);
	assert.doesNotMatch(
		script,
		/syncIndexes\(/,
		"script must not use syncIndexes because it can drop indexes",
	);
	assert.match(
		script,
		/Refusing to drop point ledger legacy index with unexpected options/,
		"script should abort instead of silently dropping same-key legacy indexes with unexpected options",
	);
	assert.match(
		script,
		/The legacy index was not dropped/,
		"script should tell operators duplicate-key failures leave the legacy index intact",
	);
	assert.match(
		script,
		/finally\s*{\s*\r?\n\s*await mongoose\.disconnect\(\)\.catch/,
		"script should always close the MongoDB connection",
	);
});

test("point ledger index migration exports an executable migration function", () => {
	assert.equal(typeof migratePointLedgerIndexes, "function");
});
