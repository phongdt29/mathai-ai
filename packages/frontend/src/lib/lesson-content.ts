export type LessonIllustration = {
	src: string;
	alt: string;
};

export type ResolvedTheoryContentItem = {
	itemNumber: number;
	current: string;
	displayText: string;
	illustration: LessonIllustration | null;
	previous: { itemNumber: number; text: string } | null;
	next: { itemNumber: number; text: string } | null;
	totalItems: number;
};

export type LessonTimelineItem = {
	kind: "section" | "check";
	href: string;
	label: string;
	title: string;
	itemNumber?: number;
	isCurrent: boolean;
};

export type LessonOverviewContent = {
	contentItems: string[];
	emptyContentMessage: string | null;
	showFinalCheck: boolean;
};

export type LessonOverviewTimelineItem = {
	title: string;
	href: string;
	phase: string;
	itemNumber?: number;
	markerLabel: string;
	ctaLabel: string;
	isFinalCheck: boolean;
};

export type LessonTimelineCurrent =
	| { kind: "section"; itemNumber: number }
	| { kind: "check" };

export type CheckLessonExerciseAnswerInput = {
	answerType: string;
	learnerAnswer: string;
	correctAnswer: string;
	choices?: string[] | null;
};

export type LessonExerciseSignatureInput = {
	order_index: number;
	topic?: string | null;
	difficulty_level?: string | null;
	question_text: string;
	answer_type: string;
	choices?: string[] | null;
	correct_answer: string;
	solution_steps?: string[] | string | null;
	explanation?: string | null;
};

export type LessonExerciseAnswerMode = {
	renderMode: "choice" | "numeric_text" | "open_ended";
	isAutoCheckable: boolean;
	usesDecimalHint: boolean;
};

export type LessonExerciseSolutionFeedback = {
	guidance: string;
	correctAnswer: string;
	detailSteps: string[];
	explanation: string | null;
};

const THEORY_CONTENT_FALLBACK = "Nội dung lý thuyết đang được cập nhật.";
const LIST_MARKER_PATTERN = /^\s*(?:[-*•](?=\s|$)|\d+[.)](?=\s|$))\s*/;
const FINAL_CHECK_MARKER_LABEL = "\u2713";

// Các vùng công thức toán cần giữ nguyên khi strip markdown:
// $$...$$, $...$, \(...\), \[...\]
const MATH_SPAN_PATTERN =
	/(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/;

export function stripMarkdownForDisplay(text: string): string {
	const withoutImagesLinks = text
		.trim()
		.replace(/^#{1,6}\s+/, "")
		.replace(/!\[[^\]]*\]\([^)]+\)/g, "")
		.replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1");

	// Không strip *, _, ` bên trong công thức toán — `$x_1$` phải giữ nguyên
	// chỉ số dưới, `$a*b$` phải giữ nguyên dấu nhân.
	return withoutImagesLinks
		.split(MATH_SPAN_PATTERN)
		.map((part, index) => {
			if (index % 2 === 1) return part;
			return part
				.replace(/\*\*([^*]+)\*\*/g, "$1")
				.replace(/\*([^*]+)\*/g, "$1")
				.replace(/__([^_]+)__/g, "$1")
				.replace(/_([^_]+)_/g, "$1")
				.replace(/`([^`]+)`/g, "$1")
				.replace(/\s{2,}/g, " ");
		})
		.join("")
		.trim();
}

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/;

// Thứ tự rule: cụ thể trước, tổng quát sau (match đầu tiên thắng).
// "Đồ thị hàm số và phương trình" phải ra hình đồ thị, không phải hình phương trình.
const TOPIC_ILLUSTRATION_RULES: Array<{
	pattern: RegExp;
	src: string;
	alt: string;
}> = [
	{
		pattern: /chu vi|hình chữ nhật|hình vuông/i,
		src: "/lessons/illustrations/geometry-rectangle.svg",
		alt: "Hình minh họa chu vi hình chữ nhật",
	},
	{
		pattern: /tam giác|đồng dạng|hình học tam giác/i,
		src: "/lessons/illustrations/geometry-triangle.svg",
		alt: "Hình minh họa tam giác",
	},
	{
		pattern: /phân thức|rút gọn/i,
		src: "/lessons/illustrations/algebra-fraction.svg",
		alt: "Hình minh họa phân thức đại số",
	},
	{
		pattern: /đồ thị|hàm số|tọa độ/i,
		src: "/lessons/illustrations/graph.svg",
		alt: "Hình minh họa đồ thị hàm số",
	},
	{
		pattern: /phương trình|nghiệm|bậc hai|đại số/i,
		src: "/lessons/illustrations/equation.svg",
		alt: "Hình minh họa phương trình",
	},
];

export function parseMarkdownImage(text: string): LessonIllustration | null {
	const match = text.match(MARKDOWN_IMAGE_PATTERN);
	if (!match) return null;

	const alt = match[1]?.trim() || "Ảnh minh họa bài học";
	const src = match[2]?.trim();
	if (!src) return null;

	return { src, alt };
}

export function stripMarkdownImage(text: string): string {
	return text.replace(MARKDOWN_IMAGE_PATTERN, "").trim();
}

export function resolveTopicIllustration(
	text: string,
	lessonTitle?: string | null,
): LessonIllustration | null {
	const haystack = `${lessonTitle ?? ""} ${text}`.trim();
	if (!haystack) return null;

	for (const rule of TOPIC_ILLUSTRATION_RULES) {
		if (rule.pattern.test(haystack)) {
			return { src: rule.src, alt: rule.alt };
		}
	}

	return null;
}

export function resolveLessonIllustration(
	text: string,
	options: {
		lessonTitle?: string | null;
		allowTopicFallback?: boolean;
		itemNumber?: number;
	} = {},
): LessonIllustration | null {
	const fromMarkdown = parseMarkdownImage(text);
	if (fromMarkdown) return fromMarkdown;

	if (options.allowTopicFallback === false) return null;

	const topicIllustration = resolveTopicIllustration(text, options.lessonTitle);
	if (topicIllustration) return topicIllustration;

	if (options.itemNumber === 1) {
		const fromTitle = resolveTopicIllustration("", options.lessonTitle);
		if (fromTitle) return fromTitle;

		return {
			src: "/lessons/illustrations/default-math.svg",
			alt: "Ảnh minh họa toán học",
		};
	}

	return null;
}

function resolveSectionPreview(
	text: string,
	options: { lessonTitle?: string | null; itemNumber?: number } = {},
): { displayText: string; illustration: LessonIllustration | null } {
	const strippedImage = stripMarkdownImage(text);
	let displayText = stripMarkdownForDisplay(strippedImage || text);
	const illustration = resolveLessonIllustration(text, {
		lessonTitle: options.lessonTitle,
		itemNumber: options.itemNumber,
	});

	if (!displayText && illustration) {
		displayText = illustration.alt;
	}

	return { displayText, illustration };
}

function normalizeTextAnswer(answer: string): string {
	return answer.trim().toLocaleLowerCase("vi-VN").replace(/\s+/g, " ");
}

/**
 * Bỏ các ký hiệu bao LaTeX quanh đáp án ($...$, \(...\)) và chuyển
 * \frac{a}{b} về dạng (a)/(b) để so sánh được với đáp án gõ tay.
 */
function normalizeMathAnswerText(answer: string): string {
	return answer
		.trim()
		.replace(/^\\\(|\\\)$/g, "")
		.replace(/^\\\[|\\\]$/g, "")
		.replace(/\$/g, "")
		.replace(/\\d?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)")
		.replace(/\\left|\\right/g, "")
		.trim();
}

function parseNumericAnswer(answer: string): number | null {
	let normalized = normalizeMathAnswerText(answer);

	// Quy ước Việt Nam: dấu chấm tách hàng nghìn ("1.000" = một nghìn),
	// dấu phẩy là phần thập phân ("2,5").
	if (/^[+-]?[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/.test(normalized)) {
		normalized = normalized.replace(/\./g, "").replace(",", ".");
	} else {
		normalized = normalized.replace(/,/g, ".");
	}

	if (/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) {
		const parsed = Number(normalized);
		return Number.isFinite(parsed) ? parsed : null;
	}

	// Phân số a/b (gồm cả \frac{a}{b} đã chuyển về (a)/(b))
	const fraction = normalized
		.replace(/[()\s]/g, "")
		.match(/^([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)$/);
	if (fraction) {
		const denominator = Number(fraction[2]);
		if (denominator === 0) return null;
		const value = Number(fraction[1]) / denominator;
		return Number.isFinite(value) ? value : null;
	}

	return null;
}

function normalizeTrueFalseAnswer(answer: string): boolean | null {
	const normalized = normalizeTextAnswer(answer)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/đ/g, "d");

	const stripped = normalized.replace(/[.!?:;,]+$/g, "").trim();

	if (["dung", "d", "true", "t", "yes", "y", "1"].includes(stripped)) {
		return true;
	}
	if (["sai", "s", "false", "f", "no", "n", "0"].includes(stripped)) {
		return false;
	}
	// Đáp án dạng câu: "Đúng vì ...", "Sai, do ..."
	if (/^dung[\s,.]/.test(stripped)) return true;
	if (/^sai[\s,.]/.test(stripped)) return false;
	return null;
}

/**
 * Đáp án trắc nghiệm lưu dạng chữ cái ("B", "Đáp án C", "b)") được
 * quy về phương án tương ứng trong danh sách choices.
 */
function resolveChoiceAnswer(
	correctAnswer: string,
	choices?: string[] | null,
): string | null {
	if (!Array.isArray(choices) || choices.length === 0) return null;
	const trimmed = correctAnswer.trim().replace(/^(?:đáp án|dap an)\s*/i, "");
	const letterMatch = trimmed.match(/^([A-Da-d])\s*[.)]?$/);
	if (!letterMatch) return null;
	const index = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
	return index < choices.length ? choices[index] : null;
}

export function getLessonExerciseSignature(
	exercise: LessonExerciseSignatureInput,
): string {
	return JSON.stringify({
		orderIndex: exercise.order_index,
		topic: exercise.topic ?? null,
		difficultyLevel: exercise.difficulty_level ?? null,
		questionText: exercise.question_text,
		answerType: exercise.answer_type,
		choices: exercise.choices ?? null,
		correctAnswer: exercise.correct_answer,
		solutionSteps: exercise.solution_steps ?? null,
		explanation: exercise.explanation ?? null,
	});
}

export function shouldResetExerciseAnswerState(
	previousSignature: string | undefined,
	exercise: LessonExerciseSignatureInput,
): boolean {
	return previousSignature !== getLessonExerciseSignature(exercise);
}

function normalizeSolutionSteps(steps?: string[] | string | null): string[] {
	if (!steps) return [];
	if (Array.isArray(steps)) {
		return steps.map((step) => step.trim()).filter(Boolean);
	}
	return steps
		.split(/\r?\n/)
		.map((step) => step.replace(LIST_MARKER_PATTERN, "").trim())
		.filter(Boolean);
}

export function buildLessonExerciseSolutionFeedback(
	exercise: LessonExerciseSignatureInput,
): LessonExerciseSolutionFeedback {
	const detailSteps = normalizeSolutionSteps(exercise.solution_steps);
	const explanation = exercise.explanation?.trim() || null;
	return {
		guidance:
			detailSteps[0] ??
			explanation ??
			"Đối chiếu đáp án đúng rồi kiểm tra lại từng bước làm của em.",
		correctAnswer: exercise.correct_answer,
		detailSteps,
		explanation,
	};
}

export function getLessonExerciseAnswerMode(
	answerType: string,
	choices?: string[] | null,
): LessonExerciseAnswerMode {
	if (answerType === "essay") {
		return {
			renderMode: "open_ended",
			isAutoCheckable: false,
			usesDecimalHint: false,
		};
	}

	if (
		answerType === "multiple_choice" ||
		answerType === "true_false" ||
		(Array.isArray(choices) && choices.length > 0)
	) {
		return {
			renderMode: "choice",
			isAutoCheckable: true,
			usesDecimalHint: false,
		};
	}

	return {
		renderMode: "numeric_text",
		isAutoCheckable: true,
		usesDecimalHint: true,
	};
}

export function checkLessonExerciseAnswer({
	answerType,
	learnerAnswer,
	correctAnswer,
	choices,
}: CheckLessonExerciseAnswerInput): boolean {
	if (!getLessonExerciseAnswerMode(answerType, choices).isAutoCheckable) {
		return false;
	}

	const learner = learnerAnswer.trim();
	const correct = correctAnswer.trim();
	if (!learner || !correct) return false;

	if (answerType === "true_false") {
		const learnerBoolean = normalizeTrueFalseAnswer(learner);
		const correctBoolean = normalizeTrueFalseAnswer(correct);
		return learnerBoolean !== null && learnerBoolean === correctBoolean;
	}

	// Đáp án trắc nghiệm lưu dạng chữ cái ("B") được quy về phương án đầy đủ
	const resolvedCorrect = resolveChoiceAnswer(correct, choices) ?? correct;

	const learnerNumber = parseNumericAnswer(learner);
	const correctNumber = parseNumericAnswer(resolvedCorrect);
	if (learnerNumber !== null && correctNumber !== null) {
		return Math.abs(learnerNumber - correctNumber) < 0.0000001;
	}

	const learnerText = normalizeTextAnswer(normalizeMathAnswerText(learner));
	const correctText = normalizeTextAnswer(
		normalizeMathAnswerText(resolvedCorrect),
	);
	if (learnerText === correctText) return true;

	// "x>2" và "x > 2" là cùng một đáp án — so sánh lần cuối bỏ mọi khoảng trắng
	return (
		learnerText.replace(/\s+/g, "") === correctText.replace(/\s+/g, "")
	);
}

export function splitTheoryContent(content?: string | null): string[] {
	if (!content?.trim()) return [THEORY_CONTENT_FALLBACK];
	const lines = content
		.split(/\r?\n/)
		.map((line) => line.replace(LIST_MARKER_PATTERN, "").trim())
		.filter(Boolean);
	return lines.length > 0 ? lines : [content];
}

export function getActualTheoryContentItems(content?: string | null): string[] {
	if (!content?.trim()) return [];
	const lines = content
		.split(/\r?\n/)
		.map((line) => line.replace(LIST_MARKER_PATTERN, "").trim())
		.filter(Boolean);
	return lines;
}

export function buildLessonOverviewContent(
	content: string | null | undefined,
	exerciseCount = 0,
): LessonOverviewContent {
	const contentItems = getActualTheoryContentItems(content);
	return {
		contentItems,
		emptyContentMessage:
			contentItems.length === 0 ? THEORY_CONTENT_FALLBACK : null,
		showFinalCheck: contentItems.length > 0 || exerciseCount > 0,
	};
}

function getOverviewTimelinePhase(
	title: string,
	index: number,
	totalItems: number,
): string {
	const normalizedTitle = title.toLocaleLowerCase("vi-VN");

	if (
		normalizedTitle.includes("ứng dụng") ||
		normalizedTitle.includes("application")
	) {
		return "Ứng dụng";
	}
	if (normalizedTitle.includes("lưu ý") || normalizedTitle.includes("note")) {
		return "Lưu ý";
	}
	if (
		normalizedTitle.includes("ví dụ") ||
		normalizedTitle.includes("example")
	) {
		return "Ví dụ mẫu";
	}
	if (
		normalizedTitle.includes("trường hợp") ||
		normalizedTitle.includes("case")
	) {
		return "Trường hợp";
	}

	if (index === 0) return "Nền tảng";
	if (index === 1) return "Nhận diện";
	if (index === totalItems - 1) return "Ứng dụng";
	if (index === totalItems - 2) return "Lưu ý";
	if (index === totalItems - 3) return "Ví dụ mẫu";
	return "Trường hợp";
}

export function buildLessonOverviewTimelineItems(
	lessonId: string | number,
	content: string | null | undefined,
	exerciseCount = 0,
): LessonOverviewTimelineItem[] {
	const overview = buildLessonOverviewContent(content, exerciseCount);
	const timelineItems: LessonOverviewTimelineItem[] = overview.contentItems.map(
		(title, index) => {
			const itemNumber = index + 1;
			return {
				title: stripMarkdownForDisplay(title),
				href: getLessonContentItemHref(lessonId, itemNumber),
				phase: getOverviewTimelinePhase(
					title,
					index,
					overview.contentItems.length,
				),
				itemNumber,
				markerLabel: String(itemNumber),
				ctaLabel: "Xem chi tiết",
				isFinalCheck: false,
			};
		},
	);

	if (overview.showFinalCheck) {
		timelineItems.push({
			title: "Bài tập / Kiểm tra cuối bài",
			href: getLessonContentCheckHref(lessonId),
			phase: "Thực hành",
			markerLabel: FINAL_CHECK_MARKER_LABEL,
			ctaLabel: "Bắt đầu",
			isFinalCheck: true,
		});
	}

	return timelineItems;
}

export function getLessonContentItemHref(
	lessonId: string | number,
	itemNumber: number,
): string {
	return `/dashboard/lessons/${encodeURIComponent(String(lessonId))}/content/${itemNumber}`;
}

export function getLessonContentCheckHref(lessonId: string | number): string {
	return `/dashboard/lessons/${encodeURIComponent(String(lessonId))}/content/check`;
}

export function buildLessonTimelineItems(
	lessonId: string | number,
	content: string | null | undefined,
	current: LessonTimelineCurrent,
	options: { exerciseCount?: number; includeFinalCheck?: boolean } = {},
): LessonTimelineItem[] {
	const sectionItems = getActualTheoryContentItems(content).map(
		(title, index) => {
			const itemNumber = index + 1;
			return {
				kind: "section" as const,
				href: getLessonContentItemHref(lessonId, itemNumber),
				label: `Mục ${itemNumber}`,
				title: stripMarkdownForDisplay(title),
				itemNumber,
				isCurrent:
					current.kind === "section" && current.itemNumber === itemNumber,
			};
		},
	);

	const includeFinalCheck =
		options.includeFinalCheck ??
		(sectionItems.length > 0 || (options.exerciseCount ?? 0) > 0);

	return [
		...sectionItems,
		...(includeFinalCheck
			? [
					{
						kind: "check" as const,
						href: getLessonContentCheckHref(lessonId),
						label: "Kiểm tra",
						title: "Bài tập / Kiểm tra cuối bài",
						isCurrent: current.kind === "check",
					},
				]
			: []),
	];
}

export function buildLessonCheckPrompts(
	lessonTitle: string,
	content: string | null | undefined,
): string[] {
	const sections = getActualTheoryContentItems(content).slice(0, 3);
	if (sections.length === 0) return [];

	const prompts = sections.map(
		(section, index) =>
			`${index + 1}. Trong bài "${lessonTitle}", hãy giải thích ngắn gọn ý chính của phần "${section}" và nêu một ví dụ áp dụng.`,
	);

	prompts.push(
		`Hãy tự tạo một bài tập nhỏ liên quan đến "${lessonTitle}", giải từng bước và kiểm tra lại kết quả cuối cùng.`,
	);

	while (prompts.length < 3) {
		prompts.push(
			`Viết một câu hỏi ôn tập khác về "${lessonTitle}" và trả lời bằng lời của em.`,
		);
	}

	return prompts;
}

export function resolveTheoryContentItem(
	content: string | null | undefined,
	itemParam: string | number,
	options: { lessonTitle?: string | null } = {},
): ResolvedTheoryContentItem | null {
	const itemNumber = Number(itemParam);
	if (!Number.isInteger(itemNumber) || itemNumber < 1) return null;

	const items = getActualTheoryContentItems(content);
	const current = items[itemNumber - 1];
	if (!current) return null;

	const previousText = items[itemNumber - 2] ?? null;
	const nextText = items[itemNumber] ?? null;
	const currentSection = resolveSectionPreview(current, {
		lessonTitle: options.lessonTitle,
		itemNumber,
	});

	return {
		itemNumber,
		current,
		displayText: currentSection.displayText,
		illustration: currentSection.illustration,
		previous: previousText
			? {
					itemNumber: itemNumber - 1,
					text: resolveSectionPreview(previousText, {
						lessonTitle: options.lessonTitle,
						itemNumber: itemNumber - 1,
					}).displayText,
				}
			: null,
		next: nextText
			? {
					itemNumber: itemNumber + 1,
					text: resolveSectionPreview(nextText, {
						lessonTitle: options.lessonTitle,
						itemNumber: itemNumber + 1,
					}).displayText,
				}
			: null,
		totalItems: items.length,
	};
}
