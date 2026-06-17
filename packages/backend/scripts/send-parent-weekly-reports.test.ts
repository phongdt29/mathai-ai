import assert from "node:assert/strict";
import { test } from "node:test";

import { getDefaultWeeklyReportPeriodKey } from "./send-parent-weekly-reports";

test("weekly report scheduler script defaults to ISO week period key", () => {
	assert.equal(
		getDefaultWeeklyReportPeriodKey(new Date("2026-05-12T13:00:00.000Z")),
		"2026-W20",
	);
	assert.equal(
		getDefaultWeeklyReportPeriodKey(new Date("2026-01-01T00:00:00.000Z")),
		"2026-W01",
	);
});
