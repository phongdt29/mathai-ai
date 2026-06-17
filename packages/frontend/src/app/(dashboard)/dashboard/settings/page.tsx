"use client";

import { AlertTriangle, Loader2, Save, Settings, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAgeTheme } from "@/contexts/AgeThemeContext";
import {
	getStudentProfile,
	getStudentTutors,
	type StudentOnboardingStatus,
	type StudentSelfAssessedLevel,
	type StudentTutorData,
	selectStudentTutor,
	updateStudentProfile,
	updateStudentTheme,
} from "@/lib/api";
import { persistStudentPersonalization } from "@/lib/auth-onboarding";

type FormState = {
	fullName: string;
	email: string;
	dateOfBirth: string;
	phone: string;
	address: string;
	schoolName: string;
	gradeLevel: string;
	selfAssessedLevel: StudentSelfAssessedLevel;
	mathAverageScore: string;
	interests: string;
	selectedTutorId: string;
	favoriteColor: string;
	fontSize: "small" | "medium" | "large";
	themeMode: "light" | "dark";
};

const defaultForm: FormState = {
	fullName: "",
	email: "",
	dateOfBirth: "",
	phone: "",
	address: "",
	schoolName: "",
	gradeLevel: "",
	selfAssessedLevel: "average",
	mathAverageScore: "",
	interests: "",
	selectedTutorId: "",
	favoriteColor: "#4F46E5",
	fontSize: "medium",
	themeMode: "light",
};

function getDocumentId(value: { id?: string; _id?: string }) {
	return value.id ?? value._id ?? "";
}

export default function SettingsPage() {
	const [form, setForm] = useState<FormState>(defaultForm);
	const [tutors, setTutors] = useState<StudentTutorData[]>([]);
	const [saved, setSaved] = useState(false);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [onboarding, setOnboarding] = useState<StudentOnboardingStatus | null>(
		null,
	);
	const { theme, ageGroup } = useAgeTheme();

	const tutorOptions = useMemo(
		() =>
			tutors
				.map((tutor) => ({ ...tutor, documentId: getDocumentId(tutor) }))
				.filter((tutor) => tutor.documentId),
		[tutors],
	);

	useEffect(() => {
		let cancelled = false;

		async function loadSettings() {
			setLoading(true);
			setError("");

			try {
				const [profileData, tutorData] = await Promise.all([
					getStudentProfile(),
					getStudentTutors(),
				]);

				if (cancelled) return;

				setTutors(tutorData);
				setOnboarding(profileData.onboarding);
				setForm({
					fullName: profileData.user.full_name ?? "",
					email: profileData.user.email ?? "",
					dateOfBirth: profileData.profile.date_of_birth
						? String(profileData.profile.date_of_birth).slice(0, 10)
						: "",
					phone: profileData.profile.phone ?? "",
					address: profileData.profile.address ?? "",
					schoolName: profileData.profile.school_name ?? "",
					gradeLevel: profileData.profile.grade_level
						? String(profileData.profile.grade_level)
						: "",
					selfAssessedLevel:
						profileData.profile.self_assessed_level ?? "average",
					mathAverageScore:
						profileData.profile.math_average_score !== null &&
						profileData.profile.math_average_score !== undefined
							? String(profileData.profile.math_average_score)
							: "",
					interests: profileData.profile.interests ?? "",
					selectedTutorId: profileData.profile.selected_tutor_id ?? "",
					favoriteColor:
						profileData.theme.favorite_color ??
						profileData.profile.favorite_color ??
						"#4F46E5",
					fontSize: profileData.theme.font_size ?? "medium",
					themeMode: profileData.theme.theme_mode ?? "light",
				});
			} catch (err: unknown) {
				if (!cancelled) {
					setError(
						err instanceof Error
							? err.message
							: "Không tải được hồ sơ học sinh.",
					);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}

		loadSettings();
		return () => {
			cancelled = true;
		};
	}, []);

	const inputClass =
		ageGroup === "elementary"
			? `w-full border-2 border-blue-200 px-5 py-4 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-300/30 text-xl ${theme.buttonRadius}`
			: ageGroup === "high"
				? `w-full border border-blue-200 px-4 py-2.5 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600/10 text-lg rounded-lg`
				: `w-full border border-blue-200 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl`;

	const updateField = <Key extends keyof FormState>(
		key: Key,
		value: FormState[Key],
	) => {
		setForm((current) => ({ ...current, [key]: value }));
	};

	const handleSave = async (event: React.FormEvent) => {
		event.preventDefault();
		setSaving(true);
		setSaved(false);
		setError("");

		try {
			const gradeLevel = form.gradeLevel.trim()
				? Number(form.gradeLevel)
				: undefined;
			const mathAverageScore = form.mathAverageScore.trim()
				? Number(form.mathAverageScore)
				: undefined;

			const updatedProfile = await updateStudentProfile({
				full_name: form.fullName.trim(),
				date_of_birth: form.dateOfBirth || undefined,
				phone: form.phone.trim(),
				address: form.address.trim(),
				school_name: form.schoolName.trim(),
				grade_level: gradeLevel,
				self_assessed_level: form.selfAssessedLevel,
				math_average_score: mathAverageScore,
				interests: form.interests.trim(),
				selected_tutor_id: form.selectedTutorId || undefined,
			});
			setOnboarding(
				buildOnboardingStatus({
					fullName: form.fullName,
					gradeLevel: updatedProfile.grade_level ?? gradeLevel ?? null,
					selfAssessedLevel:
						updatedProfile.self_assessed_level ?? form.selfAssessedLevel,
				}),
			);

			await updateStudentTheme({
				favorite_color: form.favoriteColor,
				font_size: form.fontSize,
				theme_mode: form.themeMode,
			});

			if (form.selectedTutorId) {
				await selectStudentTutor(form.selectedTutorId);
			}

			persistStudentPersonalization(localStorage, {
				profile: {
					grade_level: updatedProfile.grade_level ?? gradeLevel ?? null,
					self_assessed_level:
						updatedProfile.self_assessed_level ?? form.selfAssessedLevel,
					selected_tutor_id: form.selectedTutorId || null,
				},
			});
			const storedUser =
				localStorage.getItem("user") ?? localStorage.getItem("mathai-user");
			const parsedUser = storedUser
				? (JSON.parse(storedUser) as Record<string, unknown>)
				: {};
			const nextUser = {
				...parsedUser,
				email: form.email,
				full_name: form.fullName.trim(),
				role: typeof parsedUser.role === "string" ? parsedUser.role : "student",
				is_active:
					typeof parsedUser.is_active === "boolean"
						? parsedUser.is_active
						: true,
			};
			localStorage.setItem("user", JSON.stringify(nextUser));
			localStorage.setItem("mathai-user", JSON.stringify(nextUser));

			setSaved(true);
			setTimeout(() => setSaved(false), 3000);
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : "Không lưu được thay đổi hồ sơ.",
			);
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<div className={`max-w-2xl flex flex-col ${theme.sectionGap}`}>
				<div
					className={`bg-white ${theme.cardRadius} ${theme.cardPadding} border border-blue-100 text-center shadow-sm`}
				>
					<Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
					<p className="mt-3 text-blue-600/70">Đang tải hồ sơ học sinh...</p>
				</div>
			</div>
		);
	}

	return (
		<div className={`max-w-3xl flex flex-col ${theme.sectionGap}`}>
			<div>
				<h1 className={`text-2xl ${theme.fontWeight} text-blue-900`}>
					{ageGroup === "elementary" && theme.showEmojis
						? "Cài đặt của bạn"
						: "Cài đặt"}
				</h1>
				<p className="text-lg text-blue-600/70">
					Hồ sơ, giao diện học tập và tutor AI được lưu trực tiếp vào tài khoản
					MathAI.
				</p>
			</div>

			{ageGroup === "elementary" && theme.showMascot && (
				<div
					className={`flex items-center gap-3 bg-blue-50 border-2 border-blue-200 ${theme.cardPadding} ${theme.cardRadius}`}
				>
					<Settings className="w-10 h-10 text-blue-500" />
					<p className="text-lg font-bold text-blue-700">
						Gấu con sẽ giúp bạn cài đặt nhé!
					</p>
				</div>
			)}

			{onboarding && (
				<div
					className={`${theme.cardRadius} ${theme.cardPadding} ${onboarding.completed ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}`}
				>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p
								className={`text-lg ${theme.fontWeight} ${onboarding.completed ? "text-emerald-700" : "text-amber-700"}`}
							>
								{onboarding.completed
									? "Hồ sơ học tập đã sẵn sàng"
									: "Hoàn thiện hồ sơ để cá nhân hóa tốt hơn"}
							</p>
							<p
								className={`text-base ${onboarding.completed ? "text-emerald-700/70" : "text-amber-700/70"}`}
							>
								{onboarding.completed
									? "MathAI đã có đủ thông tin cốt lõi để đề xuất lộ trình học."
									: `Còn thiếu: ${onboarding.missing_fields.map(formatOnboardingField).join(", ")}.`}
							</p>
						</div>
						<div className="text-left sm:text-right">
							<p
								className={`text-3xl ${theme.fontWeight} ${onboarding.completed ? "text-emerald-700" : "text-amber-700"}`}
							>
								{onboarding.completion_percentage}%
							</p>
							<p className="text-sm uppercase tracking-[0.2em] text-slate-500">
								Hoàn thiện
							</p>
						</div>
					</div>
					<div className="mt-4 h-2 overflow-hidden rounded-full bg-white/70">
						<div
							className={`h-full rounded-full ${onboarding.completed ? "bg-emerald-500" : "bg-amber-500"}`}
							style={{ width: `${onboarding.completion_percentage}%` }}
						/>
					</div>
				</div>
			)}

			{saved && (
				<div
					className={`px-4 py-3 ${theme.cardRadius} ${ageGroup === "elementary" ? "bg-green-50 border-2 border-green-300 text-green-700 font-bold text-xl" : "bg-green-50 border border-green-200 text-green-600 text-lg"}`}
				>
					{ageGroup === "elementary" && theme.showEmojis
						? "Đã lưu rồi nè! Tuyệt vời!"
						: "✓ Đã lưu thay đổi thành công!"}
				</div>
			)}

			{error && (
				<div
					className={`px-4 py-3 ${theme.cardRadius} bg-red-50 border border-red-200 text-red-700`}
				>
					{error}
				</div>
			)}

			<form
				onSubmit={handleSave}
				className={`flex flex-col ${theme.cardRadius} ${ageGroup === "elementary" ? "bg-white shadow-md ring-1 ring-blue-100/80 gap-6 p-7" : ageGroup === "high" ? "bg-white border border-blue-200 gap-5 p-6" : "bg-white shadow-sm ring-1 ring-blue-100 gap-5 p-6"}`}
			>
				<h2 className={`text-2xl ${theme.fontWeight} text-blue-900`}>
					{ageGroup === "elementary" && theme.showEmojis
						? "Thông tin của bạn"
						: "Thông tin học tập"}
				</h2>

				<div className="grid gap-4 md:grid-cols-2">
					<Field
						label={
							ageGroup === "elementary" && theme.showEmojis
								? "Tên của bạn là gì?"
								: "Họ và tên"
						}
					>
						<input
							value={form.fullName}
							onChange={(event) => updateField("fullName", event.target.value)}
							className={inputClass}
							required
						/>
					</Field>

					<Field label="Email">
						<input
							value={form.email}
							type="email"
							className={`${inputClass} bg-slate-50 text-slate-500`}
							readOnly
						/>
					</Field>

					<Field label="Ngày sinh">
						<input
							value={form.dateOfBirth}
							onChange={(event) =>
								updateField("dateOfBirth", event.target.value)
							}
							type="date"
							className={inputClass}
						/>
					</Field>

					<Field label="Số điện thoại">
						<input
							value={form.phone}
							onChange={(event) => updateField("phone", event.target.value)}
							className={inputClass}
						/>
					</Field>

					<Field label="Trường học">
						<input
							value={form.schoolName}
							onChange={(event) =>
								updateField("schoolName", event.target.value)
							}
							className={inputClass}
						/>
					</Field>

					<Field label="Khối lớp">
						<input
							value={form.gradeLevel}
							onChange={(event) =>
								updateField("gradeLevel", event.target.value)
							}
							type="number"
							min="1"
							max="12"
							className={inputClass}
						/>
					</Field>

					<Field label="Tự đánh giá học lực">
						<select
							value={form.selfAssessedLevel}
							onChange={(event) =>
								updateField(
									"selfAssessedLevel",
									event.target.value as StudentSelfAssessedLevel,
								)
							}
							className={inputClass}
						>
							<option value="weak">Cần hỗ trợ nhiều</option>
							<option value="average">Trung bình</option>
							<option value="good">Khá</option>
							<option value="excellent">Tốt</option>
						</select>
					</Field>

					<Field label="Điểm toán trung bình">
						<input
							value={form.mathAverageScore}
							onChange={(event) =>
								updateField("mathAverageScore", event.target.value)
							}
							type="number"
							min="0"
							max="10"
							step="0.1"
							className={inputClass}
						/>
					</Field>
				</div>

				<Field label="Địa chỉ">
					<input
						value={form.address}
						onChange={(event) => updateField("address", event.target.value)}
						className={inputClass}
					/>
				</Field>

				<Field label="Sở thích học tập">
					<textarea
						value={form.interests}
						onChange={(event) => updateField("interests", event.target.value)}
						rows={3}
						className={inputClass}
						placeholder="Ví dụ: hình học, bài toán thực tế, học qua trò chơi..."
					/>
				</Field>

				<div className="grid gap-4 md:grid-cols-2">
					<Field label="Tutor AI đồng hành">
						<select
							value={form.selectedTutorId}
							onChange={(event) =>
								updateField("selectedTutorId", event.target.value)
							}
							className={inputClass}
						>
							<option value="">Chưa chọn tutor</option>
							{tutorOptions.map((tutor) => (
								<option key={tutor.documentId} value={tutor.documentId}>
									{tutor.avatar_emoji ? `${tutor.avatar_emoji} ` : ""}
									{tutor.display_name ?? tutor.name ?? tutor.code}
								</option>
							))}
						</select>
					</Field>

					<Field label="Màu yêu thích">
						<input
							value={form.favoriteColor}
							onChange={(event) =>
								updateField("favoriteColor", event.target.value)
							}
							type="color"
							className={`${inputClass} h-14 p-2`}
						/>
					</Field>

					<Field label="Cỡ chữ">
						<select
							value={form.fontSize}
							onChange={(event) =>
								updateField(
									"fontSize",
									event.target.value as FormState["fontSize"],
								)
							}
							className={inputClass}
						>
							<option value="small">Nhỏ</option>
							<option value="medium">Vừa</option>
							<option value="large">Lớn</option>
						</select>
					</Field>

					<Field label="Chế độ giao diện">
						<select
							value={form.themeMode}
							onChange={(event) =>
								updateField(
									"themeMode",
									event.target.value as FormState["themeMode"],
								)
							}
							className={inputClass}
						>
							<option value="light">Sáng</option>
							<option value="dark">Tối</option>
						</select>
					</Field>
				</div>

				<button
					type="submit"
					disabled={saving}
					className={`${theme.buttonRadius} ${ageGroup === "elementary" ? "w-full bg-blue-500 px-8 py-4 font-bold text-white text-xl transition hover:bg-blue-600 active:bg-blue-700" : ageGroup === "high" ? "w-fit bg-blue-600 px-5 py-2.5 font-medium text-white text-lg transition hover:bg-blue-700" : "w-fit bg-blue-600 px-6 py-3 font-semibold text-white text-lg transition hover:bg-blue-700"} disabled:opacity-60`}
				>
					{saving ? (
						<Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
					) : (
						<Save className="mr-2 inline h-4 w-4" />
					)}
					{saving
						? "Đang lưu..."
						: ageGroup === "elementary" && theme.showEmojis
							? "Lưu thay đổi nào!"
							: "Lưu thay đổi"}
				</button>
			</form>

			<div
				className={`${theme.cardRadius} ${theme.cardPadding} ${ageGroup === "high" ? "bg-white border border-blue-200" : "bg-white shadow-sm ring-1 ring-blue-100"}`}
			>
				<h2
					className={`${ageGroup === "elementary" ? "text-lg" : "text-2xl"} ${theme.fontWeight} mb-2 ${ageGroup === "elementary" ? "text-red-500" : "text-red-600"}`}
				>
					<AlertTriangle className="mr-2 inline h-5 w-5" />
					{ageGroup === "elementary" && theme.showEmojis
						? "Cẩn thận nha!"
						: "Vùng nguy hiểm"}
				</h2>
				<p className="mb-4 text-lg text-blue-600/70">
					Xóa tài khoản cần quy trình xác nhận riêng để tránh mất dữ liệu học
					tập ngoài ý muốn.
				</p>
				<button
					className={`${theme.buttonRadius} ${ageGroup === "elementary" ? "border-2 border-red-300 px-5 py-3 font-bold text-red-500 text-lg transition hover:bg-red-50" : ageGroup === "high" ? "border border-red-300 px-4 py-2 text-lg font-medium text-red-600 transition hover:bg-red-50" : "border border-red-300 px-5 py-2.5 text-lg font-medium text-red-600 transition hover:bg-red-50"}`}
				>
					<Trash2 className="mr-2 inline h-4 w-4" />
					Yêu cầu hỗ trợ xóa tài khoản
				</button>
			</div>
		</div>
	);
}

function buildOnboardingStatus(input: {
	fullName: string;
	gradeLevel: number | string | null;
	selfAssessedLevel: StudentSelfAssessedLevel | null;
}): StudentOnboardingStatus {
	const missing_fields: StudentOnboardingStatus["missing_fields"] = [];

	if (!input.fullName.trim()) {
		missing_fields.push("full_name");
	}
	if (!input.gradeLevel) {
		missing_fields.push("grade_level");
	}
	if (!input.selfAssessedLevel) {
		missing_fields.push("self_assessed_level");
	}

	const required_fields: StudentOnboardingStatus["required_fields"] = [
		"full_name",
		"grade_level",
		"self_assessed_level",
	];
	const completion_percentage = Math.round(
		((required_fields.length - missing_fields.length) /
			required_fields.length) *
			100,
	);

	return {
		completed: missing_fields.length === 0,
		completion_percentage,
		required_fields,
		missing_fields,
	};
}

function formatOnboardingField(
	field: StudentOnboardingStatus["missing_fields"][number],
) {
	const labels: Record<
		StudentOnboardingStatus["missing_fields"][number],
		string
	> = {
		full_name: "họ và tên",
		grade_level: "khối lớp",
		self_assessed_level: "tự đánh giá học lực",
	};

	return labels[field];
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<label className="block">
			<span className="mb-2 block text-lg font-medium text-blue-700">
				{label}
			</span>
			{children}
		</label>
	);
}
