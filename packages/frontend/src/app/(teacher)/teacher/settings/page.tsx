"use client";

import { Bell, Lock, User } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api";

const readOnlyProfileFields = true;

export default function TeacherSettingsPage() {
	const { user } = useAuth(["teacher"]);
	const fullName = user?.full_name || "";
	const email = user?.email || "";

	const [notifications, setNotifications] = useState({
		studentSubmission: true,
		lowScore: true,
		parentMessage: true,
		systemUpdate: false,
	});

	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [passwordError, setPasswordError] = useState("");
	const [passwordSaved, setPasswordSaved] = useState(false);

	async function handleChangePassword() {
		setPasswordError("");
		if (!currentPassword || !newPassword) {
			setPasswordError("Vui lòng nhập đầy đủ thông tin");
			return;
		}
		if (newPassword !== confirmPassword) {
			setPasswordError("Mật khẩu xác nhận không khớp");
			return;
		}
		if (newPassword.length < 6) {
			setPasswordError("Mật khẩu mới phải có ít nhất 6 ký tự");
			return;
		}
		try {
			await apiClient("/auth/change-password", {
				method: "POST",
				body: JSON.stringify({
					current_password: currentPassword,
					new_password: newPassword,
				}),
			});
			setPasswordSaved(true);
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
			setTimeout(() => setPasswordSaved(false), 2000);
		} catch (e: any) {
			setPasswordError(e.message || "Lỗi đổi mật khẩu");
		}
	}

	return (
		<div className="max-w-3xl space-y-6">
			<div>
				<h1 className="text-xl font-bold text-gray-900">Cài đặt</h1>
				<p className="text-sm text-gray-500 mt-0.5">
					Quản lý thông tin cá nhân và tùy chọn
				</p>
			</div>

			{/* Personal Info */}
			<div className="rounded-xl border border-gray-200 bg-white p-6">
				<div className="flex items-center gap-2 mb-5">
					<User className="w-5 h-5 text-emerald-600" />
					<h2 className="text-base font-semibold text-gray-900">
						Thông tin cá nhân
					</h2>
				</div>
				{readOnlyProfileFields && (
					<div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
						Chưa hỗ trợ chỉnh sửa hồ sơ giáo viên trên giao diện này. Thông tin
						bên dưới được lấy từ tài khoản đã xác thực; vui lòng liên hệ quản
						trị viên nếu cần cập nhật.
					</div>
				)}
				<div className="grid md:grid-cols-2 gap-4">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1.5">
							Họ tên
						</label>
						<input
							type="text"
							value={fullName}
							readOnly
							aria-readonly="true"
							className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1.5">
							Email
						</label>
						<input
							type="email"
							value={email}
							disabled
							className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm bg-gray-50 text-gray-500"
						/>
					</div>
				</div>
			</div>

			{/* Notifications */}
			<div className="rounded-xl border border-gray-200 bg-white p-6">
				<div className="flex items-center gap-2 mb-5">
					<Bell className="w-5 h-5 text-emerald-600" />
					<h2 className="text-base font-semibold text-gray-900">Thông báo</h2>
				</div>
				<div className="space-y-4">
					{(
						[
							{
								key: "studentSubmission",
								label: "Học sinh nộp bài",
								desc: "Nhận thông báo khi học sinh nộp bài tập hoặc bài kiểm tra",
							},
							{
								key: "lowScore",
								label: "Điểm thấp",
								desc: "Cảnh báo khi học sinh có điểm dưới trung bình",
							},
							{
								key: "parentMessage",
								label: "Tin nhắn phụ huynh",
								desc: "Thông báo khi phụ huynh gửi tin nhắn",
							},
							{
								key: "systemUpdate",
								label: "Cập nhật hệ thống",
								desc: "Thông báo về tính năng mới và bảo trì",
							},
						] as const
					).map((item) => (
						<div
							key={item.key}
							className="flex items-center justify-between py-2"
						>
							<div>
								<p className="text-sm font-medium text-gray-900">
									{item.label}
								</p>
								<p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
							</div>
							<button
								onClick={() =>
									setNotifications((prev) => ({
										...prev,
										[item.key]: !prev[item.key],
									}))
								}
								className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
									notifications[item.key] ? "bg-emerald-600" : "bg-gray-200"
								}`}
							>
								<span
									className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
										notifications[item.key] ? "translate-x-6" : "translate-x-1"
									}`}
								/>
							</button>
						</div>
					))}
				</div>
			</div>

			{/* Change Password */}
			<div className="rounded-xl border border-gray-200 bg-white p-6">
				<div className="flex items-center gap-2 mb-5">
					<Lock className="w-5 h-5 text-emerald-600" />
					<h2 className="text-base font-semibold text-gray-900">
						Đổi mật khẩu
					</h2>
				</div>
				<div className="space-y-4 max-w-md">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1.5">
							Mật khẩu hiện tại
						</label>
						<input
							type="password"
							value={currentPassword}
							onChange={(e) => setCurrentPassword(e.target.value)}
							placeholder="••••••••"
							className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1.5">
							Mật khẩu mới
						</label>
						<input
							type="password"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							placeholder="••••••••"
							className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1.5">
							Xác nhận mật khẩu mới
						</label>
						<input
							type="password"
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							placeholder="••••••••"
							className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
						/>
					</div>
					{passwordError && (
						<p className="text-sm text-red-600">{passwordError}</p>
					)}
					{passwordSaved && (
						<p className="text-sm text-emerald-600 font-medium">
							Đã đổi mật khẩu thành công!
						</p>
					)}
					<button
						onClick={handleChangePassword}
						className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
					>
						<Lock className="w-4 h-4" />
						Đổi mật khẩu
					</button>
				</div>
			</div>
		</div>
	);
}
