"use client";

import { useEffect, useState } from "react";
import {
	getParentPreferences,
	updateParentPreferences,
	type ParentNotificationPreference,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

type PreferenceForm = {
	notify_session_start: boolean;
	notify_session_complete: boolean;
	notify_absent: boolean;
	notify_daily_summary: boolean;
	notify_weekly_summary: boolean;
	notify_risk_alert: boolean;
	notify_achievement: boolean;
	notify_quiz_result: boolean;
	notify_low_engagement: boolean;
	notify_streak_break: boolean;
	preferred_channel: "in_app" | "push" | "email" | "sms";
	quiet_hours_start: string;
	quiet_hours_end: string;
};

const defaultPreferences: PreferenceForm = {
	notify_session_start: true,
	notify_session_complete: true,
	notify_absent: true,
	notify_daily_summary: false,
	notify_weekly_summary: true,
	notify_risk_alert: true,
	notify_achievement: true,
	notify_quiz_result: true,
	notify_low_engagement: true,
	notify_streak_break: true,
	preferred_channel: "in_app",
	quiet_hours_start: "",
	quiet_hours_end: "",
};

function toForm(preferences: ParentNotificationPreference | null): PreferenceForm {
	if (!preferences) return defaultPreferences;
	return {
		notify_session_start: preferences.notify_session_start ?? true,
		notify_session_complete: preferences.notify_session_complete ?? true,
		notify_absent: preferences.notify_absent ?? preferences.notify_absence ?? true,
		notify_daily_summary: preferences.notify_daily_summary ?? false,
		notify_weekly_summary: preferences.notify_weekly_summary ?? true,
		notify_risk_alert: preferences.notify_risk_alert ?? true,
		notify_achievement: preferences.notify_achievement ?? true,
		notify_quiz_result: preferences.notify_quiz_result ?? preferences.notify_quiz_failure ?? true,
		notify_low_engagement: preferences.notify_low_engagement ?? true,
		notify_streak_break: preferences.notify_streak_break ?? true,
		preferred_channel: preferences.preferred_channel ?? "in_app",
		quiet_hours_start: preferences.quiet_hours_start ?? "",
		quiet_hours_end: preferences.quiet_hours_end ?? "",
	};
}

export default function ParentSettingsPage() {
	const { user } = useAuth(["parent"]);
	const [form, setForm] = useState<PreferenceForm>(defaultPreferences);
	const [hasExistingPreferences, setHasExistingPreferences] = useState(false);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;

		async function loadPreferences() {
			try {
				setLoading(true);
				setError(null);
				const preferences = await getParentPreferences();
				if (mounted) {
					setForm(toForm(preferences));
					setHasExistingPreferences(Boolean(preferences));
				}
			} catch (loadError) {
				if (mounted) {
					setError(loadError instanceof Error ? loadError.message : "Không tải được cài đặt thông báo");
					setHasExistingPreferences(false);
				}
			} finally {
				if (mounted) setLoading(false);
			}
		}

		loadPreferences();
		return () => {
			mounted = false;
		};
	}, []);

	function setBoolean(key: keyof PreferenceForm, value: boolean) {
		setForm((current) => ({ ...current, [key]: value }));
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		try {
			setSaving(true);
			setError(null);
			setSuccess(null);
			const saved = await updateParentPreferences({
				...form,
				quiet_hours_start: form.quiet_hours_start || null,
				quiet_hours_end: form.quiet_hours_end || null,
			});
			setForm(toForm(saved));
			setHasExistingPreferences(true);
			setSuccess("Đã lưu cài đặt thông báo.");
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : "Không lưu được cài đặt thông báo");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="max-w-2xl space-y-6">
			<h1 className="text-2xl font-bold text-gray-900">Cài đặt ⚙️</h1>

			<div className="space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
				<h2 className="text-lg font-bold text-gray-900">Thông tin tài khoản</h2>
				<div>
					<label className="mb-2 block text-sm font-medium text-gray-700">Họ và tên</label>
					<input value={user?.full_name ?? ""} readOnly className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-700 outline-none" />
				</div>
				<div>
					<label className="mb-2 block text-sm font-medium text-gray-700">Email</label>
					<input value={user?.email ?? ""} readOnly type="email" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-700 outline-none" />
				</div>
				<p className="text-xs text-gray-500">Trang này chưa có API cập nhật hồ sơ phụ huynh; chỉ hiển thị dữ liệu đăng nhập hiện tại.</p>
			</div>

			<form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h2 className="text-lg font-bold text-gray-900">Thông báo</h2>
						<p className="text-sm text-gray-500">Cài đặt này dùng API preferences hiện có; không kích hoạt job email/SMS/push production.</p>
					</div>
					{loading && <span className="text-xs text-gray-400">Đang tải...</span>}
				</div>

				{!loading && !hasExistingPreferences && !error && (
					<div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">Chưa có preference trong backend. Biểu mẫu đang dùng mặc định an toàn; bấm lưu để tạo cấu hình thật.</div>
				)}
				{error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
				{success && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>}

				<div className="space-y-3">
					{([
						["notify_session_start", "Thông báo khi con bắt đầu học"],
						["notify_session_complete", "Thông báo khi con hoàn thành buổi học"],
						["notify_absent", "Cảnh báo vắng học/không học"],
						["notify_quiz_result", "Kết quả quiz cuối buổi"],
						["notify_risk_alert", "Cảnh báo rủi ro học tập"],
						["notify_achievement", "Thành tích và mốc tiến bộ"],
						["notify_low_engagement", "Cảnh báo khi con ít tương tác"],
						["notify_streak_break", "Cảnh báo khi chuỗi học bị gián đoạn"],
						["notify_weekly_summary", "Báo cáo hàng tuần"],
						["notify_daily_summary", "Tóm tắt hằng ngày"],
					] as Array<[keyof PreferenceForm, string]>).map(([key, label]) => (
						<label key={key} className="flex items-center justify-between gap-4">
							<span className="text-sm text-gray-700">{label}</span>
							<input type="checkbox" checked={Boolean(form[key])} onChange={(event) => setBoolean(key, event.target.checked)} className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
						</label>
					))}
				</div>

				<div className="grid gap-4 md:grid-cols-3">
					<div>
						<label className="mb-2 block text-sm font-medium text-gray-700">Kênh ưu tiên</label>
						<select value={form.preferred_channel} onChange={(event) => setForm((current) => ({ ...current, preferred_channel: event.target.value as PreferenceForm["preferred_channel"] }))} className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20">
							<option value="in_app">Trong ứng dụng</option>
							<option value="email">Email</option>
							<option value="sms">SMS</option>
							<option value="push">Thông báo đẩy</option>
						</select>
					</div>
					<div>
						<label className="mb-2 block text-sm font-medium text-gray-700">Giờ yên lặng từ</label>
						<input type="time" value={form.quiet_hours_start} onChange={(event) => setForm((current) => ({ ...current, quiet_hours_start: event.target.value }))} className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
					</div>
					<div>
						<label className="mb-2 block text-sm font-medium text-gray-700">Đến</label>
						<input type="time" value={form.quiet_hours_end} onChange={(event) => setForm((current) => ({ ...current, quiet_hours_end: event.target.value }))} className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
					</div>
				</div>

				<button type="submit" disabled={loading || saving} className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300">
					{saving ? "Đang lưu..." : "Lưu cài đặt"}
				</button>
			</form>
		</div>
	);
}
