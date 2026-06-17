import type {
	StudentOnboardingStatus,
	StudentProfileData,
	StudentProfileResponse,
	StudentThemePreferenceData,
} from "./api";

export interface AuthSessionUser {
	id?: string;
	_id?: string;
	email: string;
	full_name?: string;
	role: string;
	is_active?: boolean;
}

export interface CompleteAuthSessionOptions {
	user: AuthSessionUser;
	accessToken: string;
	refreshToken?: string;
	storage: Storage;
	studentProfile?: StudentProfileResponse | null;
	fetchStudentProfile?: () => Promise<StudentProfileResponse>;
	studentCompleteRedirect?: string;
}

const STUDENT_INCOMPLETE_ONBOARDING_REDIRECT = "/dashboard/settings";
const DEFAULT_STUDENT_COMPLETE_REDIRECT = "/dashboard";
export const AGE_THEME_GRADE_CHANGED_EVENT = "mathai-age-theme-grade-changed";

const roleRedirects: Record<string, string> = {
	admin: "/admin",
	student: DEFAULT_STUDENT_COMPLETE_REDIRECT,
	parent: "/parent",
	teacher: "/teacher",
	staff: "/admin",
};

function isValidGrade(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= 1 &&
		value <= 12
	);
}

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? parsed
			: null;
	} catch {
		return null;
	}
}

function getDefaultEventTarget(): EventTarget | null {
	return typeof window === "undefined" ? null : window;
}

function dispatchAgeThemeGradeChanged(
	eventTarget: EventTarget | null | undefined,
	grade: number,
): void {
	if (!eventTarget) return;

	const event =
		typeof CustomEvent === "function"
			? new CustomEvent<{ grade: number }>(AGE_THEME_GRADE_CHANGED_EVENT, {
					detail: { grade },
				})
			: Object.assign(new Event(AGE_THEME_GRADE_CHANGED_EVENT), {
					detail: { grade },
				});

	eventTarget.dispatchEvent(event);
}

export function getInitialAgeThemeGrade(
	storage: Storage | null | undefined,
): number {
	if (!storage) return 7;

	const profile = parseJsonRecord(storage.getItem("mathai-student-profile"));
	const profileGrade = profile?.grade_level;
	if (isValidGrade(profileGrade)) return profileGrade;

	const saved = storage.getItem("mathai-student-grade");
	if (!saved) return 7;
	const parsed = Number.parseInt(saved, 10);
	return isValidGrade(parsed) ? parsed : 7;
}

export function persistStudentPersonalization(
	storage: Storage,
	data: {
		profile?: StudentProfileData | null;
		theme?: StudentThemePreferenceData | null;
		onboarding?: StudentOnboardingStatus | null;
	},
	eventTarget: EventTarget | null | undefined = getDefaultEventTarget(),
): void {
	if (data.profile) {
		storage.setItem("mathai-student-profile", JSON.stringify(data.profile));
		if (isValidGrade(data.profile.grade_level)) {
			storage.setItem("mathai-student-grade", String(data.profile.grade_level));
			dispatchAgeThemeGradeChanged(eventTarget, data.profile.grade_level);
		}
	}

	if (data.theme) {
		storage.setItem("mathai-student-theme", JSON.stringify(data.theme));
	}

	if (data.onboarding) {
		storage.setItem(
			"mathai-student-onboarding",
			JSON.stringify(data.onboarding),
		);
	}
}

export function getStudentRedirect(
	onboarding: StudentOnboardingStatus | null | undefined,
	completeRedirect = DEFAULT_STUDENT_COMPLETE_REDIRECT,
): string {
	return onboarding?.completed === false
		? STUDENT_INCOMPLETE_ONBOARDING_REDIRECT
		: completeRedirect;
}

export async function completeAuthSession({
	user,
	accessToken,
	refreshToken,
	storage,
	studentProfile,
	fetchStudentProfile,
	studentCompleteRedirect = DEFAULT_STUDENT_COMPLETE_REDIRECT,
}: CompleteAuthSessionOptions): Promise<string> {
	storage.setItem("token", accessToken);
	if (refreshToken) {
		storage.setItem("mathai-refresh-token", refreshToken);
	}
	storage.setItem("user", JSON.stringify(user));
	storage.setItem("mathai-user", JSON.stringify(user));

	if (user.role !== "student") {
		return roleRedirects[user.role] ?? DEFAULT_STUDENT_COMPLETE_REDIRECT;
	}

	const hydratedProfile =
		studentProfile ?? (await fetchStudentProfile?.()) ?? null;
	if (!hydratedProfile) {
		return studentCompleteRedirect;
	}

	persistStudentPersonalization(storage, {
		profile: hydratedProfile.profile,
		theme: hydratedProfile.theme,
		onboarding: hydratedProfile.onboarding,
	});

	return getStudentRedirect(
		hydratedProfile.onboarding,
		studentCompleteRedirect,
	);
}
