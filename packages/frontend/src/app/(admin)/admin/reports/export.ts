export interface AdminReportsData {
	dau: number;
	mau: number;
	totalUsers: number;
	totalLessons: number;
	completedLessons: number;
	completionRate: number;
	avgStudyTimeMinutes: number;
	totalSessions: number;
}

const reportRows: { key: keyof AdminReportsData; label: string }[] = [
	{ key: "dau", label: "DAU" },
	{ key: "mau", label: "MAU" },
	{ key: "avgStudyTimeMinutes", label: "Thời gian TB/ngày" },
	{ key: "completionRate", label: "Tỷ lệ hoàn thành" },
	{ key: "totalUsers", label: "Tổng người dùng" },
	{ key: "totalLessons", label: "Tổng bài học" },
	{ key: "completedLessons", label: "Bài đã hoàn thành" },
	{ key: "totalSessions", label: "Tổng phiên học" },
];

function escapeCsvCell(value: string | number): string {
	const text = String(value);
	if (!/[",\n\r]/.test(text)) return text;
	return `"${text.replace(/"/g, '""')}"`;
}

export function buildAdminReportCsv(
	data: AdminReportsData,
	exportedAt = new Date(),
): string {
	const timestamp = exportedAt.toISOString();
	const rows = reportRows.map((row) => [
		row.key,
		row.label,
		data[row.key],
		timestamp,
	]);

	return [["metric", "label", "value", "exported_at"], ...rows]
		.map((row) => row.map(escapeCsvCell).join(","))
		.join("\n");
}

export function downloadAdminReportCsv(
	data: AdminReportsData,
	date = new Date(),
): void {
	const csv = buildAdminReportCsv(data, date);
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `mathai-admin-report-${date.toISOString().slice(0, 10)}.csv`;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}
