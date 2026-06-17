"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { LessonTimelineNav } from "@/components/LessonTimelineNav";
import MathMarkdown from "@/components/MathMarkdown";
import { useAgeTheme } from "@/contexts/AgeThemeContext";
import {
	type AdaptiveRecommendation,
	apiClient,
	getTodayRecommendation,
	type LessonExerciseAttemptAnswerResult,
	type LessonExerciseAttemptResponse,
	submitLessonExerciseAttempt,
} from "@/lib/api";
import {
	buildLessonCheckPrompts,
	buildLessonExerciseSolutionFeedback,
	buildLessonTimelineItems,
	checkLessonExerciseAnswer,
	getLessonExerciseAnswerMode,
	getLessonExerciseSignature,
	shouldResetExerciseAnswerState,
} from "@/lib/lesson-content";
import { getLessonDetailEndpoint } from "@/lib/lesson-endpoints";
import { getFallbackLessonDetail } from "@/lib/lesson-fallbacks";

type LessonExercise = {
	_id?: string;
	order_index: number;
	topic?: string | null;
	difficulty_level?: string | null;
	answer_type: "multiple_choice" | "short_answer" | "essay" | string;
	question_text: string;
	choices?: string[] | null;
	correct_answer: string;
	solution_steps?: string[] | string | null;
	explanation?: string | null;
};

type LessonDetail = {
	_id: string;
	lesson_title: string;
	theory_content?: string | null;
	lesson_objective?: string | null;
	estimated_minutes?: number | null;
	status?: string;
	exercises?: LessonExercise[];
};

type ApiResponse<T> = {
	success: boolean;
	message?: string;
	data: T;
};

type CheckPageState = {
	lesson: LessonDetail;
};

const answerTypeLabel: Record<string, string> = {
	multiple_choice: "Trắc nghiệm",
	short_answer: "Điền số",
	true_false: "Đúng / Sai",
	essay: "Tự luận",
};

type ExerciseAnswerState = {
	value: string;
	checked: boolean;
	isCorrect: boolean;
	showDetailedSolution: boolean;
	exerciseSignature: string;
};

const QUIZ_DURATION_SECONDS = 15 * 60;

function formatTimer(seconds: number): string {
	const safeSeconds = Math.max(0, seconds);
	const minutes = Math.floor(safeSeconds / 60);
	const remainingSeconds = safeSeconds % 60;
	return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function getAttemptAnswerValue(
	answer?: LessonExerciseAttemptAnswerResult,
): string {
	return (
		answer?.selected_choice || answer?.student_answer || "Chưa có câu trả lời"
	);
}

function buildQuizIdempotencyKey(lessonId: string): string {
	const randomPart = Math.random().toString(36).slice(2, 10);
	return `lesson-check-${lessonId}-${Date.now()}-${randomPart}`;
}

export default function LessonContentCheckPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = React.use(params);
	const { theme, ageGroup } = useAgeTheme();
	const [state, setState] = useState<CheckPageState | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [answers, setAnswers] = useState<Record<string, ExerciseAnswerState>>(
		{},
	);
	const [attemptStartedAt, setAttemptStartedAt] = useState<string | null>(null);
	const [remainingSeconds, setRemainingSeconds] = useState(
		QUIZ_DURATION_SECONDS,
	);
	const [submitting, setSubmitting] = useState(false);
	const [latestAttempt, setLatestAttempt] =
		useState<LessonExerciseAttemptResponse | null>(null);
	const [recommendation, setRecommendation] =
		useState<AdaptiveRecommendation | null>(null);
	const [recommendationLoading, setRecommendationLoading] = useState(false);
	const autoSubmittedRef = React.useRef(false);

	const isElementary = ageGroup === "elementary";
	const isHigh = ageGroup === "high";
	const backToLessonHref = `/dashboard/lessons/${encodeURIComponent(id)}`;

	function getExerciseKey(exercise: LessonExercise, index: number): string {
		return exercise._id || `${exercise.order_index || index + 1}`;
	}

	useEffect(() => {
		let cancelled = false;
		queueMicrotask(() => {
			if (cancelled) return;
			setAnswers({});
			setLatestAttempt(null);
			setRecommendation(null);
			setSubmitError(null);
			setNotice(null);
			setAttemptStartedAt(new Date().toISOString());
			autoSubmittedRef.current = false;
			setRemainingSeconds(QUIZ_DURATION_SECONDS);
			setState(null);
		});

		async function fetchLesson() {
			setLoading(true);
			setError(null);
			try {
				const lessonEndpoint = getLessonDetailEndpoint(id);
				let lesson: LessonDetail | null = null;

				if (!lessonEndpoint) {
					lesson = getFallbackLessonDetail(id);
				} else {
					const res =
						await apiClient<ApiResponse<LessonDetail>>(lessonEndpoint);
					lesson = res.data;
				}

				if (!cancelled) {
					setState(lesson ? { lesson } : null);
				}
			} catch (err) {
				if (!cancelled) {
					setState(null);
					setError(
						err instanceof Error
							? err.message
							: "Không thể tải bài kiểm tra cuối bài.",
					);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		fetchLesson();
		return () => {
			cancelled = true;
		};
	}, [id]);

	useEffect(() => {
		if (!state) return;

		const currentExercisesByKey = new Map(
			(state.lesson.exercises ?? []).map((exercise, index) => [
				getExerciseKey(exercise, index),
				exercise,
			]),
		);
		queueMicrotask(() => {
			setAnswers((current) => {
				const next = Object.fromEntries(
					Object.entries(current).filter(([exerciseKey, answerState]) => {
						const exercise = currentExercisesByKey.get(exerciseKey);
						return (
							exercise !== undefined &&
							!shouldResetExerciseAnswerState(
								answerState.exerciseSignature,
								exercise,
							)
						);
					}),
				) as Record<string, ExerciseAnswerState>;
				return Object.keys(next).length === Object.keys(current).length
					? current
					: next;
			});
		});
	}, [state]);

	useEffect(() => {
		if (!state || latestAttempt || remainingSeconds <= 0) return;

		const timer = window.setInterval(() => {
			setRemainingSeconds((current) => Math.max(0, current - 1));
		}, 1000);

		return () => window.clearInterval(timer);
	}, [state, latestAttempt, remainingSeconds]);

	function setExerciseAnswer(
		exercise: LessonExercise,
		exerciseKey: string,
		value: string,
	) {
		if (latestAttempt) return;
		setSubmitError(null);
		setNotice(null);
		if (!attemptStartedAt) setAttemptStartedAt(new Date().toISOString());
		setAnswers((current) => ({
			...current,
			[exerciseKey]: {
				value,
				checked: false,
				isCorrect: false,
				showDetailedSolution: false,
				exerciseSignature: getLessonExerciseSignature(exercise),
			},
		}));
	}

	function checkExerciseAnswer(exercise: LessonExercise, exerciseKey: string) {
		const answerMode = getLessonExerciseAnswerMode(
			exercise.answer_type,
			exercise.choices,
		);
		const exerciseSignature = getLessonExerciseSignature(exercise);

		if (!answerMode.isAutoCheckable) {
			setAnswers((current) => ({
				...current,
				[exerciseKey]: {
					value: current[exerciseKey]?.value ?? "",
					checked: true,
					isCorrect: false,
					showDetailedSolution: false,
					exerciseSignature,
				},
			}));
			return;
		}

		setAnswers((current) => {
			const currentAnswer = current[exerciseKey]?.value ?? "";
			return {
				...current,
				[exerciseKey]: {
					value: currentAnswer,
					checked: true,
					showDetailedSolution: false,
					exerciseSignature,
					isCorrect: checkLessonExerciseAnswer({
						answerType: exercise.answer_type,
						learnerAnswer: currentAnswer,
						correctAnswer: exercise.correct_answer,
						choices: exercise.choices,
					}),
				},
			};
		});
	}

	function toggleDetailedSolution(
		exercise: LessonExercise,
		exerciseKey: string,
	) {
		const exerciseSignature = getLessonExerciseSignature(exercise);
		setAnswers((current) => {
			const currentAnswer = current[exerciseKey];
			if (!currentAnswer?.checked) return current;
			return {
				...current,
				[exerciseKey]: {
					...currentAnswer,
					showDetailedSolution: !currentAnswer.showDetailedSolution,
					exerciseSignature,
				},
			};
		});
	}

	const refreshRecommendation = React.useCallback(async () => {
		setRecommendationLoading(true);
		try {
			const nextRecommendation = await getTodayRecommendation();
			setRecommendation(nextRecommendation);
		} catch {
			setRecommendation(null);
		} finally {
			setRecommendationLoading(false);
		}
	}, []);

	const handleSubmitQuiz = React.useCallback(
		async (forceSubmit = false) => {
			if (!state) return;
			const lessonExercises = state.lesson.exercises ?? [];
			const payloadAnswers = lessonExercises
				.filter((exercise) => exercise._id)
				.map((exercise, index) => {
					const exerciseKey = getExerciseKey(exercise, index);
					const answerValue = (answers[exerciseKey]?.value ?? "").trim();
					return exercise.answer_type === "multiple_choice" ||
						exercise.answer_type === "true_false"
						? { exercise_id: exercise._id!, selected_choice: answerValue }
						: { exercise_id: exercise._id!, student_answer: answerValue };
				})
				.filter((answer) => {
					if (!forceSubmit) return true;
					return Boolean(
						(answer.student_answer ?? answer.selected_choice ?? "").trim(),
					);
				});

			if (payloadAnswers.length === 0) {
				setSubmitError("Chưa có câu hỏi hợp lệ từ API để nộp bài.");
				return;
			}

			const unansweredCount = payloadAnswers.filter(
				(answer) =>
					!(answer.student_answer ?? answer.selected_choice ?? "").trim(),
			).length;
			if (unansweredCount > 0 && !forceSubmit) {
				setSubmitError(
					"Vui lòng trả lời tất cả câu hỏi trước khi nộp bài, hoặc chờ hết 15 phút để hệ thống nộp các câu đã làm.",
				);
				return;
			}

			const submittedAt = new Date().toISOString();
			const startedAt = attemptStartedAt ?? submittedAt;
			const durationSeconds = Math.min(
				QUIZ_DURATION_SECONDS,
				Math.max(
					0,
					Math.round((Date.parse(submittedAt) - Date.parse(startedAt)) / 1000),
				),
			);

			setSubmitting(true);
			setSubmitError(null);
			setNotice(null);
			try {
				const attempt = await submitLessonExerciseAttempt(id, {
					answers: payloadAnswers,
					duration_seconds: durationSeconds,
					started_at: startedAt,
					submitted_at: submittedAt,
					idempotency_key: buildQuizIdempotencyKey(id),
				});
				setLatestAttempt(attempt);
				const updateMessages = [
					attempt.lesson_completed
						? "bài học đã được đánh dấu hoàn thành"
						: null,
					attempt.progress_updated ? "tiến độ học tập đã được cập nhật" : null,
					attempt.mastery_updated
						? "mastery theo chủ đề đã được ghi nhận"
						: null,
					attempt.recommendation_completed
						? "gợi ý liên quan đã được hoàn tất"
						: null,
				].filter(Boolean);
				setNotice(
					attempt.idempotent
						? updateMessages.length > 0
							? `Kết quả bài kiểm tra này đã được ghi nhận trước đó; ${updateMessages.join(", ")}.`
							: "Kết quả bài kiểm tra này đã được ghi nhận trước đó."
						: updateMessages.length > 0
							? `Đã nộp bài kiểm tra cuối buổi; ${updateMessages.join(", ")}.`
							: "Đã nộp bài kiểm tra cuối buổi và lưu kết quả vào tiến độ.",
				);
				await refreshRecommendation();
			} catch (err) {
				setSubmitError(
					err instanceof Error
						? err.message
						: "Không thể nộp bài kiểm tra lúc này.",
				);
			} finally {
				setSubmitting(false);
			}
		},
		[answers, attemptStartedAt, id, refreshRecommendation, state],
	);

	useEffect(() => {
		if (
			!state ||
			latestAttempt ||
			remainingSeconds !== 0 ||
			submitting ||
			autoSubmittedRef.current
		) {
			return;
		}
		autoSubmittedRef.current = true;
		void handleSubmitQuiz(true);
	}, [state, latestAttempt, remainingSeconds, submitting, handleSubmitQuiz]);

	if (loading) {
		return (
			<div className={`max-w-3xl flex flex-col ${theme.sectionGap}`}>
				<div
					className={`${theme.cardRadius} ${theme.cardBg} ${theme.cardPadding} ${theme.cardBorder} shadow-sm`}
				>
					<p className="text-lg text-gray-600">
						Đang tải bài kiểm tra cuối bài...
					</p>
				</div>
			</div>
		);
	}

	if (!state) {
		return (
			<div className={`max-w-3xl flex flex-col ${theme.sectionGap}`}>
				<div className="flex flex-wrap gap-3">
					<Link
						href={backToLessonHref}
						className="text-lg text-blue-600 hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
					>
						← Quay lại bài học
					</Link>
					<Link
						href="/dashboard/lessons"
						className="text-lg text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
					>
						Danh sách bài học
					</Link>
				</div>
				<div
					className={`${theme.cardRadius} ${theme.cardBg} ${theme.cardPadding} ${theme.cardBorder} shadow-sm`}
				>
					<h1 className={`mb-2 text-2xl text-gray-900 ${theme.fontWeight}`}>
						Không tìm thấy bài kiểm tra
					</h1>
					<p className="text-lg text-gray-600">
						{error ||
							"Bài học này không tồn tại hoặc chưa có nội dung để kiểm tra."}
					</p>
				</div>
			</div>
		);
	}

	const { lesson } = state;
	const exercises = lesson.exercises ?? [];
	const prompts = buildLessonCheckPrompts(
		lesson.lesson_title,
		lesson.theory_content,
	);
	const timelineItems = buildLessonTimelineItems(
		id,
		lesson.theory_content,
		{ kind: "check" },
		{ exerciseCount: exercises.length },
	);
	const hasAvailableCheck = exercises.length > 0 || prompts.length > 0;
	const latestResult = latestAttempt?.result;
	const latestAnswers = latestAttempt?.answers ?? [];
	const latestAnswersByExerciseId = new Map(
		latestAnswers
			.filter((answer) => answer.exercise_id)
			.map((answer) => [answer.exercise_id, answer]),
	);
	const answeredCount = exercises.filter((exercise, index) =>
		(answers[getExerciseKey(exercise, index)]?.value ?? "").trim(),
	).length;
	const nextRecommendationTarget =
		recommendation?.new_lesson ||
		recommendation?.reinforce_items?.[0] ||
		recommendation?.review_items?.[0] ||
		null;

	if (!hasAvailableCheck) {
		return (
			<div className={`max-w-3xl flex flex-col ${theme.sectionGap}`}>
				<div className="flex flex-wrap gap-3">
					<Link
						href={backToLessonHref}
						className={`text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${isHigh ? "text-gray-500 hover:text-gray-700" : "text-blue-600 hover:opacity-80"}`}
					>
						{isElementary ? "🐟 Quay lại bài học" : "← Quay lại bài học"}
					</Link>
					<Link
						href="/dashboard/lessons"
						className="text-lg text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
					>
						Danh sách bài học
					</Link>
				</div>
				<div
					className={`${theme.cardRadius} ${theme.cardBg} ${theme.cardPadding} ${theme.cardBorder} shadow-sm`}
				>
					<h1 className={`mb-2 text-2xl text-gray-900 ${theme.fontWeight}`}>
						Chưa có bài kiểm tra
					</h1>
					<p className="text-lg text-gray-600">
						Bài học này chưa có bài tập hoặc nội dung lý thuyết đủ để tạo câu
						hỏi ôn tập.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className={`max-w-6xl flex flex-col ${theme.sectionGap}`}>
			<div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
				<LessonTimelineNav
					items={timelineItems}
					className="lg:sticky lg:top-6"
				/>
				<div className={`min-w-0 flex flex-col ${theme.sectionGap}`}>
					<div>
						<div className="mb-3 flex flex-wrap gap-3">
							<Link
								href={backToLessonHref}
								className={`text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${isHigh ? "text-gray-500 hover:text-gray-700" : "text-blue-600 hover:opacity-80"}`}
							>
								{isElementary ? "👈 Quay lại bài học" : "← Quay lại bài học"}
							</Link>
							<Link
								href="/dashboard/lessons"
								className="text-lg text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
							>
								Danh sách bài học
							</Link>
						</div>
						<p className="mb-2 text-sm font-bold uppercase tracking-wide text-emerald-600">
							Bài tập / Kiểm tra cuối bài
						</p>
						<h1 className={`text-gray-900 text-2xl ${theme.fontWeight}`}>
							{lesson.lesson_title} - Kiểm tra cuối bài
						</h1>
					</div>

					<section
						className={`shadow-sm ${theme.cardRadius} ${theme.cardBg} ${theme.cardPadding} ${theme.cardBorder} flex flex-col gap-4`}
					>
						<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<div>
								<h2 className={`text-xl text-gray-900 ${theme.fontWeight}`}>
									{isElementary
										? "🧩 Kiểm tra cuối buổi 15 phút"
										: "Kiểm tra cuối buổi 15 phút"}
								</h2>
								<p className="mt-2 text-lg leading-8 text-gray-700">
									Hoàn thành các câu hỏi lấy từ bài tập thật của bài học. Kết
									quả sẽ được nộp qua API bài học để lưu điểm, phản hồi và cập
									nhật tín hiệu gợi ý học tiếp.
								</p>
							</div>
							<div
								className={`rounded-2xl px-4 py-3 text-center ring-1 ${remainingSeconds <= 60 && !latestAttempt ? "bg-rose-50 text-rose-700 ring-rose-100" : "bg-emerald-50 text-emerald-700 ring-emerald-100"}`}
							>
								<p className="text-sm font-bold uppercase tracking-wide">
									Thời gian còn lại
								</p>
								<p className="text-3xl font-black tabular-nums">
									{latestAttempt ? "Đã nộp" : formatTimer(remainingSeconds)}
								</p>
								<p className="text-sm">
									{answeredCount}/{exercises.length} câu đã trả lời
								</p>
							</div>
						</div>
						{notice ? (
							<div className="rounded-xl bg-emerald-50 p-3 text-emerald-700 ring-1 ring-emerald-100">
								{notice}
							</div>
						) : null}
						{submitError ? (
							<div className="rounded-xl bg-red-50 p-3 text-red-700 ring-1 ring-red-100">
								{submitError}
							</div>
						) : null}
						{latestResult ? (
							<div className="rounded-2xl bg-blue-50 p-4 text-blue-900 ring-1 ring-blue-100">
								<p className="text-lg font-black">
									Kết quả: {latestResult.score ?? 0}/
									{latestResult.max_score ??
										latestResult.total_questions ??
										exercises.length}{" "}
									điểm · {Math.round(Number(latestResult.percentage ?? 0))}%
								</p>
								<p className="mt-1">
									Đúng{" "}
									{latestResult.correct_answers ??
										latestAnswers.filter((answer) => answer.is_correct).length}
									/{latestResult.total_questions ?? latestAnswers.length} câu ·{" "}
									{latestResult.passed ? "Đạt" : "Cần ôn thêm"}
								</p>
								{latestResult.next_action ? (
									<div
										className={`mt-3 flex flex-wrap items-center gap-3 rounded-xl p-3 ring-1 ${
											latestResult.next_action.action === "advance"
												? "bg-emerald-50 text-emerald-800 ring-emerald-100"
												: "bg-amber-50 text-amber-800 ring-amber-100"
										}`}
									>
										<span className="text-sm font-medium">
											{latestResult.next_action.message}
										</span>
										<Link
											href={backToLessonHref}
											className={`${theme.buttonRadius} px-4 py-2 text-sm font-bold text-white ${
												latestResult.next_action.action === "advance"
													? "bg-emerald-600 hover:bg-emerald-700"
													: "bg-amber-600 hover:bg-amber-700"
											}`}
										>
											{latestResult.next_action.label}
										</Link>
									</div>
								) : null}
								{latestAttempt?.lesson_completed ||
								latestAttempt?.progress_updated ||
								latestAttempt?.mastery_updated ||
								latestAttempt?.recommendation_completed ? (
									<div className="mt-3 rounded-xl bg-white/70 p-3 text-sm text-blue-800 ring-1 ring-blue-100">
										<p className="font-bold">Cập nhật lộ trình sau quiz</p>
										<ul className="mt-1 list-disc space-y-1 pl-5">
											{latestAttempt.lesson_completed ? (
												<li>Bài học đã hoàn thành.</li>
											) : null}
											{latestAttempt.progress_updated ? (
												<li>Tiến độ tổng thể đã cập nhật.</li>
											) : null}
											{latestAttempt.mastery_updated ? (
												<li>Mastery theo topic đã ghi nhận từ từng câu hỏi.</li>
											) : null}
											{latestAttempt.recommendation_completed ? (
												<li>Gợi ý bài học hiện tại đã được mark hoàn tất.</li>
											) : null}
										</ul>
									</div>
								) : null}
								{latestResult.ai_feedback ? (
									<p className="mt-2 text-blue-800">
										{latestResult.ai_feedback}
									</p>
								) : null}
							</div>
						) : null}
					</section>

					{exercises.length > 0 ? (
						<>
							<section
								className="flex flex-col gap-4"
								aria-labelledby="lesson-exercises"
							>
								<h2 id="lesson-exercises" className="sr-only">
									Bài tập có sẵn của bài học
								</h2>
								{exercises.map((exercise, index) => {
									const exerciseKey = getExerciseKey(exercise, index);
									const answerMode = getLessonExerciseAnswerMode(
										exercise.answer_type,
										exercise.choices,
									);
									const answerState = answers[exerciseKey] ?? {
										value: "",
										checked: false,
										isCorrect: false,
										showDetailedSolution: false,
										exerciseSignature: getLessonExerciseSignature(exercise),
									};
									const solutionFeedback =
										buildLessonExerciseSolutionFeedback(exercise);
									const submittedAnswer = exercise._id
										? latestAnswersByExerciseId.get(exercise._id)
										: undefined;
									const isTrueFalse = exercise.answer_type === "true_false";
									const choiceOptions = isTrueFalse
										? ["Đúng", "Sai"]
										: (exercise.choices ?? []);

									return (
										<article
											key={exerciseKey}
											className={`${theme.cardRadius} bg-white p-5 shadow-sm ring-1 ring-gray-100`}
										>
											<div className="mb-3 flex flex-wrap items-center gap-2">
												<span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
													Câu {exercise.order_index || index + 1}
												</span>
												<span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600">
													{answerTypeLabel[exercise.answer_type] ||
														exercise.answer_type}
												</span>
												{submittedAnswer ? (
													<span
														className={`rounded-full px-3 py-1 text-sm font-bold ${submittedAnswer.is_correct ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
													>
														{submittedAnswer.is_correct
															? "Đúng"
															: submittedAnswer.is_correct === false
																? "Cần xem lại"
																: "Đã lưu"}
													</span>
												) : null}
											</div>
											{exercise.topic ? (
												<p className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
													{exercise.topic}
												</p>
											) : null}
											<MathMarkdown
												className="text-lg font-semibold text-gray-900"
												content={exercise.question_text}
											/>
											<div className="mt-4">
												{answerMode.renderMode === "choice" ? (
													<fieldset>
														<legend className="mb-2 font-semibold text-gray-800">
															Chọn câu trả lời
														</legend>
														<div className="grid gap-2 sm:grid-cols-2">
															{choiceOptions.map((choice, choiceIndex) => {
																const inputId = `${exerciseKey}-${choiceIndex}`;
																return (
																	<label
																		key={choice}
																		htmlFor={inputId}
																		className={`flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2 text-gray-700 ring-1 transition focus-within:ring-2 focus-within:ring-blue-500 ${answerState.value === choice ? "bg-blue-50 ring-blue-300" : "bg-gray-50 ring-gray-100 hover:bg-gray-100"}`}
																	>
																		<input
																			id={inputId}
																			type="radio"
																			name={`answer-${exerciseKey}`}
																			value={choice}
																			checked={answerState.value === choice}
																			onChange={() =>
																				setExerciseAnswer(
																					exercise,
																					exerciseKey,
																					choice,
																				)
																			}
																			disabled={Boolean(latestAttempt)}
																			className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
																		/>
																		<span className="flex flex-1 items-baseline gap-1.5">
																			{!isTrueFalse ? (
																				<span className="font-bold">
																					{String.fromCharCode(
																						65 + choiceIndex,
																					)}
																					.
																				</span>
																			) : null}
																			<MathMarkdown className="min-w-0 flex-1" content={choice} />
																		</span>
																	</label>
																);
															})}
														</div>
													</fieldset>
												) : answerMode.renderMode === "open_ended" ? (
													<label className="block font-semibold text-gray-800">
														Viết câu trả lời của em
														<textarea
															value={answerState.value}
															onChange={(event) =>
																setExerciseAnswer(
																	exercise,
																	exerciseKey,
																	event.target.value,
																)
															}
															disabled={Boolean(latestAttempt)}
															rows={5}
															className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
															aria-describedby={`${exerciseKey}-answer-hint`}
														/>
														<span
															id={`${exerciseKey}-answer-hint`}
															className="mt-1 block text-sm font-normal text-gray-500"
														>
															Câu tự luận không chấm đúng/sai tự động. Sau khi
															viết xong, bấm xem gợi ý để tự đối chiếu.
														</span>
													</label>
												) : (
													<label className="block font-semibold text-gray-800">
														Nhập đáp án của em
														<input
															type="text"
															inputMode="decimal"
															value={answerState.value}
															onChange={(event) =>
																setExerciseAnswer(
																	exercise,
																	exerciseKey,
																	event.target.value,
																)
															}
															disabled={Boolean(latestAttempt)}
															className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50"
															aria-describedby={`${exerciseKey}-answer-hint`}
														/>
														<span
															id={`${exerciseKey}-answer-hint`}
															className="mt-1 block text-sm font-normal text-gray-500"
														>
															Có thể nhập số như 2, 2.0 hoặc dùng dấu phẩy thập
															phân.
														</span>
													</label>
												)}
											</div>
											<button
												type="button"
												onClick={() =>
													checkExerciseAnswer(exercise, exerciseKey)
												}
												className="mt-4 rounded-xl bg-blue-600 px-4 py-2 font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
												disabled={
													Boolean(latestAttempt) ||
													(!answerMode.isAutoCheckable && answerState.checked
														? false
														: !answerState.value.trim())
												}
											>
												{answerMode.isAutoCheckable ? "Kiểm tra" : "Xem gợi ý"}
											</button>
											{answerState.checked ? (
												<div
													className={`mt-4 rounded-xl p-4 ${!answerMode.isAutoCheckable ? "bg-amber-50 text-amber-900" : answerState.isCorrect ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}
													role="status"
												>
													<p className="font-bold">
														{answerMode.isAutoCheckable
															? answerState.isCorrect
																? "Đúng"
																: "Sai"
															: "Gợi ý tự kiểm tra"}
													</p>
													<div className="mt-3 rounded-lg bg-white/55 p-3 ring-1 ring-current/10">
														<p className="text-sm font-bold uppercase tracking-wide opacity-75">
															Hướng dẫn giải
														</p>
														<MathMarkdown className="mt-1" content={solutionFeedback.guidance} />
													</div>
													<button
														type="button"
														onClick={() =>
															toggleDetailedSolution(exercise, exerciseKey)
														}
														className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-sm font-bold ring-1 ring-current/15 transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
														aria-expanded={answerState.showDetailedSolution}
														aria-controls={`${exerciseKey}-detailed-solution`}
													>
														{answerState.showDetailedSolution
															? "Ẩn lời giải chi tiết"
															: "Xem lời giải chi tiết"}
													</button>
													{answerState.showDetailedSolution ? (
														<div
															id={`${exerciseKey}-detailed-solution`}
															className="mt-3 rounded-lg bg-white/70 p-3 ring-1 ring-current/10"
														>
															<div className="flex flex-wrap items-baseline gap-1.5">
																<span className="font-bold">
																	{answerMode.isAutoCheckable
																		? "Đáp án đúng:"
																		: "Đáp án tham khảo:"}
																</span>
																<MathMarkdown content={solutionFeedback.correctAnswer} />
															</div>
															{solutionFeedback.detailSteps.length > 0 ? (
																<ol className="mt-2 list-decimal space-y-1 pl-5">
																	{solutionFeedback.detailSteps.map(
																		(step, stepIndex) => (
																			<li key={stepIndex}>
																				<MathMarkdown content={step} />
																			</li>
																		),
																	)}
																</ol>
															) : null}
															{solutionFeedback.explanation ? (
																<MathMarkdown className="mt-2" content={solutionFeedback.explanation} />
															) : null}
														</div>
													) : null}
												</div>
											) : null}
											{submittedAnswer ? (
												<div className="mt-4 rounded-xl bg-slate-50 p-4 text-slate-700 ring-1 ring-slate-100">
													<p>
														<span className="font-bold">Bài làm đã nộp:</span>{" "}
														{getAttemptAnswerValue(submittedAnswer)}
													</p>
													<p>
														<span className="font-bold">Điểm câu này:</span>{" "}
														{submittedAnswer.score ?? 0}
													</p>
													{submittedAnswer.ai_comment ? (
														<p className="mt-1">{submittedAnswer.ai_comment}</p>
													) : null}
												</div>
											) : null}
										</article>
									);
								})}
								<div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
									<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
										<div>
											<p className="font-bold text-gray-900">
												Nộp bài kiểm tra cuối buổi
											</p>
											<p className="text-gray-600">
												Kết quả được gửi tới API bài học và dùng cho gợi ý học
												tiếp.
											</p>
										</div>
										<button
											type="button"
											onClick={() => handleSubmitQuiz(false)}
											disabled={submitting || Boolean(latestAttempt)}
											className={`bg-emerald-600 px-5 py-2.5 font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${theme.buttonRadius}`}
										>
											{submitting
												? "Đang nộp..."
												: latestAttempt
													? "Đã nộp"
													: "Nộp bài"}
										</button>
									</div>
								</div>
							</section>
							{latestAttempt ? (
								<section
									className={`${theme.cardRadius} ${theme.cardBg} ${theme.cardPadding} ${theme.cardBorder} shadow-sm`}
								>
									<h2 className={`text-xl text-gray-900 ${theme.fontWeight}`}>
										Gợi ý sau bài kiểm tra
									</h2>
									{recommendationLoading ? (
										<p className="mt-2 text-gray-600">
											Đang tải gợi ý học tiếp...
										</p>
									) : nextRecommendationTarget ? (
										<div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-100">
											<p className="font-bold">
												{nextRecommendationTarget.title}
											</p>
											{nextRecommendationTarget.topic ? (
												<p className="mt-1 text-emerald-800">
													{nextRecommendationTarget.topic}
												</p>
											) : null}
											<Link
												href={`/dashboard/lessons/${encodeURIComponent(nextRecommendationTarget.lesson_id)}`}
												className="mt-3 inline-block rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
											>
												Xem gợi ý tiếp theo →
											</Link>
										</div>
									) : (
										<p className="mt-2 text-gray-600">
											Chưa có gợi ý tiếp theo từ API. Em có thể quay lại danh
											sách bài học hoặc dashboard để chọn nội dung tiếp theo.
										</p>
									)}
									<div className="mt-4 flex flex-wrap gap-3">
										<Link
											href="/dashboard/lessons"
											className="rounded-xl bg-gray-900 px-4 py-2 font-bold text-white transition hover:bg-gray-800"
										>
											Danh sách bài học
										</Link>
										<Link
											href="/dashboard"
											className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white transition hover:bg-blue-700"
										>
											Về dashboard
										</Link>
									</div>
								</section>
							) : null}
						</>
					) : (
						<section
							className="flex flex-col gap-4"
							aria-labelledby="local-prompts"
						>
							<h2 id="local-prompts" className="sr-only">
								Câu hỏi tự luyện cuối bài
							</h2>
							{prompts.map((prompt, index) => (
								<article
									key={prompt}
									className={`${theme.cardRadius} bg-white p-5 shadow-sm ring-1 ring-gray-100`}
								>
									<p className="mb-2 text-sm font-bold uppercase tracking-wide text-emerald-600">
										Câu {index + 1}
									</p>
									<p className="text-lg font-semibold leading-8 text-gray-900">
										{prompt}
									</p>
									<div className="mt-4 rounded-xl bg-gray-50 p-4 text-gray-600 ring-1 ring-gray-100">
										Viết câu trả lời ra giấy nháp, sau đó đối chiếu với nội dung
										lý thuyết và ví dụ trong bài.
									</div>
								</article>
							))}
						</section>
					)}
				</div>
			</div>
		</div>
	);
}
