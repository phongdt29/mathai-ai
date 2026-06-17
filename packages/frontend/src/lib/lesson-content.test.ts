import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	buildLessonCheckPrompts,
	buildLessonExerciseSolutionFeedback,
	buildLessonOverviewContent,
	buildLessonOverviewTimelineItems,
	buildLessonTimelineItems,
	checkLessonExerciseAnswer,
	getActualTheoryContentItems,
	getLessonContentCheckHref,
	getLessonContentItemHref,
	getLessonExerciseAnswerMode,
	getLessonExerciseSignature,
	parseMarkdownImage,
	resolveLessonIllustration,
	resolveTheoryContentItem,
	shouldResetExerciseAnswerState,
	splitTheoryContent,
	stripMarkdownForDisplay,
	stripMarkdownImage,
} from "./lesson-content";

const fallbackTheoryMessage =
	"N\u1ed9i dung l\u00fd thuy\u1ebft \u0111ang \u0111\u01b0\u1ee3c c\u1eadp nh\u1eadt.";
const timelineSectionLabel = "M\u1ee5c";
const timelineCheckLabel = "Ki\u1ec3m tra";
const timelineCheckTitle =
	"B\u00e0i t\u1eadp / Ki\u1ec3m tra cu\u1ed1i b\u00e0i";

describe("lesson content", () => {
	test("stripMarkdownForDisplay removes inline markdown markers for plain labels", () => {
		assert.equal(
			stripMarkdownForDisplay(
				"# Bài 1: Ôn lại khái niệm cốt lõi - Hình học - chu vi hình chữ nhật",
			),
			"Bài 1: Ôn lại khái niệm cốt lõi - Hình học - chu vi hình chữ nhật",
		);
		assert.equal(
			stripMarkdownForDisplay("**Loại bài học:** Lý thuyết"),
			"Loại bài học: Lý thuyết",
		);
		assert.equal(
			stripMarkdownForDisplay(
				"![Hình minh họa](/lessons/illustrations/algebra-fraction.svg)",
			),
			"",
		);
	});

	test("stripMarkdownForDisplay preserves LaTeX inside math delimiters", () => {
		assert.equal(
			stripMarkdownForDisplay("Định lý Vi-ét: $x_1 + x_2 = -b/a$"),
			"Định lý Vi-ét: $x_1 + x_2 = -b/a$",
		);
		assert.equal(stripMarkdownForDisplay("$a*b*c$"), "$a*b*c$");
		assert.equal(
			stripMarkdownForDisplay("**Công thức:** \\(x_1 x_2 = c/a\\)"),
			"Công thức: \\(x_1 x_2 = c/a\\)",
		);
	});

	test("parses markdown images and resolves topic-based illustrations", () => {
		assert.deepEqual(
			parseMarkdownImage(
				"![Hình minh họa phân thức](/lessons/illustrations/algebra-fraction.svg)",
			),
			{
				src: "/lessons/illustrations/algebra-fraction.svg",
				alt: "Hình minh họa phân thức",
			},
		);
		assert.equal(
			stripMarkdownImage(
				"![Hình minh họa phân thức](/lessons/illustrations/algebra-fraction.svg)",
			),
			"",
		);
		assert.deepEqual(
			resolveLessonIllustration("Chu vi hình chữ nhật", {
				lessonTitle: "Hình học lớp 6",
			}),
			{
				src: "/lessons/illustrations/geometry-rectangle.svg",
				alt: "Hình minh họa chu vi hình chữ nhật",
			},
		);
		assert.deepEqual(
			resolveLessonIllustration("Giới thiệu bài học", {
				lessonTitle: "Phân thức đại số",
				itemNumber: 1,
			}),
			{
				src: "/lessons/illustrations/algebra-fraction.svg",
				alt: "Hình minh họa phân thức đại số",
			},
		);
	});

	test("strips only actual bullet and numbered list markers", () => {
		const content = [
			"- Linear equation definition",
			"* Transposition rule",
			"\u2022 Worked example",
			"1. First solving step",
			"2) Next solving step",
			"2x + 1 = 5",
			"3.14 is pi",
		].join("\n");

		assert.deepEqual(splitTheoryContent(content), [
			"Linear equation definition",
			"Transposition rule",
			"Worked example",
			"First solving step",
			"Next solving step",
			"2x + 1 = 5",
			"3.14 is pi",
		]);
	});

	test("returns no actual theory content items for missing, blank, or marker-only content", () => {
		assert.deepEqual(getActualTheoryContentItems(), []);
		assert.deepEqual(getActualTheoryContentItems(null), []);
		assert.deepEqual(getActualTheoryContentItems(""), []);
		assert.deepEqual(getActualTheoryContentItems("   \n\t  "), []);
		assert.deepEqual(getActualTheoryContentItems("-\n1.\n*\n2)\n•"), []);
	});

	test("keeps display fallback for missing, blank, or marker-only theory content", () => {
		assert.deepEqual(splitTheoryContent(), [fallbackTheoryMessage]);
		assert.deepEqual(splitTheoryContent("   \n\t  "), [fallbackTheoryMessage]);
		assert.deepEqual(splitTheoryContent("-\n1.\n*\n2)\n•"), [
			"-\n1.\n*\n2)\n•",
		]);
	});

	test("does not create timeline sections, final check, or resolved items from unavailable theory content", () => {
		const items = buildLessonTimelineItems("backend-1", null, {
			kind: "check",
		});

		assert.deepEqual(items, []);
		assert.equal(resolveTheoryContentItem(null, "1"), null);
		assert.equal(resolveTheoryContentItem("   \n\t  ", "1"), null);
		assert.equal(resolveTheoryContentItem("-\n1.\n*\n2)", "1"), null);
	});

	test("includes timeline final check for exercise-only lessons", () => {
		const items = buildLessonTimelineItems(
			"backend-1",
			null,
			{ kind: "check" },
			{ exerciseCount: 2 },
		);

		assert.deepEqual(
			items.map(({ kind, href, label, title, itemNumber }) => ({
				kind,
				href,
				label,
				title,
				itemNumber,
			})),
			[
				{
					kind: "check",
					href: "/dashboard/lessons/backend-1/content/check",
					label: timelineCheckLabel,
					title: timelineCheckTitle,
					itemNumber: undefined,
				},
			],
		);
	});

	test("builds overview content without fake links for missing theory content", () => {
		const overview = buildLessonOverviewContent(null, 0);

		assert.deepEqual(overview.contentItems, []);
		assert.equal(overview.emptyContentMessage, fallbackTheoryMessage);
		assert.equal(overview.showFinalCheck, false);
	});

	test("keeps final check visible without theory content when exercises exist", () => {
		const overview = buildLessonOverviewContent("   \n\t  ", 2);

		assert.deepEqual(overview.contentItems, []);
		assert.equal(overview.emptyContentMessage, fallbackTheoryMessage);
		assert.equal(overview.showFinalCheck, true);
	});

	test("builds overview content from actual theory content unchanged", () => {
		const overview = buildLessonOverviewContent("Intro\nExpansion", 0);

		assert.deepEqual(overview.contentItems, ["Intro", "Expansion"]);
		assert.equal(overview.emptyContentMessage, null);
		assert.equal(overview.showFinalCheck, true);
	});

	test("builds visual overview timeline items with phase labels and final practice", () => {
		const timeline = buildLessonOverviewTimelineItems(
			"demo-2",
			"Definition\nSetup\nAA case\nSSS case\nSAS case\nWorked ratio\nConsistency note\nReal application",
			0,
		);

		assert.deepEqual(
			timeline.map(({ href, phase, itemNumber, isFinalCheck }) => ({
				href,
				phase,
				itemNumber,
				isFinalCheck,
			})),
			[
				{
					href: "/dashboard/lessons/demo-2/content/1",
					phase: "Nền tảng",
					itemNumber: 1,
					isFinalCheck: false,
				},
				{
					href: "/dashboard/lessons/demo-2/content/2",
					phase: "Nhận diện",
					itemNumber: 2,
					isFinalCheck: false,
				},
				{
					href: "/dashboard/lessons/demo-2/content/3",
					phase: "Trường hợp",
					itemNumber: 3,
					isFinalCheck: false,
				},
				{
					href: "/dashboard/lessons/demo-2/content/4",
					phase: "Trường hợp",
					itemNumber: 4,
					isFinalCheck: false,
				},
				{
					href: "/dashboard/lessons/demo-2/content/5",
					phase: "Trường hợp",
					itemNumber: 5,
					isFinalCheck: false,
				},
				{
					href: "/dashboard/lessons/demo-2/content/6",
					phase: "Ví dụ mẫu",
					itemNumber: 6,
					isFinalCheck: false,
				},
				{
					href: "/dashboard/lessons/demo-2/content/7",
					phase: "Lưu ý",
					itemNumber: 7,
					isFinalCheck: false,
				},
				{
					href: "/dashboard/lessons/demo-2/content/8",
					phase: "Ứng dụng",
					itemNumber: 8,
					isFinalCheck: false,
				},
				{
					href: "/dashboard/lessons/demo-2/content/check",
					phase: "Thực hành",
					itemNumber: undefined,
					isFinalCheck: true,
				},
			],
		);
	});

	test("builds lesson content item hrefs with encoded lesson ids", () => {
		assert.equal(
			getLessonContentItemHref("demo-1", 1),
			"/dashboard/lessons/demo-1/content/1",
		);
		assert.equal(
			getLessonContentItemHref("lesson with spaces", 2),
			"/dashboard/lessons/lesson%20with%20spaces/content/2",
		);
	});

	test("builds lesson content check hrefs with encoded lesson ids", () => {
		assert.equal(
			getLessonContentCheckHref("demo-1"),
			"/dashboard/lessons/demo-1/content/check",
		);
		assert.equal(
			getLessonContentCheckHref("lesson with spaces/and slash"),
			"/dashboard/lessons/lesson%20with%20spaces%2Fand%20slash/content/check",
		);
	});

	test("builds timeline section items in 1-based order with final check last", () => {
		const items = buildLessonTimelineItems("demo-1", "Intro\nExpansion", {
			kind: "section",
			itemNumber: 1,
		});

		assert.deepEqual(
			items.map(({ kind, href, label, title, itemNumber }) => ({
				kind,
				href,
				label,
				title,
				itemNumber,
			})),
			[
				{
					kind: "section",
					href: "/dashboard/lessons/demo-1/content/1",
					label: `${timelineSectionLabel} 1`,
					title: "Intro",
					itemNumber: 1,
				},
				{
					kind: "section",
					href: "/dashboard/lessons/demo-1/content/2",
					label: `${timelineSectionLabel} 2`,
					title: "Expansion",
					itemNumber: 2,
				},
				{
					kind: "check",
					href: "/dashboard/lessons/demo-1/content/check",
					label: timelineCheckLabel,
					title: timelineCheckTitle,
					itemNumber: undefined,
				},
			],
		);
	});

	test("marks only the current timeline section or final check active", () => {
		const sectionItems = buildLessonTimelineItems(
			"demo-1",
			"Intro\nExpansion",
			{
				kind: "section",
				itemNumber: 2,
			},
		);
		assert.deepEqual(
			sectionItems.map((item) => item.isCurrent),
			[false, true, false],
		);

		const checkItems = buildLessonTimelineItems("demo-1", "Intro\nExpansion", {
			kind: "check",
		});
		assert.deepEqual(
			checkItems.map((item) => item.isCurrent),
			[false, false, true],
		);
	});

	test("builds at least three meaningful final check prompts from lesson content", () => {
		const prompts = buildLessonCheckPrompts(
			"Linear equations",
			"Equation concept\nTransposition rule\nSolution check",
		);

		assert.ok(prompts.length >= 3);
		assert.ok(prompts.some((prompt) => prompt.includes("Linear equations")));
		assert.ok(prompts.some((prompt) => prompt.includes("Transposition rule")));
	});

	test("returns no generic final check prompts for missing theory content", () => {
		assert.deepEqual(buildLessonCheckPrompts("Empty lesson", null), []);
		assert.deepEqual(buildLessonCheckPrompts("Empty lesson", "   \n\t  "), []);
	});

	describe("lesson exercise answer state signatures", () => {
		const baseExercise = {
			order_index: 1,
			topic: "Arithmetic",
			difficulty_level: "easy",
			question_text: "What is 2 + 2?",
			answer_type: "short_answer",
			choices: null,
			correct_answer: "4",
			solution_steps: ["Add 2 and 2", "The sum is 4"],
			explanation: "Two pairs make four.",
		};

		test("keeps answer state for an unchanged exercise payload", () => {
			const signature = getLessonExerciseSignature(baseExercise);

			assert.equal(
				shouldResetExerciseAnswerState(signature, baseExercise),
				false,
			);
		});

		test("resets answer state when the keyed exercise payload changes", () => {
			const signature = getLessonExerciseSignature(baseExercise);

			for (const changedExercise of [
				{ ...baseExercise, order_index: 2 },
				{ ...baseExercise, topic: "Number sense" },
				{ ...baseExercise, difficulty_level: "medium" },
				{ ...baseExercise, question_text: "What is 3 + 3?" },
				{ ...baseExercise, answer_type: "multiple_choice" },
				{ ...baseExercise, choices: ["3", "4"] },
				{ ...baseExercise, correct_answer: "5" },
				{ ...baseExercise, solution_steps: ["Use doubles", "2 + 2 = 4"] },
				{ ...baseExercise, explanation: "Updated feedback explanation." },
			]) {
				assert.equal(
					shouldResetExerciseAnswerState(signature, changedExercise),
					true,
				);
			}
		});
	});

	describe("checkLessonExerciseAnswer", () => {
		test("classifies answer render and grading modes by exercise answer type", () => {
			assert.deepEqual(getLessonExerciseAnswerMode("multiple_choice", ["A"]), {
				renderMode: "choice",
				isAutoCheckable: true,
				usesDecimalHint: false,
			});
			assert.deepEqual(getLessonExerciseAnswerMode("true_false"), {
				renderMode: "choice",
				isAutoCheckable: true,
				usesDecimalHint: false,
			});
			assert.deepEqual(getLessonExerciseAnswerMode("short_answer"), {
				renderMode: "numeric_text",
				isAutoCheckable: true,
				usesDecimalHint: true,
			});
			assert.deepEqual(getLessonExerciseAnswerMode("essay"), {
				renderMode: "open_ended",
				isAutoCheckable: false,
				usesDecimalHint: false,
			});
		});

		test("does not auto-grade essay answers by exact text match", () => {
			assert.equal(
				checkLessonExerciseAnswer({
					answerType: "essay",
					learnerAnswer: "Students may explain this in their own words.",
					correctAnswer: "Students may explain this in their own words.",
				}),
				false,
			);
		});

		test("accepts a selected multiple-choice option matching the correct answer", () => {
			assert.equal(
				checkLessonExerciseAnswer({
					answerType: "multiple_choice",
					learnerAnswer: "x = 2 hoặc x = 3",
					correctAnswer: "x = 2 hoặc x = 3",
					choices: ["x = -2 hoặc x = -3", "x = 2 hoặc x = 3"],
				}),
				true,
			);
		});

		test("maps letter-style correct answers (B, Đáp án C) to the matching choice", () => {
			assert.equal(
				checkLessonExerciseAnswer({
					answerType: "multiple_choice",
					learnerAnswer: "x = 2 hoặc x = 3",
					correctAnswer: "B",
					choices: ["x = -2 hoặc x = -3", "x = 2 hoặc x = 3"],
				}),
				true,
			);
			assert.equal(
				checkLessonExerciseAnswer({
					answerType: "multiple_choice",
					learnerAnswer: "x = -2 hoặc x = -3",
					correctAnswer: "Đáp án A",
					choices: ["x = -2 hoặc x = -3", "x = 2 hoặc x = 3"],
				}),
				true,
			);
		});

		test("accepts mathematically equivalent fractions and LaTeX-wrapped answers", () => {
			assert.equal(
				checkLessonExerciseAnswer({
					answerType: "short_answer",
					learnerAnswer: "0.5",
					correctAnswer: "1/2",
				}),
				true,
			);
			assert.equal(
				checkLessonExerciseAnswer({
					answerType: "short_answer",
					learnerAnswer: "0,5",
					correctAnswer: "\\frac{1}{2}",
				}),
				true,
			);
			assert.equal(
				checkLessonExerciseAnswer({
					answerType: "short_answer",
					learnerAnswer: "1/3",
					correctAnswer: "$\\dfrac{1}{3}$",
				}),
				true,
			);
		});

		test("treats Vietnamese thousands separators correctly", () => {
			assert.equal(
				checkLessonExerciseAnswer({
					answerType: "short_answer",
					learnerAnswer: "1.000",
					correctAnswer: "1000",
				}),
				true,
			);
			assert.equal(
				checkLessonExerciseAnswer({
					answerType: "short_answer",
					learnerAnswer: "1.234,5",
					correctAnswer: "1234.5",
				}),
				true,
			);
		});

		test("accepts algebraic short answers regardless of spacing", () => {
			assert.equal(
				checkLessonExerciseAnswer({
					answerType: "short_answer",
					learnerAnswer: "x>2",
					correctAnswer: "x > 2",
				}),
				true,
			);
		});

		test("accepts true/false answers with trailing punctuation or sentences", () => {
			assert.equal(
				checkLessonExerciseAnswer({
					answerType: "true_false",
					learnerAnswer: "Đúng",
					correctAnswer: "Đúng.",
				}),
				true,
			);
			assert.equal(
				checkLessonExerciseAnswer({
					answerType: "true_false",
					learnerAnswer: "Sai",
					correctAnswer: "Sai, vì biệt thức âm.",
				}),
				true,
			);
		});

		test("accepts equivalent numeric fill-in answers including decimal comma", () => {
			assert.equal(
				checkLessonExerciseAnswer({
					answerType: "short_answer",
					learnerAnswer: "2,0",
					correctAnswer: "2",
				}),
				true,
			);
			assert.equal(
				checkLessonExerciseAnswer({
					answerType: "short_answer",
					learnerAnswer: "2.5",
					correctAnswer: "2,50",
				}),
				true,
			);
			assert.equal(
				checkLessonExerciseAnswer({
					answerType: "short_answer",
					learnerAnswer: "3",
					correctAnswer: "2",
				}),
				false,
			);
		});

		test("accepts Vietnamese and boolean true/false variants", () => {
			for (const learnerAnswer of ["\u0111\u00fang", "Dung", "true", "T"]) {
				assert.equal(
					checkLessonExerciseAnswer({
						answerType: "true_false",
						learnerAnswer,
						correctAnswer: "\u0110\u00fang",
					}),
					true,
				);
			}

			for (const learnerAnswer of ["sai", "false", "F"]) {
				assert.equal(
					checkLessonExerciseAnswer({
						answerType: "true_false",
						learnerAnswer,
						correctAnswer: "Sai",
					}),
					true,
				);
			}
		});
	});

	describe("buildLessonExerciseSolutionFeedback", () => {
		test("splits checked-answer feedback into guidance and detailed solution levels", () => {
			const feedback = buildLessonExerciseSolutionFeedback({
				order_index: 1,
				question_text: "Solve x^2 - 5x + 6 = 0",
				answer_type: "multiple_choice",
				choices: ["x = 1 or x = 6", "x = 2 or x = 3"],
				correct_answer: "x = 2 or x = 3",
				solution_steps: [
					"Find two numbers with product 6 and sum 5.",
					"Factor x^2 - 5x + 6 as (x - 2)(x - 3).",
					"Set each factor equal to 0.",
				],
				explanation: "Substitute both values back into the original equation.",
			});

			assert.deepEqual(feedback, {
				guidance: "Find two numbers with product 6 and sum 5.",
				correctAnswer: "x = 2 or x = 3",
				detailSteps: [
					"Find two numbers with product 6 and sum 5.",
					"Factor x^2 - 5x + 6 as (x - 2)(x - 3).",
					"Set each factor equal to 0.",
				],
				explanation: "Substitute both values back into the original equation.",
			});
		});
	});

	test("resolves content items using 1-based indexing and adjacent navigation", () => {
		const result = resolveTheoryContentItem(
			"Intro\nExpansion\nConclusion",
			"2",
		);

		assert.deepEqual(result, {
			itemNumber: 2,
			current: "Expansion",
			displayText: "Expansion",
			illustration: null,
			previous: { itemNumber: 1, text: "Intro" },
			next: { itemNumber: 3, text: "Conclusion" },
			totalItems: 3,
		});
	});

	test("resolves illustration metadata for markdown image sections", () => {
		const content = [
			"# Phân thức đại số",
			"![Hình minh họa phân thức](/lessons/illustrations/algebra-fraction.svg)",
			"Định nghĩa cơ bản",
		].join("\n");

		const result = resolveTheoryContentItem(content, "2", {
			lessonTitle: "Phân thức đại số",
		});

		assert.equal(result?.displayText, "Hình minh họa phân thức");
		assert.deepEqual(result?.illustration, {
			src: "/lessons/illustrations/algebra-fraction.svg",
			alt: "Hình minh họa phân thức",
		});
	});

	test("rejects invalid content item parameters", () => {
		const content = "Intro\nExpansion";

		assert.equal(resolveTheoryContentItem(content, "0"), null);
		assert.equal(resolveTheoryContentItem(content, "abc"), null);
		assert.equal(resolveTheoryContentItem(content, "3"), null);
		assert.equal(resolveTheoryContentItem(content, "1.5"), null);
	});
});
