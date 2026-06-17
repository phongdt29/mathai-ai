import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PointLedgerEntry } from "@/lib/api";
import { adminPointHistoryDetails } from "./point-history-details";

const baseEntry: PointLedgerEntry = {
	source_type: "manual_adjustment",
	earned_points: 0,
	max_points: 0,
	reward_points: 5,
	competency_score: 0,
	reason: "Admin adjustment",
	createdAt: "2026-05-01T00:00:00.000Z",
};

describe("adminPointHistoryDetails", () => {
	test("uses the frontend alias in type-only imports", () => {
		const entry: PointLedgerEntry = baseEntry;

		assert.equal(entry.source_type, "manual_adjustment");
	});

	test("returns trimmed manual adjustment note from metadata", () => {
		assert.equal(
			adminPointHistoryDetails({
				...baseEntry,
				metadata: { note: "  Audit note visible to admins  " },
			}),
			"Audit note visible to admins",
		);
	});

	test("returns dash when metadata note is absent", () => {
		assert.equal(adminPointHistoryDetails(baseEntry), "—");
	});
});
