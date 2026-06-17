import assert from "node:assert/strict";
import test from "node:test";

import { ParentMonitoringService } from "./parent-monitoring.service";

function makeDashboard(overrides: Record<string, unknown> = {}) {
	return {
		student: {
			id: "student-1",
			name: "Nguyễn An",
			grade_level: 6,
		},
		today_schedule: null,
		attendance_summary: {
			present: 4,
			partial: 1,
			absent: 1,
			total: 6,
		},
		study_stats: {
			avg_active_minutes_per_session: 32,
			avg_focus_ratio: 0.82,
			total_sessions_7d: 5,
		},
		recent_quiz_results: [
			{ lesson_title: "Phân số", score: 8, max_score: 10, date: "2026-05-01" },
			{
				lesson_title: "Số thập phân",
				score: 7,
				max_score: 10,
				date: "2026-05-02",
			},
		],
		risk: {
			score: 24,
			level: "low",
		},
		alerts: [
			{
				type: "session_complete",
				severity: "info",
				title: "Hoàn thành buổi học",
				content: "Con đã hoàn thành bài",
				created_at: "2026-05-02T00:00:00.000Z",
			},
		],
		intervention_suggestions: ["Duy trì nhịp học hiện tại"],
		...overrides,
	};
}

test("getWeeklyReport aggregates linked child dashboards into parent-safe summary rows", async () => {
	const service = new ParentMonitoringService() as any;
	service.getChildren = async () => [
		{ student_id: "student-1", full_name: "Nguyễn An" },
		{ student_id: "student-2", full_name: "Trần Bình" },
	];
	service.getDashboard = async (_parentId: string, studentId: string) => {
		if (studentId === "student-2") {
			return makeDashboard({
				student: { id: "student-2", name: "Trần Bình", grade_level: 7 },
				attendance_summary: { present: 1, partial: 0, absent: 1, total: 2 },
				study_stats: {
					avg_active_minutes_per_session: 20,
					avg_focus_ratio: 0.6,
					total_sessions_7d: 2,
				},
				recent_quiz_results: [],
				risk: { score: 62, level: "medium" },
				alerts: [],
				intervention_suggestions: ["Ôn lại bài đã bỏ lỡ"],
			});
		}
		return makeDashboard();
	};

	const report = await service.getWeeklyReport("parent-1");

	assert.equal(report.range_days, 7);
	assert.equal(report.totals.students, 2);
	assert.equal(report.totals.sessions, 7);
	assert.equal(report.totals.active_minutes, 200);
	assert.equal(report.totals.alerts, 1);
	assert.deepEqual(
		report.students.map((student: any) => student.student_name),
		["Nguyễn An", "Trần Bình"],
	);
	assert.equal(report.students[0].attendance_rate, 83);
	assert.equal(report.students[0].avg_quiz_score, 75);
	assert.equal(report.students[1].attendance_rate, 50);
	assert.equal(report.students[1].avg_quiz_score, null);
	assert.deepEqual(report.follow_up_actions, [
		"Duy trì nhịp học hiện tại",
		"Ôn lại bài đã bỏ lỡ",
	]);
});


test("getWeeklyReport propagates requested range into dashboard session and attendance windows", async () => {
	const service = new ParentMonitoringService() as any;
	const dashboardCalls: Array<{ parentId: string; studentId: string; rangeDays: number }> = [];
	service.getChildren = async () => [{ student_id: "student-1", full_name: "Nguyễn An" }];
	service.getDashboard = async (parentId: string, studentId: string, rangeDays: number) => {
		dashboardCalls.push({ parentId, studentId, rangeDays });
		return makeDashboard({
			study_stats: {
				avg_active_minutes_per_session: 10,
				avg_focus_ratio: 0.8,
				total_sessions_7d: rangeDays,
			},
		});
	};

	const report = await service.getWeeklyReport("parent-1", 14);

	assert.equal(report.range_days, 14);
	assert.deepEqual(dashboardCalls, [
		{ parentId: "parent-1", studentId: "student-1", rangeDays: 14 },
	]);
	assert.equal(report.totals.sessions, 14);
});
