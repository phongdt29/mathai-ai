"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useAgeTheme } from "@/contexts/AgeThemeContext";
import {
	apiClient,
	getLessonExerciseAttemptHistory,
	submitLessonExerciseAttempt,
	type LessonExerciseAttemptHistoryItem,
	type LessonExerciseAttemptResponse,
} from "@/lib/api";
import MathMarkdown from "@/components/MathMarkdown";
import {
	buildLessonOverviewContent,
	buildLessonOverviewTimelineItems,
	getLessonExerciseAnswerMode,
} from "@/lib/lesson-content";
import {
	getLessonDetailEndpoint,
	getLessonExerciseAttemptHistoryEndpoint,
	getLessonExerciseAttemptSubmitEndpoint,
	getLessonExerciseGenerationEndpoint,
} from "@/lib/lesson-endpoints";
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

const answerTypeLabel: Record<string, string> = {
	multiple_choice: "Trắc nghiệm",
	short_answer: "Trả lời ngắn",
	essay: "Tự luận",
};

const timelineMarkerColors = [
	"bg-blue-600 text-white ring-blue-100",
	"bg-cyan-600 text-white ring-cyan-100",
	"bg-indigo-600 text-white ring-indigo-100",
	"bg-violet-600 text-white ring-violet-100",
	"bg-sky-600 text-white ring-sky-100",
];

function renderSolutionSteps(steps?: string[] | string | null) {
	if (!steps) return null;
	if (Array.isArray(steps)) {
		return (
			<ol className="mt-2 list-decimal space-y-1 pl-5 text-gray-600">
				{steps.map((step, index) => (
					<li key={index}>
						<MathMarkdown content={step} />
					</li>
				))}
			</ol>
		);
	}
	return <MathMarkdown className="mt-2 text-gray-600" content={steps} />;
}

const FALLBACK_GENERATION_NOTICE =
	"Bài học demo này chưa được lưu trong giáo trình cá nhân. Tạo bài tập bằng AI cần một bài học đã lưu từ giáo trình cá nhân.";

function getExerciseId(exercise: LessonExercise, index: number) {
	return exercise._id || `exercise-${index}`;
}

function formatAttemptDate(value?: string | null) {
	if (!value) return "Không rõ thời gian";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Không rõ thời gian";
	return new Intl.DateTimeFormat("vi-VN", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(date);
}

function formatScore(result?: LessonExerciseAttemptHistoryItem["result"]) {
	const score = Number(result?.score ?? 0);
	const maxScore = Number(result?.max_score ?? result?.total_questions ?? 0);
	const percentage = Number(result?.percentage ?? 0);
	return `${score}/${maxScore}${Number.isFinite(percentage) ? ` (${Math.round(percentage)}%)` : ""}`;
}

function buildIdempotencyKey(lessonId: string) {
	const randomPart = Math.random().toString(36).slice(2, 10);
	return `practical-${lessonId}-${Date.now()}-${randomPart}`;
}

export default function LessonDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = React.use(params);
	const { theme, ageGroup } = useAgeTheme();
	const [lesson, setLesson] = useState<LessonDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [generating, setGenerating] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [historyLoading, setHistoryLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const [attemptStartedAt, setAttemptStartedAt] = useState<string | null>(null);
	const [latestAttempt, setLatestAttempt] =
		useState<LessonExerciseAttemptResponse | null>(null);
	const [attemptHistory, setAttemptHistory] = useState<
		LessonExerciseAttemptHistoryItem[]
	>([]);
	const [historyError, setHistoryError] = useState<string | null>(null);
	const [openHistoryIds, setOpenHistoryIds] = useState<Record<string, boolean>>({});

	const isElementary = ageGroup === "elementary";
	const isHigh = ageGroup === "high";
	const exercises = useMemo(() => lesson?.exercises ?? [], [lesson?.exercises]);
	const exerciseSignature = useMemo(
		() => exercises.map((exercise, index) => getExerciseId(exercise, index)).join("|"),
		[exercises],
	);

	useEffect(() => {
		let cancelled = false;

		async function fetchLesson() {
			setLoading(true);
			setError(null);
			setNotice(null);
			try {
				const lessonEndpoint = getLessonDetailEndpoint(id);
				if (!lessonEndpoint) {
					const fallbackLesson = getFallbackLessonDetail(id);
					if (fallbackLesson && !cancelled) {
						setLesson(fallbackLesson);
					}
					return;
				}

				setLesson(null);
				const res = await apiClient<ApiResponse<LessonDetail>>(lessonEndpoint);
				if (!cancelled) {
					setLesson(res.data);
				}
			} catch (err) {
				if (!cancelled) {
					setLesson(null);
					setError(
						err instanceof Error ? err.message : "Không thể tải bài học.",
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
		let cancelled = false;
		const historyEndpoint = getLessonExerciseAttemptHistoryEndpoint(id);
		if (!historyEndpoint) {
			queueMicrotask(() => {
				if (!cancelled) {
					setAttemptHistory([]);
					setHistoryError(null);
				}
			});
			return () => {
				cancelled = true;
			};
		}

		async function fetchHistory() {
			setHistoryLoading(true);
			setHistoryError(null);
			try {
				const history = await getLessonExerciseAttemptHistory(id);
				if (!cancelled) setAttemptHistory(history);
			} catch (err) {
				if (!cancelled) {
					setHistoryError(
						err instanceof Error
							? err.message
							: "Không thể tải lịch sử làm bài.",
					);
				}
			} finally {
				if (!cancelled) setHistoryLoading(false);
			}
		}

		fetchHistory();
		return () => {
			cancelled = true;
		};
	}, [id]);

	useEffect(() => {
		let cancelled = false;
		queueMicrotask(() => {
			if (!cancelled) {
				setAnswers({});
				setLatestAttempt(null);
				setAttemptStartedAt(new Date().toISOString());
			}
		});
		return () => {
			cancelled = true;
		};
	}, [id, exerciseSignature]);

	function handleAnswerChange(exerciseKey: string, value: string) {
		setAnswers((current) => ({ ...current, [exerciseKey]: value }));
		setLatestAttempt(null);
		if (!attemptStartedAt) setAttemptStartedAt(new Date().toISOString());
	}

	async function refreshAttemptHistory() {
		const historyEndpoint = getLessonExerciseAttemptHistoryEndpoint(id);
		if (!historyEndpoint) return;
		setHistoryLoading(true);
		setHistoryError(null);
		try {
			const history = await getLessonExerciseAttemptHistory(id);
			setAttemptHistory(history);
		} catch (err) {
			setHistoryError(
				err instanceof Error ? err.message : "Không thể tải lịch sử làm bài.",
			);
		} finally {
			setHistoryLoading(false);
		}
	}

	async function handleSubmitAttempt() {
		const submitEndpoint = getLessonExerciseAttemptSubmitEndpoint(id);
		if (!submitEndpoint) {
			setError(null);
			setNotice("Bài học demo không hỗ trợ nộp bài tập thực tế.");
			return;
		}

		const payloadAnswers = exercises
			.filter((exercise) => exercise._id)
			.map((exercise, index) => {
				const exerciseKey = getExerciseId(exercise, index);
				const answerValue = (answers[exerciseKey] ?? "").trim();
				return exercise.answer_type === "multiple_choice"
					? { exercise_id: exercise._id!, selected_choice: answerValue }
					: { exercise_id: exercise._id!, student_answer: answerValue };
			});

		if (payloadAnswers.length === 0) {
			setError("Chưa có bài tập hợp lệ để nộp.");
			return;
		}

		const unansweredCount = payloadAnswers.filter(
			(answer) => !(answer.student_answer ?? answer.selected_choice ?? "").trim(),
		).length;
		if (unansweredCount > 0) {
			setError("Vui lòng trả lời tất cả câu hỏi trước khi nộp bài.");
			return;
		}

		const submittedAt = new Date().toISOString();
		const startedAt = attemptStartedAt ?? submittedAt;
		const durationSeconds = Math.max(
			0,
			Math.round((Date.parse(submittedAt) - Date.parse(startedAt)) / 1000),
		);

		setSubmitting(true);
		setError(null);
		setNotice(null);
		try {
			const attempt = await submitLessonExerciseAttempt(id, {
				answers: payloadAnswers,
				duration_seconds: durationSeconds,
				started_at: startedAt,
				submitted_at: submittedAt,
				idempotency_key: buildIdempotencyKey(id),
			});
			setLatestAttempt(attempt);
			setNotice(
				attempt.idempotent
					? "Bài nộp này đã được ghi nhận trước đó."
					: "Đã nộp bài tập thực tế thành công.",
			);
			await refreshAttemptHistory();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Không thể nộp bài lúc này.");
		} finally {
			setSubmitting(false);
		}
	}

	async function handleGenerate(forceRegenerate: boolean) {
		const generationEndpoint = getLessonExerciseGenerationEndpoint(id);
		if (!generationEndpoint) {
			setError(null);
			setNotice(FALLBACK_GENERATION_NOTICE);
			setGenerating(false);
			return;
		}

		setGenerating(true);
		setError(null);
		setNotice(null);

		try {
			const res = await apiClient<
				ApiResponse<{
					lesson: LessonDetail;
					generated: LessonExercise[];
					source: "existing" | "generated";
				}>
			>(generationEndpoint, {
				method: "POST",
				body: JSON.stringify({ force_regenerate: forceRegenerate }),
			});
			setLesson(res.data.lesson);
			setLatestAttempt(null);
			setAnswers({});
			setAttemptStartedAt(new Date().toISOString());
			setNotice(
				res.message ||
					(res.data.source === "existing"
						? "Đã tải bài tập hiện có."
						: "AI đã tạo bài tập thực tế cho bài học."),
			);
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Không thể tạo bài tập bằng AI lúc này.",
			);
		} finally {
			setGenerating(false);
		}
	}

	if (loading) {
		return (
			<div className={`max-w-3xl flex flex-col ${theme.sectionGap}`}>
				<div
					className={`${theme.cardRadius} ${theme.cardBg} ${theme.cardPadding} ${theme.cardBorder} shadow-sm`}
				>
					<p className="text-lg text-gray-600">Đang tải nội dung bài học...</p>
				</div>
			</div>
		);
	}

	if (!lesson) {
		return (
			<div className={`max-w-3xl flex flex-col ${theme.sectionGap}`}>
				<Link
					href="/dashboard/lessons"
					className="text-lg text-blue-600 hover:opacity-80"
				>
					← Quay lại danh sách
				</Link>
				<div
					className={`${theme.cardRadius} ${theme.cardBg} ${theme.cardPadding} ${theme.cardBorder} shadow-sm`}
				>
					<p className="text-lg text-red-600">
						{error || "Không tìm thấy bài học."}
					</p>
				</div>
			</div>
		);
	}

	const overviewContent = buildLessonOverviewContent(
		lesson.theory_content,
		exercises.length,
	);
	const { emptyContentMessage } = overviewContent;
	const timelineItems = buildLessonOverviewTimelineItems(
		id,
		lesson.theory_content,
		exercises.length,
	);
	const generationEndpoint = getLessonExerciseGenerationEndpoint(id);

	return (
		<div className={`max-w-4xl flex flex-col ${theme.sectionGap}`}>
			<div>
				<Link
					href="/dashboard/lessons"
					className={`mb-2 inline-block text-lg ${isHigh ? "text-gray-500 hover:text-gray-700" : "text-blue-600 hover:opacity-80"}`}
				>
					{isElementary ? "👈 Quay lại danh sách" : "← Quay lại danh sách"}
				</Link>
				<h1 className={`text-gray-900 text-2xl ${theme.fontWeight}`}>
					{isElementary ? `${lesson.lesson_title} ✨` : lesson.lesson_title}
				</h1>
				<div className="mt-2 flex flex-wrap gap-2 text-base text-gray-500">
					<span>Toán học</span>
					{lesson.estimated_minutes ? (
						<span>· {lesson.estimated_minutes} phút</span>
					) : null}
					{lesson.status ? (
						<span>
							· {lesson.status === "completed" ? "Đã hoàn thành" : "Đang học"}
						</span>
					) : null}
				</div>
			</div>

			{error && (
				<div
					className={`bg-red-50 text-red-700 ring-1 ring-red-200 ${theme.cardRadius} ${theme.cardPadding}`}
				>
					{error}
				</div>
			)}
			{notice && (
				<div
					className={`bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 ${theme.cardRadius} ${theme.cardPadding}`}
				>
					{notice}
				</div>
			)}

			<div
				className={`shadow-sm ${theme.cardRadius} ${theme.cardBg} ${theme.cardPadding} ${theme.cardBorder} flex flex-col gap-4`}
			>
				<h2 className={`text-gray-900 text-xl ${theme.fontWeight}`}>
					{isElementary ? "🎯 Mục tiêu bài học" : "Mục tiêu bài học"}
				</h2>
				<p className="text-lg text-gray-700">
					{lesson.lesson_objective ||
						"Hoàn thành lý thuyết và vận dụng vào các bài tập thực tế."}
				</p>
			</div>

			<section
				aria-labelledby="lesson-timeline-heading"
				className={`shadow-sm ${theme.cardRadius} ${theme.cardBg} ${theme.cardPadding} ${theme.cardBorder} overflow-hidden`}
			>
				<div className="mb-5 flex flex-col gap-2 border-b border-gray-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="mb-1 text-sm font-bold uppercase tracking-[0.2em] text-blue-500">
							Lộ trình học
						</p>
						<h2
							id="lesson-timeline-heading"
							className={`text-gray-900 text-xl ${theme.fontWeight}`}
						>
							{isElementary
								? "📖 Nội dung bài học"
								: isHigh
									? "Nội dung bài học"
									: "📖 Nội dung bài học"}
						</h2>
					</div>
					{timelineItems.length > 0 ? (
						<div className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700 ring-1 ring-blue-100">
							{timelineItems.length} chặng học
						</div>
					) : null}
				</div>

				{timelineItems.length > 0 ? (
					<ol className="relative flex flex-col gap-4 before:absolute before:bottom-8 before:left-5 before:top-8 before:w-0.5 before:bg-gradient-to-b before:from-blue-200 before:via-sky-200 before:to-emerald-200 sm:before:left-6">
						{timelineItems.map((item, index) => (
							<li
								key={`${item.isFinalCheck ? "check" : "section"}-${item.itemNumber ?? index}`}
								className="relative pl-14 sm:pl-16"
							>
								<span
									className={`absolute left-0 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black shadow-sm ring-4 sm:h-12 sm:w-12 ${
										item.isFinalCheck
											? "bg-emerald-500 text-white ring-emerald-100"
											: isHigh
												? "bg-gray-800 text-white ring-gray-100"
												: timelineMarkerColors[
														index % timelineMarkerColors.length
													]
									}`}
								>
									{item.markerLabel}
								</span>
								<a
									href={item.href}
									className={`group block rounded-3xl border p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
										item.isFinalCheck
											? "border-emerald-100 bg-emerald-50/90 text-emerald-950 hover:border-emerald-200 hover:bg-emerald-100/80 focus-visible:ring-emerald-500"
											: "border-gray-100 bg-white/80 text-gray-800 hover:border-blue-200 hover:bg-blue-50/50 focus-visible:ring-blue-500"
									}`}
								>
									<div className="mb-2 flex flex-wrap items-center gap-2">
										<span
											className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
												item.isFinalCheck
													? "bg-emerald-100 text-emerald-700"
													: "bg-blue-100 text-blue-700"
											}`}
										>
											{item.phase}
										</span>
										{item.itemNumber ? (
											<span className="text-sm font-semibold text-gray-400">
												Mục {item.itemNumber}
											</span>
										) : null}
									</div>
									<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
										<p className="whitespace-pre-wrap text-lg leading-8 text-gray-700 sm:max-w-[42rem]">
											{item.title}
										</p>
										<span
											className={`self-start whitespace-nowrap text-sm font-black transition group-hover:translate-x-0.5 sm:self-center ${
												item.isFinalCheck ? "text-emerald-700" : "text-blue-600"
											}`}
										>
											{item.ctaLabel} →
										</span>
									</div>
								</a>
							</li>
						))}
					</ol>
				) : (
					<div className="rounded-2xl border border-gray-100 bg-white/70 p-4 text-gray-600 text-lg shadow-sm">
						{emptyContentMessage}
					</div>
				)}
			</section>

			<div
				className={`shadow-sm ${theme.cardRadius} ${theme.cardBg} ${theme.cardPadding} ${theme.cardBorder} flex flex-col gap-4`}
			>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 className={`text-gray-900 text-xl ${theme.fontWeight}`}>
							{isElementary ? "🧩 Bài tập thực tế" : "Bài tập thực tế"}
						</h2>
						<p className="text-gray-500 text-base">
							AI tạo bài tập bám sát mục tiêu và nội dung bài học.
						</p>
					</div>
					<button
						type="button"
						onClick={() => handleGenerate(exercises.length > 0)}
						disabled={generating || !generationEndpoint}
						title={!generationEndpoint ? FALLBACK_GENERATION_NOTICE : undefined}
						className={`bg-blue-600 px-4 py-2 text-white font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${theme.buttonRadius}`}
					>
						{generating
							? "Đang tạo..."
							: exercises.length > 0
								? "Tạo lại bài tập"
								: "Tạo bài tập với AI"}
					</button>
				</div>

				{exercises.length === 0 ? (
					<div className="rounded-xl bg-gray-50 p-5 text-gray-600 ring-1 ring-gray-100">
						{!generationEndpoint
							? "Đây là bài học demo. Tạo bài tập bằng AI cần một bài học đã lưu từ giáo trình cá nhân."
							: "Chưa có bài tập cho bài học này. Nhấn “Tạo bài tập với AI” để tạo bài tập thực tế bằng tiếng Việt."}
					</div>
				) : (
					<div className="flex flex-col gap-4">
						{latestAttempt?.result ? (
							<div className="rounded-2xl bg-blue-50 p-4 text-blue-900 ring-1 ring-blue-100">
								<p className="font-bold">Kết quả vừa nộp: {formatScore(latestAttempt.result)}</p>
								<p className="text-sm text-blue-700">
									Đúng {latestAttempt.result.correct_answers ?? 0}/
									{latestAttempt.result.total_questions ?? latestAttempt.answers?.length ?? exercises.length} câu
								</p>
							</div>
						) : null}

						{exercises.map((exercise, index) => {
							const exerciseKey = getExerciseId(exercise, index);
							const submittedAnswer = latestAttempt?.answers?.find(
								(answer) => answer.exercise_id === exercise._id,
							);
							const currentAnswer = answers[exerciseKey] ?? "";
							const answerSnapshot = submittedAnswer?.exercise_snapshot;
							const correctAnswer = answerSnapshot?.correct_answer ?? exercise.correct_answer;
							const solutionSteps = answerSnapshot?.solution_steps ?? exercise.solution_steps;
							const explanation = answerSnapshot?.explanation ?? exercise.explanation;

							return (
								<article
									key={exerciseKey}
									className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
								>
									<div className="mb-3 flex flex-wrap items-center gap-2">
										<span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
											Bài {exercise.order_index || index + 1}
										</span>
										<span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600">
											{answerTypeLabel[exercise.answer_type] || exercise.answer_type}
										</span>
										{exercise.difficulty_level ? (
											<span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
												{exercise.difficulty_level}
											</span>
										) : null}
										{submittedAnswer ? (
											<span
												className={`rounded-full px-3 py-1 text-sm font-bold ${submittedAnswer.is_correct ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
											>
												{submittedAnswer.is_correct ? "Đúng" : "Cần xem lại"}
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

									{getLessonExerciseAnswerMode(exercise.answer_type, exercise.choices).renderMode === "choice" ? (
										<div className="mt-3 grid gap-2 sm:grid-cols-2">
											{(exercise.choices && exercise.choices.length > 0 ? exercise.choices : ["Đúng", "Sai"]).map((choice, choiceIndex) => (
												<label
													key={choiceIndex}
													className={`flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2 text-gray-700 ring-1 transition ${currentAnswer === choice ? "bg-blue-50 ring-blue-300" : "bg-gray-50 ring-gray-100 hover:bg-gray-100"}`}
												>
													<input
														type="radio"
														name={`exercise-${exerciseKey}`}
														value={choice}
														checked={currentAnswer === choice}
														onChange={() => handleAnswerChange(exerciseKey, choice)}
														className="mt-1"
													/>
													<span className="flex flex-1 items-baseline gap-1.5">
														{exercise.answer_type !== "true_false" ? (
															<span className="font-bold">{String.fromCharCode(65 + choiceIndex)}.</span>
														) : null}
														<MathMarkdown className="min-w-0 flex-1" content={choice} />
													</span>
												</label>
											))}
										</div>
									) : exercise.answer_type === "essay" ? (
										<textarea
											value={currentAnswer}
											onChange={(event) => handleAnswerChange(exerciseKey, event.target.value)}
											placeholder="Nhập lời giải của bạn..."
											rows={4}
											className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
										/>
									) : (
										<input
											value={currentAnswer}
											onChange={(event) => handleAnswerChange(exerciseKey, event.target.value)}
											placeholder="Nhập câu trả lời ngắn..."
											className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
										/>
									)}

									{submittedAnswer ? (
										<div className="mt-4 flex flex-col gap-3 rounded-xl bg-slate-50 p-3 text-slate-700 ring-1 ring-slate-100">
											<div>
												<p><span className="font-bold">Bài làm:</span> {submittedAnswer.selected_choice || submittedAnswer.student_answer || "Chưa có câu trả lời"}</p>
												<p><span className="font-bold">Điểm:</span> {submittedAnswer.score ?? 0}</p>
												{submittedAnswer.ai_comment ? <p className="mt-1 text-slate-600">{submittedAnswer.ai_comment}</p> : null}
											</div>
											<div className="rounded-xl bg-emerald-50 p-3 text-emerald-900 ring-1 ring-emerald-100">
												<p className="font-bold">Đáp án và lời giải</p>
												<div className="mt-2 flex flex-wrap items-baseline gap-1.5"><span className="font-bold">Đáp án:</span><MathMarkdown content={correctAnswer || "Chưa có đáp án"} /></div>
												{renderSolutionSteps(solutionSteps)}
												{explanation ? <MathMarkdown className="mt-2 text-emerald-800" content={explanation} /> : null}
											</div>
										</div>
									) : null}
								</article>
							);
						})}

						<div className="flex flex-col gap-3 rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-gray-600">Hoàn thành tất cả câu hỏi rồi nộp bài để lưu kết quả vào lịch sử.</p>
							<button
								type="button"
								onClick={handleSubmitAttempt}
								disabled={submitting || exercises.length === 0}
								className={`bg-emerald-600 px-5 py-2.5 text-white font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${theme.buttonRadius}`}
							>
								{submitting ? "Đang nộp..." : "Nộp bài"}
							</button>
						</div>
					</div>
				)}
			</div>

			<section
				aria-labelledby="exercise-history-heading"
				className={`shadow-sm ${theme.cardRadius} ${theme.cardBg} ${theme.cardPadding} ${theme.cardBorder} flex flex-col gap-4`}
			>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 id="exercise-history-heading" className={`text-gray-900 text-xl ${theme.fontWeight}`}>
							Lịch sử làm bài
						</h2>
						<p className="text-gray-500 text-base">Xem lại các lần nộp bài tập thực tế của bài học này.</p>
					</div>
					<button
						type="button"
						onClick={refreshAttemptHistory}
						disabled={historyLoading || !getLessonExerciseAttemptHistoryEndpoint(id)}
						className={`bg-gray-900 px-4 py-2 text-white font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${theme.buttonRadius}`}
					>
						{historyLoading ? "Đang tải..." : "Làm mới"}
					</button>
				</div>

				{historyError ? (
					<div className="rounded-xl bg-red-50 p-3 text-red-700 ring-1 ring-red-100">{historyError}</div>
				) : null}

				{historyLoading && attemptHistory.length === 0 ? (
					<div className="rounded-xl bg-gray-50 p-4 text-gray-600 ring-1 ring-gray-100">Đang tải lịch sử làm bài...</div>
				) : attemptHistory.length === 0 ? (
					<div className="rounded-xl bg-gray-50 p-4 text-gray-600 ring-1 ring-gray-100">Chưa có lần nộp bài nào.</div>
				) : (
					<div className="flex flex-col gap-3">
						{attemptHistory.map((attempt, index) => {
							const result = attempt.result;
							const attemptId = result?._id || `attempt-${index}`;
							const isOpen = openHistoryIds[attemptId] ?? index === 0;
							const answersInAttempt = attempt.answers ?? [];

							return (
								<div key={attemptId} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
									<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
										<div>
											<p className="font-bold text-gray-900">Lần {index + 1} · {formatAttemptDate(result?.submitted_at || result?.createdAt)}</p>
											<p className="text-sm text-gray-600">
												Điểm {formatScore(result)} · Đúng {result?.correct_answers ?? answersInAttempt.filter((answer) => answer.is_correct).length}/{result?.total_questions ?? answersInAttempt.length} câu
											</p>
										</div>
										<button
											type="button"
											onClick={() => setOpenHistoryIds((current) => ({ ...current, [attemptId]: !isOpen }))}
											className="self-start rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700 ring-1 ring-blue-100"
										>
											{isOpen ? "Thu gọn" : "Xem chi tiết"}
										</button>
									</div>

									{isOpen ? (
										<div className="mt-4 flex flex-col gap-3">
											{answersInAttempt.map((answer, answerIndex) => {
												const snapshot = answer.exercise_snapshot;
												return (
													<div key={answer._id || `${attemptId}-${answerIndex}`} className="rounded-xl bg-gray-50 p-3 text-gray-700 ring-1 ring-gray-100">
														<div className="mb-2 flex flex-wrap items-center gap-2">
															<span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-gray-700 ring-1 ring-gray-100">Câu {snapshot?.order_index ?? answerIndex + 1}</span>
															<span className={`rounded-full px-2.5 py-1 text-xs font-bold ${answer.is_correct ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{answer.is_correct ? "Đúng" : "Chưa đúng"}</span>
														</div>
														<p className="whitespace-pre-wrap font-semibold text-gray-900">{snapshot?.question_text || "Không có nội dung câu hỏi"}</p>
														<p className="mt-2"><span className="font-bold">Bài làm:</span> {answer.selected_choice || answer.student_answer || "Chưa có câu trả lời"}</p>
														<p><span className="font-bold">Đáp án:</span> {snapshot?.correct_answer || "Chưa có đáp án"}</p>
														<p><span className="font-bold">Điểm:</span> {answer.score ?? 0}</p>
														{answer.ai_comment ? <p className="mt-1 text-gray-600">{answer.ai_comment}</p> : null}
														{renderSolutionSteps(snapshot?.solution_steps)}
														{snapshot?.explanation ? <p className="mt-2 text-gray-600">{snapshot.explanation}</p> : null}
													</div>
												);
											})}
										</div>
									) : null}
								</div>
							);
						})}
					</div>
				)}
			</section>

			{isElementary && theme.showMascot && (
				<div
					className={`flex items-center gap-4 bg-amber-50 ring-1 ring-amber-200 ${theme.cardRadius} ${theme.cardPadding}`}
				>
					<span className="text-[2.5rem]">🦉</span>
					<div>
						<p className="font-bold text-amber-800 text-lg">
							Cú Thông Thái nói:
						</p>
						<p className="text-amber-700 text-lg">
							Bạn đang làm rất tốt! Hãy đọc kỹ từng phần rồi thử làm bài tập
							nhé! 💪
						</p>
					</div>
				</div>
			)}

			<div
				className={`text-white ${theme.cardRadius} ${theme.cardPadding} bg-blue-600`}
			>
				<h2 className="font-bold mb-2 text-xl">
					{isElementary
						? "🤖 Bạn cần giúp không?"
						: isHigh
							? "Hỗ trợ học tập"
							: "💡 Cần giúp đỡ?"}
				</h2>
				<p className="mb-4 text-lg text-blue-100">
					{isElementary
						? "Trợ lý AI siêu thông minh sẽ giúp bạn hiểu bài dễ dàng hơn! 🌟"
						: isHigh
							? "Sử dụng trợ lý AI để được giải thích chi tiết từng phần trong bài học."
							: "Trợ lý AI có thể giải thích chi tiết bất kỳ phần nào trong bài học này."}
				</p>
				<a
					href="/dashboard/chat"
					className={`inline-block bg-white font-semibold transition ${theme.buttonRadius} text-lg px-5 py-2.5 text-blue-600 hover:opacity-90`}
				>
					{isElementary ? "🎯 Hỏi Trợ lý AI ngay!" : "Hỏi Trợ lý AI →"}
				</a>
			</div>
		</div>
	);
}
