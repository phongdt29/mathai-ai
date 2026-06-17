import { resolve } from "node:path";
import dotenv from "dotenv";

import mongoose from "mongoose";

import { PointLedgerModel } from "../src/models/point-ledger.model";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "mathai";

const OLD_ATTEMPT_INDEX_KEY = {
	student_id: 1,
	source_type: 1,
	attempt_id: 1,
} as const;

const NEW_ATTEMPT_INDEX_KEY = {
	student_id: 1,
	source_type: 1,
	source_id: 1,
	attempt_id: 1,
} as const;

type PartialFilter = Record<string, unknown>;
type IndexKey = Record<string, 1 | -1>;

const ATTEMPT_BACKED_SOURCE_TYPES = [
	"assessment",
	"lesson",
	"teacher_assignment",
];

const ATTEMPT_PARTIAL_FILTER: PartialFilter = {
	attempt_id: { $exists: true, $ne: null },
	source_type: { $in: ATTEMPT_BACKED_SOURCE_TYPES },
};

const NEW_ATTEMPT_INDEX_NAME =
	"student_id_1_source_type_1_source_id_1_attempt_id_1";

type ListedIndex = {
	name?: string;
	unique?: boolean;
	key: Record<string, unknown>;
	partialFilterExpression?: PartialFilter;
};

function keysMatch(actual: ListedIndex["key"], expected: IndexKey): boolean {
	const actualEntries = Object.entries(actual ?? {}).map(([field, order]) => [
		field,
		Number(order),
	]);
	const expectedEntries = Object.entries(expected);

	return (
		actualEntries.length === expectedEntries.length &&
		expectedEntries.every(([field, order], index) => {
			const [actualField, actualOrder] = actualEntries[index] ?? [];
			return actualField === field && actualOrder === order;
		})
	);
}

function normalizeValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(normalizeValue);
	}

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, nestedValue]) => [key, normalizeValue(nestedValue)]),
		);
	}

	return value;
}

function partialFiltersMatch(
	actual: PartialFilter | undefined,
	expected: PartialFilter,
): boolean {
	return (
		JSON.stringify(normalizeValue(actual ?? {})) ===
		JSON.stringify(normalizeValue(expected))
	);
}

export function isExactAttemptIndex(
	index: ListedIndex,
	expectedKey: IndexKey,
	expectedPartialFilter: PartialFilter,
): boolean {
	return (
		index.unique === true &&
		keysMatch(index.key, expectedKey) &&
		partialFiltersMatch(index.partialFilterExpression, expectedPartialFilter)
	);
}

function findUnexpectedSameKeyIndex(
	indexes: ListedIndex[],
	expectedKey: IndexKey,
	expectedPartialFilter: PartialFilter,
): ListedIndex | undefined {
	return indexes.find(
		(index) =>
			keysMatch(index.key, expectedKey) &&
			!isExactAttemptIndex(index, expectedKey, expectedPartialFilter),
	);
}

function describeIndex(index: ListedIndex): string {
	return JSON.stringify({
		name: index.name,
		key: index.key,
		unique: index.unique,
		partialFilterExpression: index.partialFilterExpression,
	});
}

function isDuplicateKeyError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === 11000
	);
}

export async function migratePointLedgerIndexes() {
	try {
		await mongoose.connect(MONGODB_URI, { dbName: DB_NAME, autoIndex: false });
		console.log(`Connected to MongoDB database=${DB_NAME}`);

		const collection = PointLedgerModel.collection;
		const existingIndexes = (await collection
			.listIndexes()
			.toArray()) as ListedIndex[];

		const unexpectedOldIndex = findUnexpectedSameKeyIndex(
			existingIndexes,
			OLD_ATTEMPT_INDEX_KEY,
			ATTEMPT_PARTIAL_FILTER,
		);
		if (unexpectedOldIndex) {
			throw new Error(
				`Refusing to drop point ledger legacy index with unexpected options: ${describeIndex(
					unexpectedOldIndex,
				)}`,
			);
		}

		const unexpectedNewIndex = findUnexpectedSameKeyIndex(
			existingIndexes,
			NEW_ATTEMPT_INDEX_KEY,
			ATTEMPT_PARTIAL_FILTER,
		);
		if (unexpectedNewIndex) {
			throw new Error(
				`Refusing to treat point ledger target index as migrated because options differ: ${describeIndex(
					unexpectedNewIndex,
				)}`,
			);
		}

		const oldIndexes = existingIndexes.filter((index) =>
			isExactAttemptIndex(index, OLD_ATTEMPT_INDEX_KEY, ATTEMPT_PARTIAL_FILTER),
		);
		const newIndex = existingIndexes.find((index) =>
			isExactAttemptIndex(index, NEW_ATTEMPT_INDEX_KEY, ATTEMPT_PARTIAL_FILTER),
		);

		if (newIndex) {
			console.log(
				`New point ledger attempt unique index already exists: ${newIndex.name}`,
			);
		} else {
			console.log(
				`Creating point ledger attempt unique index before dropping legacy index: ${NEW_ATTEMPT_INDEX_NAME}`,
			);
			try {
				await collection.createIndex(NEW_ATTEMPT_INDEX_KEY, {
					name: NEW_ATTEMPT_INDEX_NAME,
					unique: true,
					partialFilterExpression: ATTEMPT_PARTIAL_FILTER,
				});
			} catch (error) {
				if (isDuplicateKeyError(error)) {
					console.error(
						"Duplicate point ledger attempt-backed rows exist for the new uniqueness key. " +
							"Resolve duplicates for student_id/source_type/source_id/attempt_id with source_type in " +
							"assessment, lesson, teacher_assignment and non-null attempt_id, then rerun this migration. " +
							"The legacy index was not dropped.",
					);
				}
				throw error;
			}
		}

		if (oldIndexes.length === 0) {
			console.log("No exact legacy point ledger attempt unique index found");
		} else {
			for (const index of oldIndexes) {
				if (!index.name) {
					throw new Error(
						`Exact legacy point ledger index has no name; manual inspection required: ${describeIndex(
							index,
						)}`,
					);
				}

				console.log(
					`Dropping exact legacy point ledger attempt index: ${index.name}`,
				);
				await collection.dropIndex(index.name);
			}
		}

		console.log(
			"Ensuring PointLedger schema indexes without dropping unrelated indexes",
		);
		await PointLedgerModel.createIndexes();
		console.log("PointLedger schema indexes ensured");

		const finalIndexes = (await collection
			.listIndexes()
			.toArray()) as ListedIndex[];
		console.log("PointLedger indexes after migration:");
		for (const index of finalIndexes) {
			console.log(`- ${index.name}: ${JSON.stringify(index.key)}`);
		}
	} finally {
		await mongoose.disconnect().catch(() => undefined);
	}
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
	migratePointLedgerIndexes()
		.then(() => {
			console.log("Point ledger index migration complete");
		})
		.catch((error) => {
			console.error("Point ledger index migration failed:", error);
			process.exit(1);
		});
}
