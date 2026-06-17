import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { type AdminReportsData, buildAdminReportCsv } from "./export";

describe("admin reports CSV export", () => {
	test("builds a Vietnamese CSV with stable metric rows", () => {
		const data: AdminReportsData = {
			dau: 12,
			mau: 34,
			totalUsers: 120,
			totalLessons: 40,
			completedLessons: 25,
			completionRate: 63,
			avgStudyTimeMinutes: 45,
			totalSessions: 300,
		};

		const csv = buildAdminReportCsv(data, new Date("2026-05-10T12:00:00.000Z"));

		assert.ok(csv.startsWith("metric,label,value,exported_at\n"));
		assert.match(csv, /dau,DAU,12,2026-05-10T12:00:00.000Z/);
		assert.match(
			csv,
			/completionRate,Tỷ lệ hoàn thành,63,2026-05-10T12:00:00.000Z/,
		);
		assert.match(
			csv,
			/avgStudyTimeMinutes,Thời gian TB\/ngày,45,2026-05-10T12:00:00.000Z/,
		);
		assert.equal(csv.split("\n").length, 9);
	});
});
