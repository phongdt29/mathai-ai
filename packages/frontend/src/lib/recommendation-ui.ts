import type { AdaptiveRecommendation } from "./api";

type RecommendationTone = "amber" | "blue" | "emerald" | "slate";

export type RecommendationPill = {
	label: string;
	value: string;
	tone: RecommendationTone;
};

export type RecommendationTopicGroup = {
	label: string;
	topics: string[];
	hiddenCount: number;
	tone: RecommendationTone;
};

export type RecommendationDisplaySummary = {
	classification: string | null;
	quizScore: string | null;
	currentStreak: string | null;
	focusText: string;
	friendlyTip: string | null;
	pills: RecommendationPill[];
	topicGroups: RecommendationTopicGroup[];
};

const MAX_VISIBLE_TOPICS = 4;

const classificationLabels: Record<string, string> = {
	advanced: "Nâng cao",
	average: "Trung bình",
	beginner: "Mới bắt đầu",
	can_on_tap: "Cần ôn tập",
	needs_practice: "Cần luyện tập",
	trung_binh: "Trung bình",
};

export function cleanRecommendationTopics(topics?: unknown[] | null): string[] {
	const seen = new Set<string>();
	const cleanTopics: string[] = [];

	for (const topic of topics ?? []) {
		const name = typeof topic === "string" ? topic.replace(/\s+/g, " ").trim() : "";
		const key = name.toLowerCase();
		if (!hasTopicContent(name) || seen.has(key)) continue;

		seen.add(key);
		cleanTopics.push(name);
	}

	return cleanTopics;
}

function hasTopicContent(topic: string): boolean {
	return topic.replace(/[,\s.;:|/\\()[\]{}_-]+/g, "").length > 0;
}

export function formatClassification(value?: string | null): string | null {
	const cleanValue = value?.trim();
	if (!cleanValue) return null;

	const key = cleanValue.toLowerCase();
	if (classificationLabels[key]) return classificationLabels[key];

	return cleanValue
		.split(/[_-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function formatPercent(value: number): string {
	return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function allRecommendationText(
	recommendation: AdaptiveRecommendation | null,
): string {
	if (!recommendation) return "";

	return [
		recommendation.new_lesson?.reason,
		recommendation.fallback_reason,
		...recommendation.learning_tips,
	]
		.filter((value): value is string => Boolean(value))
		.join(" ");
}

function extractContextValue(text: string, label: string): string | null {
	const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = text.match(new RegExp(`${escapedLabel}:\\s*([^;.]+)`, "i"));
	return match?.[1]?.trim() || null;
}

function isTechnicalContextTip(tip: string): boolean {
	return tip.trim().startsWith("Gợi ý được cá nhân hóa theo");
}

function getFriendlyTip(recommendation: AdaptiveRecommendation | null): string | null {
	return (
		recommendation?.learning_tips.find(
			(tip) => tip.trim().length > 0 && !isTechnicalContextTip(tip),
		) ?? null
	);
}

function visibleTopicGroup(
	label: string,
	topics: string[],
	tone: RecommendationTone,
): RecommendationTopicGroup | null {
	if (topics.length === 0) return null;

	return {
		label,
		topics: topics.slice(0, MAX_VISIBLE_TOPICS),
		hiddenCount: Math.max(0, topics.length - MAX_VISIBLE_TOPICS),
		tone,
	};
}

function buildFocusText(
	recommendation: AdaptiveRecommendation | null,
	quizScore: string | null,
	reviewTopics: string[],
	reinforceTopics: string[],
): string {
	if (!recommendation) return "";
	if (recommendation.fallback_reason) return recommendation.fallback_reason;
	if (quizScore && reinforceTopics.length > 0) {
		return `Bạn vừa đạt ${quizScore}. Hôm nay tiếp tục bài mới và củng cố các chủ đề còn hay sai.`;
	}
	if (reviewTopics.length > 0 && reinforceTopics.length > 0) {
		return "Hôm nay nên học bài mới, ôn lại phần dễ quên và củng cố các chủ đề dưới đây.";
	}
	if (reinforceTopics.length > 0) {
		return "Bài mới đi kèm một vài chủ đề cần củng cố để giữ nền kiến thức chắc hơn.";
	}
	if (reviewTopics.length > 0) {
		return "Có một vài chủ đề nên ôn ngắn trước khi học tiếp bài mới.";
	}
	if (recommendation.new_lesson) {
		return "Bài này phù hợp với lộ trình hiện tại của bạn.";
	}

	return "Chưa có gợi ý cụ thể hôm nay.";
}

export function getRecommendationDisplaySummary(
	recommendation: AdaptiveRecommendation | null,
): RecommendationDisplaySummary {
	const rawText = allRecommendationText(recommendation);
	const reviewTopics = cleanRecommendationTopics(
		recommendation?.signals.forgetting_risk_topics,
	);
	const reinforceTopics = cleanRecommendationTopics(
		recommendation?.signals.recurring_error_topics,
	);
	const classification = formatClassification(
		extractContextValue(rawText, "phân loại đầu vào"),
	);
	const quizScore =
		recommendation?.signals.last_quiz_score !== null &&
		recommendation?.signals.last_quiz_score !== undefined
			? formatPercent(recommendation.signals.last_quiz_score)
			: extractContextValue(rawText, "điểm quiz gần nhất");
	const currentStreak =
		recommendation?.stats.current_streak && recommendation.stats.current_streak > 0
			? `${recommendation.stats.current_streak} ngày`
			: extractContextValue(rawText, "streak hiện tại");

	const pills: RecommendationPill[] = [
		classification ? { label: "Phân loại", value: classification, tone: "blue" } : null,
		quizScore ? { label: "Quiz gần nhất", value: quizScore, tone: "emerald" } : null,
		currentStreak ? { label: "Streak", value: currentStreak, tone: "amber" } : null,
	].filter((pill): pill is RecommendationPill => pill !== null);

	const topicGroups = [
		visibleTopicGroup("Cần ôn", reviewTopics, "amber"),
		visibleTopicGroup("Cần củng cố", reinforceTopics, "emerald"),
	].filter((group): group is RecommendationTopicGroup => group !== null);

	return {
		classification,
		quizScore,
		currentStreak,
		focusText: buildFocusText(recommendation, quizScore, reviewTopics, reinforceTopics),
		friendlyTip: getFriendlyTip(recommendation),
		pills,
		topicGroups,
	};
}
