"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { requestPasswordReset } from "@/lib/api";

const genericSuccessMessage =
	"Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi trong vài phút.";

export default function ForgotPasswordPage() {
	const [email, setEmail] = useState("");
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const normalizedEmail = email.trim();
		setError("");
		setMessage("");

		if (!normalizedEmail) {
			setError("Vui lòng nhập email đã đăng ký.");
			return;
		}

		setLoading(true);
		try {
			const result = await requestPasswordReset(normalizedEmail);
			setMessage(result.message || genericSuccessMessage);
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Không thể gửi yêu cầu đặt lại mật khẩu.",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
			<div className="mb-6">
				<p className="text-sm font-medium text-indigo-600">
					Khôi phục tài khoản
				</p>
				<h1 className="mt-2 text-2xl font-bold text-gray-900">Quên mật khẩu</h1>
				<p className="mt-2 text-sm leading-6 text-gray-600">
					Nhập email tài khoản MathAI. Nếu email tồn tại trong hệ thống, chúng
					tôi sẽ gửi liên kết đặt lại mật khẩu an toàn.
				</p>
			</div>

			<form className="space-y-5" onSubmit={handleSubmit}>
				<div>
					<label
						htmlFor="email"
						className="block text-sm font-medium text-gray-700"
					>
						Email đăng nhập
					</label>
					<input
						id="email"
						type="email"
						autoComplete="email"
						required
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						className="mt-2 block w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
						placeholder="student@example.com"
						disabled={loading}
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
					disabled={loading}
					className="flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-300"
				>
					{loading ? "Đang gửi hướng dẫn..." : "Gửi hướng dẫn đặt lại"}
				</button>
			</form>

			<div className="mt-6 text-center">
				<Link
					href="/login"
					className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
				>
					Quay lại đăng nhập
				</Link>
			</div>
		</div>
	);
}
