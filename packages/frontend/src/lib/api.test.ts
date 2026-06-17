import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, test } from "node:test";
import {
	adminAdjustStudentPoints,
	adminGetStudentPoints,
	generateAssessment,
	generateCurriculum,
	getCurriculumDetail,
	getDashboardPointSummary,
	getDashboardPoints,
	getParentChildDashboard,
	getParentNotifications,
	getParentPreferences,
	getParentWeeklyReport,
	getStudentAssignment,
	getStudentProfile,
	getStudentTheme,
	getStudentTutors,
	getTeacherAssignment,
	getTeacherGradebook,
	getUnreadParentNotifications,
	linkParentChild,
	listAssessments,
	listCurricula,
	listLessons,
	listStudentAssignments,
	listStudentAssignmentsPage,
	markAllParentNotificationsRead,
	markParentNotificationRead,
	requestPasswordReset,
	resetPassword,
	saveAssessmentAnswer,
	selectStudentTutor,
	solveProblem,
	startAssessmentAttempt,
	submitAssessmentAttempt,
	submitLessonExerciseAttempt,
	submitLessonQuizResult,
	submitStudentAssignment,
	unlinkParentChild,
	updateParentPreferences,
	updateStudentProfile,
	updateStudentTheme,
	uploadSolverImage,
} from "./api";
import {
	ADMIN_AI_PROVIDER_ROUTES,
	ADMIN_POINT_ROUTES,
	AI_MODEL_DISCOVERY_ROUTE,
	PARENT_ROUTES,
	SOLVER_ROUTES,
} from "./api-routes";

type FetchCall = {
	url: string;
	init: RequestInit | undefined;
};

const originalFetch = globalThis.fetch;
const calls: FetchCall[] = [];

function installFetchMock(data: unknown = {}) {
	calls.length = 0;
	globalThis.fetch = async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		calls.push({ url: String(input), init });
		return new Response(JSON.stringify({ success: true, data }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	};
}

function parseBody(init: RequestInit | undefined) {
	const body = init?.body;
	assert.equal(typeof body, "string");
	return JSON.parse(body as string) as Record<string, unknown>;
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	calls.length = 0;
});

describe("student assessment API helpers", () => {
	test("uses expected endpoints, methods, encoded ids, and payloads", async () => {
		installFetchMock({ _id: "attempt-1" });

		await listAssessments();
		await generateAssessment({
			type: "diagnostic",
			total_questions: 8,
			topics: ["Algebra"],
		});
		await startAssessmentAttempt("assessment 1/2");
		await saveAssessmentAnswer("assessment 1/2", "attempt 1/2", {
			question_id: "question-1",
			student_answer: "x = 2",
			time_spent_seconds: 45,
		});
		await submitAssessmentAttempt("assessment 1/2", "attempt 1/2");

		assert.deepEqual(
			calls.map((call) => ({
				url: call.url,
				method: call.init?.method ?? "GET",
			})),
			[
				{ url: "/api/assessments", method: "GET" },
				{ url: "/api/assessments/generate", method: "POST" },
				{ url: "/api/assessments/assessment%201%2F2/start", method: "POST" },
				{
					url: "/api/assessments/assessment%201%2F2/attempts/attempt%201%2F2/answers",
					method: "POST",
				},
				{
					url: "/api/assessments/assessment%201%2F2/attempts/attempt%201%2F2/submit",
					method: "POST",
				},
			],
		);
		assert.deepEqual(parseBody(calls[1]?.init), {
			type: "diagnostic",
			total_questions: 8,
			topics: ["Algebra"],
		});
		assert.deepEqual(parseBody(calls[3]?.init), {
			question_id: "question-1",
			student_answer: "x = 2",
			time_spent_seconds: 45,
		});
	});
});

describe("auth password reset API helpers", () => {
	test("requests a password reset email without exposing account existence", async () => {
		installFetchMock(null);

		await requestPasswordReset("student@example.com");

		assert.deepEqual(
			calls.map((call) => ({
				url: call.url,
				method: call.init?.method ?? "GET",
			})),
			[{ url: "/api/auth/forgot-password", method: "POST" }],
		);
		assert.deepEqual(parseBody(calls[0]?.init), {
			email: "student@example.com",
		});
	});

	test("submits a reset token and new password to the backend contract", async () => {
		installFetchMock(null);

		await resetPassword("reset-token-123", "new-strong-password");

		assert.deepEqual(
			calls.map((call) => ({
				url: call.url,
				method: call.init?.method ?? "GET",
			})),
			[{ url: "/api/auth/reset-password", method: "POST" }],
		);
		assert.deepEqual(parseBody(calls[0]?.init), {
			token: "reset-token-123",
			password: "new-strong-password",
		});
	});

	test("auth pages expose the user-facing forgot and reset flows", () => {
		const forgotPage = readFileSync(
			new URL("../app/(auth)/forgot-password/page.tsx", import.meta.url),
			"utf8",
		);
		const resetPageUrl = new URL(
			"../app/(auth)/reset-password/page.tsx",
			import.meta.url,
		);

		assert.equal(existsSync(resetPageUrl), true);
		assert.match(forgotPage, /requestPasswordReset/);
		assert.doesNotMatch(forgotPage, /unsupported/i);
		assert.doesNotMatch(forgotPage, /liên hệ quản trị viên/i);

		const resetPage = readFileSync(resetPageUrl, "utf8");
		assert.match(resetPage, /resetPassword/);
		assert.match(resetPage, /URLSearchParams/);
		assert.match(resetPage, /token/);
	});
});

describe("Wave C route contract constants", () => {
	test("defines high-risk solver, parent, point, and AI provider routes in one place", () => {
		assert.equal(SOLVER_ROUTES.solve, "/solver/solve");
		assert.equal(SOLVER_ROUTES.parseImage, "/solver/parse-image");
		assert.equal(AI_MODEL_DISCOVERY_ROUTE, "/api/ai/models");

		assert.equal(
			PARENT_ROUTES.childDashboard("student 1/2"),
			"/parent/children/student%201%2F2/dashboard",
		);
		assert.equal(
			PARENT_ROUTES.weeklyReport(14),
			"/parent/reports/weekly?range_days=14",
		);
		assert.equal(PARENT_ROUTES.preferences, "/parent/preferences");

		assert.equal(ADMIN_POINT_ROUTES.dashboardPoints, "/dashboard/points");
		assert.equal(
			ADMIN_POINT_ROUTES.dashboardPointSummary,
			"/dashboard/points/summary",
		);
		assert.equal(
			ADMIN_POINT_ROUTES.studentPoints("student 1/2"),
			"/admin/students/student%201%2F2/points",
		);

		assert.equal(ADMIN_AI_PROVIDER_ROUTES.collection, "/admin/ai/providers");
		assert.equal(
			ADMIN_AI_PROVIDER_ROUTES.item("provider 1/2"),
			"/admin/ai/providers/provider%201%2F2",
		);
		assert.equal(
			ADMIN_AI_PROVIDER_ROUTES.activate("provider 1/2"),
			"/admin/ai/providers/provider%201%2F2/activate",
		);
		assert.equal(
			ADMIN_AI_PROVIDER_ROUTES.test("provider 1/2"),
			"/admin/ai/providers/provider%201%2F2/test",
		);
	});

	test("keeps public API helper signatures mapped to Wave C route constants", async () => {
		installFetchMock({});

		await solveProblem({ problem_text: "2+2" });
		await getParentChildDashboard("student 1/2");
		await getParentWeeklyReport(14);
		await getParentPreferences();
		await updateParentPreferences({ notify_weekly_summary: false });
		await getDashboardPoints();
		await getDashboardPointSummary();
		await adminGetStudentPoints("student 1/2");
		await adminAdjustStudentPoints("student 1/2", {
			reward_points: 5,
			reason: "Manual correction",
		});

		assert.deepEqual(
			calls.map((call) => ({
				url: call.url,
				method: call.init?.method ?? "GET",
			})),
			[
				{ url: "/api/solver/solve", method: "POST" },
				{
					url: "/api/parent/children/student%201%2F2/dashboard",
					method: "GET",
				},
				{ url: "/api/parent/reports/weekly?range_days=14", method: "GET" },
				{ url: "/api/parent/preferences", method: "GET" },
				{ url: "/api/parent/preferences", method: "PUT" },
				{ url: "/api/dashboard/points", method: "GET" },
				{ url: "/api/dashboard/points/summary", method: "GET" },
				{ url: "/api/admin/students/student%201%2F2/points", method: "GET" },
				{ url: "/api/admin/students/student%201%2F2/points", method: "POST" },
			],
		);
		assert.deepEqual(parseBody(calls[4]?.init), {
			notify_weekly_summary: false,
		});
		assert.deepEqual(parseBody(calls[8]?.init), {
			reward_points: 5,
			reason: "Manual correction",
		});
	});

	test("admin settings are backend-backed and not presented as localStorage production settings", () => {
		const settingsSource = readFileSync(
			new URL("../app/(admin)/admin/settings/page.tsx", import.meta.url),
			"utf8",
		);
		const layoutSource = readFileSync(
			new URL("../app/(admin)/layout.tsx", import.meta.url),
			"utf8",
		);

		assert.doesNotMatch(settingsSource, /mathai-settings-general/);
		assert.doesNotMatch(settingsSource, /mathai-settings-ai/);
		assert.doesNotMatch(
			settingsSource,
			/localStorage\.setItem\(['"]mathai-settings/,
		);
		assert.match(settingsSource, /listAIProviders/);
		assert.match(layoutSource, /user\?\.role !== "staff"/);
	});

	test("staff admin shell only links to backend-permitted read-only operational routes", () => {
		const layoutSource = readFileSync(
			new URL("../app/(admin)/layout.tsx", import.meta.url),
			"utf8",
		);
		const teachersSource = readFileSync(
			new URL("../app/(admin)/admin/teachers/page.tsx", import.meta.url),
			"utf8",
		);

		assert.match(layoutSource, /const staffAllowedAdminHrefs = new Set/);
		for (const href of [
			"/admin/settings",
			"/admin/tutors",
			"/admin/proposals",
			"/admin/ai-logs",
		]) {
			assert.match(
				layoutSource,
				new RegExp(`staffDeniedAdminHrefs[\\s\\S]*["']${href}["']`),
				`${href} should be explicitly denied to staff nav`,
			);
		}
		assert.match(layoutSource, /staffAllowedAdminHrefs\.has\(item\.href\)/);
		assert.match(teachersSource, /canManageTeacherLifecycle/);
		assert.match(teachersSource, /user\?\.role === ["']admin["']/);
		assert.match(teachersSource, /canManageTeacherLifecycle && \(/);
	});

	test("admin settings page denies direct staff access at page level", () => {
		const settingsSource = readFileSync(
			new URL("../app/(admin)/admin/settings/page.tsx", import.meta.url),
			"utf8",
		);

		assert.match(settingsSource, /useAuth\(\["admin", "staff"\]\)/);
		assert.match(settingsSource, /user\?\.role === "staff"/);
		assert.match(settingsSource, /Không có quyền truy cập cài đặt hệ thống/);
		assert.match(settingsSource, /return \(/);
	});

	test("admin settings only refreshes AI providers after confirming an admin user", () => {
		const settingsSource = readFileSync(
			new URL("../app/(admin)/admin/settings/page.tsx", import.meta.url),
			"utf8",
		);
		const providerRefreshEffect = settingsSource.match(
			/useEffect\(\(\) => \{[\s\S]*?void refreshProviders\(\);[\s\S]*?\}, \[[^\]]*\]\);/,
		)?.[0];

		assert.ok(
			providerRefreshEffect,
			"settings page should keep provider refresh inside an explicit effect",
		);
		assert.match(providerRefreshEffect, /loading/);
		assert.match(providerRefreshEffect, /user\?\.role !== "admin"/);
		assert.match(providerRefreshEffect, /\[loading, user\?\.role\]/);
		assert.ok(
			providerRefreshEffect.indexOf('user?.role !== "admin"') <
				providerRefreshEffect.indexOf("refreshProviders"),
			"staff/non-admin guard must run before refreshProviders is scheduled",
		);
	});

	test("admin settings uses the centralized model discovery route constant", () => {
		const settingsSource = readFileSync(
			new URL("../app/(admin)/admin/settings/page.tsx", import.meta.url),
			"utf8",
		);

		assert.match(settingsSource, /AI_MODEL_DISCOVERY_ROUTE/);
		assert.doesNotMatch(settingsSource, /fetch\(["']\/api\/ai\/models["']/);
	});

	test("teacher settings do not present fake local profile-save success without a backend endpoint", () => {
		const settingsSource = readFileSync(
			new URL("../app/(teacher)/teacher/settings/page.tsx", import.meta.url),
			"utf8",
		);

		assert.doesNotMatch(settingsSource, /setSaved\(true\)/);
		assert.doesNotMatch(settingsSource, /Đã lưu thành công/);
		assert.doesNotMatch(settingsSource, /handleSave/);
		assert.match(settingsSource, /readOnlyProfileFields/);
		assert.match(settingsSource, /readOnly/);
		assert.match(settingsSource, /Chưa hỗ trợ chỉnh sửa hồ sơ/);
	});
});

describe("curriculum and lesson API helpers", () => {
	test("adaptive recommendation contract requires stable reasons surfaced by dashboard pages", () => {
		const apiSource = readFileSync(
			new URL("./api.ts", import.meta.url),
			"utf8",
		);
		const dashboardSource = readFileSync(
			new URL("../app/(dashboard)/dashboard/page.tsx", import.meta.url),
			"utf8",
		);
		const lessonsSource = readFileSync(
			new URL("../app/(dashboard)/dashboard/lessons/page.tsx", import.meta.url),
			"utf8",
		);

		assert.match(apiSource, /new_lesson:\s*\{[\s\S]*reason: string;/);
		assert.match(apiSource, /review_items:[\s\S]*reason: string;/);
		assert.match(apiSource, /reinforce_items:[\s\S]*reason: string;/);
		assert.match(apiSource, /fallback_reason: string \| null;/);
		assert.match(dashboardSource, /getRecommendationDisplaySummary/);
		assert.match(lessonsSource, /getRecommendationDisplaySummary/);
		assert.doesNotMatch(dashboardSource, /new_lesson\?\.reason/);
		assert.doesNotMatch(lessonsSource, /nextLesson\.reason/);
	});

	test("uses real curriculum/lesson endpoints with encoded ids and query parameters", async () => {
		installFetchMock([]);

		await listCurricula();
		await getCurriculumDetail("curriculum 1/2");
		await generateCurriculum({ title: "Lộ trình cá nhân", total_modules: 3 });
		await listLessons("curriculum 1/2");
		await submitLessonQuizResult("lesson 1/2", {
			score: 8,
			max_score: 10,
			idempotency_key: "quiz-key-1",
		});
		await submitLessonExerciseAttempt("lesson 1/2", {
			answers: [{ exercise_id: "exercise-1", student_answer: "42" }],
			duration_seconds: 900,
		});

		assert.deepEqual(
			calls.map((call) => ({
				url: call.url,
				method: call.init?.method ?? "GET",
			})),
			[
				{ url: "/api/curriculum", method: "GET" },
				{ url: "/api/curriculum/curriculum%201%2F2", method: "GET" },
				{ url: "/api/curriculum/generate", method: "POST" },
				{ url: "/api/lessons?curriculum_id=curriculum%201%2F2", method: "GET" },
				{ url: "/api/lessons/lesson%201%2F2/quiz-results", method: "POST" },
				{
					url: "/api/lessons/lesson%201%2F2/exercise-attempts/submit",
					method: "POST",
				},
			],
		);
		assert.deepEqual(parseBody(calls[2]?.init), {
			title: "Lộ trình cá nhân",
			total_modules: 3,
		});
		assert.deepEqual(parseBody(calls[4]?.init), {
			score: 8,
			max_score: 10,
			idempotency_key: "quiz-key-1",
		});
		assert.deepEqual(parseBody(calls[5]?.init), {
			answers: [{ exercise_id: "exercise-1", student_answer: "42" }],
			duration_seconds: 900,
		});
	});
});

describe("student profile preference API helpers", () => {
	test("loads and updates real student profile, theme, and tutor endpoints", async () => {
		installFetchMock([]);

		await getStudentProfile();
		await updateStudentProfile({ full_name: "An", grade_level: 6 });
		await getStudentTheme();
		await updateStudentTheme({
			favorite_color: "#2563EB",
			font_size: "large",
			theme_mode: "dark",
		});
		await getStudentTutors();
		await selectStudentTutor("507f1f77bcf86cd799439011");

		assert.deepEqual(
			calls.map((call) => ({
				url: call.url,
				method: call.init?.method ?? "GET",
			})),
			[
				{ url: "/api/students/profile", method: "GET" },
				{ url: "/api/students/profile", method: "PUT" },
				{ url: "/api/students/theme", method: "GET" },
				{ url: "/api/students/theme", method: "PUT" },
				{ url: "/api/students/tutors", method: "GET" },
				{ url: "/api/students/select-tutor", method: "PUT" },
			],
		);
		assert.deepEqual(parseBody(calls[1]?.init), {
			full_name: "An",
			grade_level: 6,
		});
		assert.deepEqual(parseBody(calls[3]?.init), {
			favorite_color: "#2563EB",
			font_size: "large",
			theme_mode: "dark",
		});
		assert.deepEqual(parseBody(calls[5]?.init), {
			tutor_id: "507f1f77bcf86cd799439011",
		});
	});
});

describe("student assignment API helpers", () => {
	test("uses expected student assignment endpoints with encoded ids and payloads", async () => {
		installFetchMock([]);

		await listStudentAssignments();
		await listStudentAssignmentsPage({
			page: 2,
			limit: 5,
			status: "active",
			submission_status: "pending",
		});
		await getStudentAssignment("assignment 1/2");
		await submitStudentAssignment("assignment 1/2", {
			content: "Lời giải của em",
		});

		assert.deepEqual(
			calls.map((call) => ({
				url: call.url,
				method: call.init?.method ?? "GET",
			})),
			[
				{ url: "/api/students/assignments", method: "GET" },
				{
					url: "/api/students/assignments?page=2&limit=5&status=active&submission_status=pending",
					method: "GET",
				},
				{ url: "/api/students/assignments/assignment%201%2F2", method: "GET" },
				{
					url: "/api/students/assignments/assignment%201%2F2/submit",
					method: "POST",
				},
			],
		);
		assert.deepEqual(parseBody(calls[3]?.init), {
			content: "Lời giải của em",
		});
	});
});
describe("teacher assignment API helpers", () => {
	test("loads teacher assignment detail with encoded id", async () => {
		installFetchMock({ id: "assignment-1" });

		await getTeacherAssignment("assignment 1/2");

		assert.deepEqual(
			calls.map((call) => ({
				url: call.url,
				method: call.init?.method ?? "GET",
			})),
			[{ url: "/api/teacher/assignments/assignment%201%2F2", method: "GET" }],
		);
	});

	test("loads teacher gradebook summary with encoded filters", async () => {
		installFetchMock({ entries: 0, students: [] });

		await getTeacherGradebook({
			class_id: "class 1/2",
			student_id: "student 1/2",
		});

		assert.deepEqual(
			calls.map((call) => ({
				url: call.url,
				method: call.init?.method ?? "GET",
			})),
			[
				{
					url: "/api/teacher/gradebook?class_id=class+1%2F2&student_id=student+1%2F2",
					method: "GET",
				},
			],
		);
	});
});

describe("parent API helpers", () => {
	test("uses expected parent endpoints, methods, limits, and encoded ids", async () => {
		installFetchMock([]);

		await getParentChildDashboard("student 1/2");
		await getParentWeeklyReport(14);
		await linkParentChild({
			student_email: "child@example.com",
			date_of_birth: "2012-04-15",
		});
		await unlinkParentChild("student 1/2");
		await getParentNotifications(7);
		await getUnreadParentNotifications();
		await markParentNotificationRead("notification 1/2");
		await markAllParentNotificationsRead();
		await updateParentPreferences({
			notify_quiz_result: false,
			preferred_channel: "email",
		});

		assert.deepEqual(
			calls.map((call) => ({
				url: call.url,
				method: call.init?.method ?? "GET",
			})),
			[
				{
					url: "/api/parent/children/student%201%2F2/dashboard",
					method: "GET",
				},
				{ url: "/api/parent/reports/weekly?range_days=14", method: "GET" },
				{ url: "/api/parent/children/link", method: "POST" },
				{ url: "/api/parent/children/student%201%2F2", method: "DELETE" },
				{ url: "/api/parent/notifications?limit=7", method: "GET" },
				{ url: "/api/parent/notifications/unread", method: "GET" },
				{
					url: "/api/parent/notifications/notification%201%2F2/read",
					method: "POST",
				},
				{ url: "/api/parent/notifications/read-all", method: "POST" },
				{ url: "/api/parent/preferences", method: "PUT" },
			],
		);
		assert.deepEqual(parseBody(calls[2]?.init), {
			student_email: "child@example.com",
			date_of_birth: "2012-04-15",
		});
		assert.deepEqual(parseBody(calls[8]?.init), {
			notify_quiz_result: false,
			preferred_channel: "email",
		});
	});
});

describe("solver API helpers", () => {
	test("posts solver payload and returns similar practice problems", async () => {
		installFetchMock({
			stage: "full_solution",
			content: "Lời giải từng bước",
			can_request_more: false,
			hint_count: 3,
			dependency_warning: false,
			similar_problems: [
				{
					problem: "Giải phương trình 2x + 3 = 9",
					hint: "Chuyển 3 sang vế phải trước.",
					difficulty: "easy",
					topic: "Phương trình bậc nhất",
					answer: "x = 3",
				},
			],
			similar_problems_meta: {
				message: "Đã tạo bài tương tự để em luyện thêm.",
			},
		});

		const result = await solveProblem({
			problem_text: "Giải phương trình x + 2 = 5",
			stage: "full_solution",
			previous_hints: ["Tách hạng tử chứa x"],
			input_type: "text",
		});

		assert.equal(calls.length, 1);
		assert.equal(calls[0]?.url, "/api/solver/solve");
		assert.equal(calls[0]?.init?.method, "POST");
		assert.deepEqual(parseBody(calls[0]?.init), {
			problem_text: "Giải phương trình x + 2 = 5",
			stage: "full_solution",
			previous_hints: ["Tách hạng tử chứa x"],
			input_type: "text",
		});
		assert.equal(result.similar_problems.length, 1);
		assert.equal(result.similar_problems[0]?.answer, "x = 3");
		assert.equal(
			result.similar_problems_meta.message,
			"Đã tạo bài tương tự để em luyện thêm.",
		);
	});

	test("posts multipart FormData to parse-image without JSON content-type", async () => {
		installFetchMock({
			input_type: "image",
			image_url: "/uploads/solver/mock.png",
			parsed_text: "2x + 1 = 5",
			ocr_status: "parsed",
			message: "OK",
		});

		const result = await uploadSolverImage(
			new File(["fake"], "problem.png", { type: "image/png" }),
		);

		assert.equal(calls.length, 1);
		assert.equal(calls[0]?.url, "/api/solver/parse-image");
		assert.equal(calls[0]?.init?.method, "POST");
		assert.ok(calls[0]?.init?.body instanceof FormData);
		assert.deepEqual(calls[0]?.init?.headers, {});
		assert.equal(result.parsed_text, "2x + 1 = 5");
	});
});
