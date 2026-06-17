"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { resetPassword } from "@/lib/api";

export default function ResetPasswordPage() {
	const [token] = useState(() => {
		if (typeof window === "undefined") {
			return "";
		}

		const params = new URLSearchParams(window.location.search);
		return params.get("token") || "";
	});
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError("");
		setMessage("");

		if (!token) {
			setError("Liên kết đặt lại mật khẩu không hợp lệ hoặc thiếu token.");
			return;
		}

		if (password.length < 8) {
			setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
			return;
		}

		if (password !== confirmPassword) {
			setError("Mật khẩu xác nhận không khớp.");
			return;
		}

		setLoading(true);
		try {
			const result = await resetPassword(token, password);
			setMessage(
				result.message ||
					"Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.",
			);
			setPassword("");
			setConfirmPassword("");
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Không thể đặt lại mật khẩu.",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
			<div className="mb-6">
				<p className="text-sm font-medium text-indigo-600">Bảo mật tài khoản</p>
				<h1 className="mt-2 text-2xl font-bold text-gray-900">
					Đặt lại mật khẩu
				</h1>
				<p className="mt-2 text-sm leading-6 text-gray-600">
					Tạo mật khẩu mới cho tài khoản MathAI. Liên kết chỉ có hiệu lực trong
					thời gian giới hạn.
				</p>
			</div>

			{!token && (
				<div
					className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
					role="alert"
				>
					Liên kết đặt lại mật khẩu thiếu token. Vui lòng yêu cầu gửi lại email
					đặt lại mật khẩu.
				</div>
			)}

			<form className="space-y-5" onSubmit={handleSubmit}>
				<div>
					<label
						htmlFor="password"
						className="block text-sm font-medium text-gray-700"
					>
						Mật khẩu mới
					</label>
					<input
						id="password"
						type="password"
						autoComplete="new-password"
						required
						minLength={8}
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						className="mt-2 block w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
						disabled={loading || !token}
					/>
				</div>

				<div>
					<label
						htmlFor="confirm-password"
						className="block text-sm font-medium text-gray-700"
					>
						Xác nhận mật khẩu mới
					</label>
					<input
						id="confirm-password"
						type="password"
						autoComplete="new-password"
						required
						minLength={8}
						value={confirmPassword}
						onChange={(event) => setConfirmPassword(event.target.value)}
						className="mt-2 block w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
						disabled={loading || !token}
					/>
				</div>

				{error && (
					<div
						className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
						role="alert"
					>
						{error}
					</div>
				)}

				{message && (
					<div
						className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
						role="status"
					>
						{message}
					</div>
				)}

				<button
					type="submit"
					disabled={loading || !token}
					className="flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-300"
				>
					{loading ? "Đang đặt lại..." : "Đặt lại mật khẩu"}
				</button>
			</form>

			<div className="mt-6 flex flex-col gap-3 text-center text-sm">
				{message && (
					<Link
						href="/login"
						className="font-medium text-indigo-600 hover:text-indigo-500"
					>
						Đăng nhập bằng mật khẩu mới
					</Link>
				)}
				<Link
					href="/forgot-password"
					className="font-medium text-gray-600 hover:text-gray-900"
				>
					Yêu cầu liên kết mới
				</Link>
			</div>
		</div>
	);
}
