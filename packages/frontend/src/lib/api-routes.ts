const encodeRouteSegment = (value: string | number): string =>
	encodeURIComponent(String(value));

export const AI_MODEL_DISCOVERY_ROUTE = "/api/ai/models" as const;

export const SOLVER_ROUTES = {
	solve: "/solver/solve",
	parseImage: "/solver/parse-image",
} as const;

export const PARENT_ROUTES = {
	childDashboard: (studentId: string) =>
		`/parent/children/${encodeRouteSegment(studentId)}/dashboard`,
	weeklyReport: (rangeDays: number) =>
		`/parent/reports/weekly?range_days=${encodeRouteSegment(rangeDays)}`,
	preferences: "/parent/preferences",
} as const;

export const ADMIN_POINT_ROUTES = {
	dashboardPoints: "/dashboard/points",
	dashboardPointSummary: "/dashboard/points/summary",
	studentPoints: (studentId: string) =>
		`/admin/students/${encodeRouteSegment(studentId)}/points`,
} as const;

export const ADMIN_AI_PROVIDER_ROUTES = {
	collection: "/admin/ai/providers",
	item: (providerId: string) =>
		`/admin/ai/providers/${encodeRouteSegment(providerId)}`,
	activate: (providerId: string) =>
		`/admin/ai/providers/${encodeRouteSegment(providerId)}/activate`,
	test: (providerId: string) =>
		`/admin/ai/providers/${encodeRouteSegment(providerId)}/test`,
} as const;
