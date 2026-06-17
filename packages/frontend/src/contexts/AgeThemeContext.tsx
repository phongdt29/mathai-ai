"use client";

import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import {
	AGE_THEME_GRADE_CHANGED_EVENT,
	getInitialAgeThemeGrade,
} from "@/lib/auth-onboarding";

export type AgeGroup = "elementary" | "middle" | "high";

/** Map grade (1-12) to age group */
export function gradeToAgeGroup(grade: number): AgeGroup {
	if (grade >= 1 && grade <= 5) return "elementary";
	if (grade >= 6 && grade <= 9) return "middle";
	return "high";
}

export interface AgeTheme {
	group: AgeGroup;
	label: string;
	// Typography
	headingSize: string;
	bodySize: string;
	fontWeight: string;
	// Border radius
	cardRadius: string;
	buttonRadius: string;
	// Colors
	primaryGradient: string;
	secondaryGradient: string;
	accentGradient: string;
	bgGradient: string;
	cardBg: string;
	cardBorder: string;
	// Sidebar
	sidebarBg: string;
	sidebarActiveGradient: string;
	// Decorative
	showMascot: boolean;
	showAnimations: boolean;
	showEmojis: boolean;
	emojiSize: string;
	// Spacing
	cardPadding: string;
	sectionGap: string;
	// Button style
	buttonStyle: string;
	// Stats
	statCardStyle: string;
	// Progress bar
	progressHeight: string;
	progressRadius: string;
}

const themes: Record<AgeGroup, AgeTheme> = {
	elementary: {
		group: "elementary",
		label: "Tiểu học (Lớp 1-5)",
		headingSize: "text-5xl",
		bodySize: "text-lg",
		fontWeight: "font-black",
		cardRadius: "rounded-2xl",
		buttonRadius: "rounded-xl",
		primaryGradient: "bg-blue-500",
		secondaryGradient: "bg-emerald-500",
		accentGradient: "bg-amber-500",
		bgGradient: "bg-blue-50",
		cardBg: "bg-white",
		cardBorder: "border-2 border-blue-100",
		sidebarBg: "bg-white border-r border-gray-200",
		sidebarActiveGradient: "bg-blue-500",
		showMascot: true,
		showAnimations: true,
		showEmojis: true,
		emojiSize: "text-5xl",
		cardPadding: "p-6",
		sectionGap: "space-y-8",
		buttonStyle:
			"px-6 py-3 text-lg font-bold hover:opacity-90 transition-opacity duration-200",
		statCardStyle: "p-6 hover:shadow-md transition-shadow duration-300",
		progressHeight: "h-4",
		progressRadius: "rounded-full",
	},
	middle: {
		group: "middle",
		label: "THCS (Lớp 6-9)",
		headingSize: "text-4xl",
		bodySize: "text-base",
		fontWeight: "font-extrabold",
		cardRadius: "rounded-xl",
		buttonRadius: "rounded-lg",
		primaryGradient: "bg-blue-600",
		secondaryGradient: "bg-emerald-600",
		accentGradient: "bg-amber-600",
		bgGradient: "bg-gray-50",
		cardBg: "bg-white",
		cardBorder: "border border-gray-200",
		sidebarBg: "bg-white border-r border-gray-200",
		sidebarActiveGradient: "bg-blue-600",
		showMascot: false,
		showAnimations: true,
		showEmojis: true,
		emojiSize: "text-3xl",
		cardPadding: "p-5",
		sectionGap: "space-y-6",
		buttonStyle:
			"px-5 py-2.5 text-base font-semibold hover:opacity-90 transition-opacity duration-200",
		statCardStyle: "p-5 hover:shadow-md transition-shadow duration-300",
		progressHeight: "h-3",
		progressRadius: "rounded-full",
	},
	high: {
		group: "high",
		label: "THPT (Lớp 10-12)",
		headingSize: "text-3xl",
		bodySize: "text-base",
		fontWeight: "font-bold",
		cardRadius: "rounded-lg",
		buttonRadius: "rounded-lg",
		primaryGradient: "bg-blue-700",
		secondaryGradient: "bg-blue-600",
		accentGradient: "bg-emerald-600",
		bgGradient: "bg-gray-50",
		cardBg: "bg-white",
		cardBorder: "border border-gray-200",
		sidebarBg: "bg-white border-r border-gray-200",
		sidebarActiveGradient: "bg-blue-700",
		showMascot: false,
		showAnimations: false,
		showEmojis: false,
		emojiSize: "text-xl",
		cardPadding: "p-5",
		sectionGap: "space-y-5",
		buttonStyle:
			"px-5 py-2.5 text-base font-medium hover:opacity-90 transition-opacity duration-200",
		statCardStyle: "p-5 hover:shadow-md transition-shadow duration-300",
		progressHeight: "h-2",
		progressRadius: "rounded-full",
	},
};

interface AgeThemeContextValue {
	theme: AgeTheme;
	ageGroup: AgeGroup;
	grade: number;
	setGrade: (grade: number) => void;
	themes: Record<AgeGroup, AgeTheme>;
}

const AgeThemeContext = createContext<AgeThemeContextValue | null>(null);

export function AgeThemeProvider({ children }: { children: ReactNode }) {
	const [grade, setGrade] = useState<number>(() => {
		if (typeof window === "undefined") return 7;
		return getInitialAgeThemeGrade(localStorage);
	}); // default lớp 7

	useEffect(() => {
		localStorage.setItem("mathai-student-grade", String(grade));
	}, [grade]);

	useEffect(() => {
		function handleGradeChanged(event: Event) {
			const nextGrade = (event as CustomEvent<{ grade?: unknown }>).detail
				?.grade;
			if (
				typeof nextGrade === "number" &&
				Number.isInteger(nextGrade) &&
				nextGrade >= 1 &&
				nextGrade <= 12
			) {
				setGrade(nextGrade);
			}
		}

		window.addEventListener(AGE_THEME_GRADE_CHANGED_EVENT, handleGradeChanged);
		return () => {
			window.removeEventListener(
				AGE_THEME_GRADE_CHANGED_EVENT,
				handleGradeChanged,
			);
		};
	}, []);

	const ageGroup = gradeToAgeGroup(grade);

	return (
		<AgeThemeContext.Provider
			value={{ theme: themes[ageGroup], ageGroup, grade, setGrade, themes }}
		>
			{children}
		</AgeThemeContext.Provider>
	);
}

export function useAgeTheme() {
	const ctx = useContext(AgeThemeContext);
	if (!ctx) throw new Error("useAgeTheme must be used within AgeThemeProvider");
	return ctx;
}
