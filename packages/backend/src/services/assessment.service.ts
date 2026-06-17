import {
	AssessmentAnswerRepository,
	AssessmentAttemptModel,
	AssessmentAttemptRepository,
	AssessmentModel,
	AssessmentQuestionRepository,
	AssessmentRepository,
} from "../models/assessment.model";
import { TopicMasteryRepository } from "../models/progress.model";
import { StudentProfileRepository } from "../models/student.model";
import type {
	Assessment,
	AssessmentAnswer,
	AssessmentAttempt,
	AssessmentQuestion,
	AssessmentType,
	JsonValue,
	StudentProfile,
	TopicMastery,
} from "../types";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors";
import {
	calculatePercentage,
	validateEarnedPoints,
	validateQuestionPoints,
} from "../utils/scoring";
import { CurriculumRepository } from "../models/curriculum.model";
import { aiService } from "./ai.service";
import { assessmentAnomalyDetectorService } from "./assessment-anomaly-detector.service";
import {
	type ClassificationResult,
	classificationService,
} from "./classification.service";
import { curriculumService } from "./curriculum.service";
import { pointService } from "./point.service";

interface GenerateDiagnosticOptions {
	type?: string;
	grade_level?: number;
	total_questions?: number;
	difficulty?: string;
	topics?: string[];
	// Adaptive inputs
	school_name?: string;
	self_assessed_level?: string;
	math_average_score?: number;
	previous_answers?: {
		question_text: string;
		topic: string;
		is_correct: boolean;
		difficulty: string;
	}[];
}

interface GeneratedQuestion {
	question_number: number;
	question_type: "multiple_choice" | "short_answer" | "essay";
	question_text: string;
	options?: string[] | null;
	correct_answer?: string | null;
	explanation?: string | null;
	difficulty_level: "easy" | "medium" | "hard";
	topic: string;
	points?: number;
}

interface AIGradingResult {
	points_earned: number;
	is_correct: boolean;
	feedback: string;
}

interface AIAnalysisResult {
	overall_feedback: string;
	strengths: string[];
	weaknesses: string[];
	recommendations?: string;
}

interface TopicPerformance {
	topic: string;
	correct: number;
	total: number;
	score: number;
	maxScore: number;
	percentage: number;
}

interface AssessmentAttemptWithAnswers extends AssessmentAttempt {
	answers: AssessmentAnswer[];
	classification?: ClassificationResult | null;
}

interface LatestAssessmentResult extends AssessmentAttempt {
	answers: AssessmentAnswer[];
	assessment: Assessment;
}

export class AssessmentService {
	private readonly assessmentRepo: AssessmentRepository;
	private readonly questionRepo: AssessmentQuestionRepository;
	private readonly attemptRepo: AssessmentAttemptRepository;
	private readonly answerRepo: AssessmentAnswerRepository;
	private readonly topicMasteryRepo: TopicMasteryRepository;
	private readonly studentRepo: StudentProfileRepository;
	private readonly classificationService: Pick<
		typeof classificationService,
		"classifyStudent"
	>;
	private readonly curriculumRepo: Pick<
		CurriculumRepository,
		"findActiveByStudent"
	>;
	private readonly curriculumGenerator: Pick<
		typeof curriculumService,
		"generateCurriculum"
	>;

	constructor() {
		this.assessmentRepo = new AssessmentRepository();
		this.questionRepo = new AssessmentQuestionRepository();
		this.attemptRepo = new AssessmentAttemptRepository();
		this.answerRepo = new AssessmentAnswerRepository();
		this.topicMasteryRepo = new TopicMasteryRepository();
		this.studentRepo = new StudentProfileRepository();
		this.classificationService = classificationService;
		this.curriculumRepo = new CurriculumRepository();
		this.curriculumGenerator = curriculumService;
	}

	/**
	 * List all assessments for a student, with latest attempt info.
	 */
	public async listAssessments(studentId: string) {
		const assessments = await AssessmentModel.find({ student_id: studentId })
			.sort({ createdAt: -1 })
			.lean()
			.exec();

		// Attach latest attempt for each assessment
		const results = await Promise.all(
			assessments.map(async (a) => {
				const latestAttempt = await AssessmentAttemptModel.findOne({
					assessment_id: a._id,
				})
					.sort({ updatedAt: -1 })
					.lean()
					.exec();
				return {
					id: a._id,
					type: a.type,
					title: a.title,
					grade_level: a.grade_level,
					total_questions: a.total_questions,
					status: a.status,
					created_at: a.createdAt,
					latest_attempt: latestAttempt
						? {
								id: latestAttempt._id,
								status: latestAttempt.status,
								percentage: latestAttempt.percentage,
								total_score: latestAttempt.total_score,
								max_score: latestAttempt.max_score,
							}
						: null,
				};
			}),
		);

		return results;
	}

	public async generateDiagnostic(
		studentId: string,
		options: GenerateDiagnosticOptions,
	): Promise<Assessment & { questions: AssessmentQuestion[] }> {
		const profile = await this.getStudentProfileOrThrow(studentId);
		const gradeLevel = options.grade_level ?? profile.grade_level;

		if (!gradeLevel) {
			throw new ValidationError(
				"Không xác định được khối lớp của học sinh để tạo bài đánh giá",
			);
		}

		const totalQuestions = Math.min(
			Math.max(options.total_questions ?? 8, 5),
			10,
		);
		const difficulty = options.difficulty ?? "mixed";
		const requestedType = options.type ?? "diagnostic";
		const assessmentType = this.mapAssessmentType(requestedType);
		const title = this.buildAssessmentTitle(requestedType, gradeLevel);
		const prompt = this.buildGeneratePrompt({
			totalQuestions,
			gradeLevel,
			difficulty,
			topics: options.topics,
			selfAssessedLevel: profile.self_assessed_level ?? undefined,
			schoolName: options.school_name ?? profile.school_name ?? undefined,
			mathAverageScore:
				options.math_average_score ??
				(profile.math_average_score !== null
					? Number(profile.math_average_score)
					: undefined),
			previousAnswers: options.previous_answers,
		});

		const startedAt = Date.now();
		let generatedQuestions: GeneratedQuestion[] = [];
		let rawResponse = "";
		let tokensInput = 0;
		let tokensOutput = 0;

		try {
			const generationResult = await aiService.generateJSON<
				GeneratedQuestion[]
			>(
				"Bạn là một giáo viên toán giàu kinh nghiệm tại Việt Nam. Nhiệm vụ của bạn là tạo đề kiểm tra đầu vào cho học sinh.",
				prompt,
				{ temperature: 0.4, timeoutMs: 20000 },
			);

			generatedQuestions = this.normalizeGeneratedQuestions(
				generationResult.data,
				totalQuestions,
			);
			rawResponse = JSON.stringify(generatedQuestions);
			tokensInput = generationResult.tokensUsed.input;
			tokensOutput = generationResult.tokensUsed.output;
		} catch (error: unknown) {
			await aiService.logGeneration(
				studentId,
				"assessment_generate_diagnostic",
				prompt,
				rawResponse,
				"gpt-4o-mini",
				tokensInput,
				tokensOutput,
				Date.now() - startedAt,
				"error",
				error instanceof Error ? error.message : "Unknown error",
			);
			throw error;
		}

		const createdAssessment = await this.assessmentRepo.transaction(
			async (session) => {
				const assessment = await this.assessmentRepo.create(
					{
						student_id: studentId,
						type: assessmentType,
						title,
						grade_level: gradeLevel,
						target_difficulty: difficulty,
						generated_by_ai: true,
						total_questions: generatedQuestions.length,
						total_score: 0,
						duration_minutes: 30,
						status: "published",
					} as any,
					session,
				);

				if (generatedQuestions.length > 0) {
					await this.questionRepo.bulkCreate(
						assessment.id!,
						generatedQuestions.map((question, index) => ({
							question_type: question.question_type,
							topic: question.topic,
							difficulty_level: question.difficulty_level,
							question_text: question.question_text,
							choices: (question.options ?? null) as JsonValue,
							correct_answer: question.correct_answer ?? undefined,
							explanation: question.explanation ?? undefined,
							score:
								question.points ??
								this.defaultQuestionScore(question.question_type),
							order_index: question.question_number || index + 1,
						})),
						session,
					);
				}

				const questions = await this.questionRepo.findByAssessmentId(
					assessment.id!,
					session,
				);
				const updatedAssessment = await this.assessmentRepo.update(
					assessment.id!,
					{
						total_questions: questions.length,
						status: "published",
					} as any,
					session,
				);

				const plainAssessment =
					updatedAssessment &&
					typeof (updatedAssessment as any).toObject === "function"
						? (updatedAssessment as any).toObject()
						: updatedAssessment;
				const plainQuestions = questions.map((q: any) =>
					typeof q.toObject === "function" ? q.toObject() : q,
				);
				return {
					...plainAssessment,
					questions: plainQuestions,
				};
			},
		);

		await aiService.logGeneration(
			studentId,
			"assessment_generate_diagnostic",
			prompt,
			rawResponse,
			"gpt-4o-mini",
			tokensInput,
			tokensOutput,
			Date.now() - startedAt,
			"success",
		);

		return createdAssessment as any;
	}

	public async getAssessmentDetail(
		assessmentId: string,
		studentId: string,
	): Promise<Assessment & { questions: AssessmentQuestion[] }> {
		const assessment = await this.getOwnedAssessmentOrThrow(
			assessmentId,
			studentId,
		);
		const questions = await this.questionRepo.findByAssessmentId(
			assessment.id!,
		);

		return {
			...assessment,
			questions,
		} as any;
	}

	public async startAttempt(
		assessmentId: string,
		studentId: string,
	): Promise<AssessmentAttempt> {
		const assessment = await this.getOwnedAssessmentOrThrow(
			assessmentId,
			studentId,
		);

		if (assessment.status !== "published") {
			throw new ValidationError("Bài đánh giá chưa sẵn sàng để bắt đầu");
		}

		const attempts = await this.attemptRepo.findAll({
			assessment_id: assessmentId,
			student_id: studentId,
		} as any);

		const inProgressAttempt = attempts.find(
			(attempt) => attempt.status === "in_progress",
		);

		if (inProgressAttempt) {
			throw new ConflictError("Đã tồn tại lượt làm bài đang diễn ra");
		}

		return this.attemptRepo.create({
			assessment_id: assessmentId,
			student_id: studentId,
			status: "in_progress",
			total_score: 0,
			max_score: 0,
			percentage: 0,
		} as any) as any;
	}

	public async saveAnswer(
		attemptId: string,
		studentId: string,
		data: {
			question_id: string;
			student_answer: string;
			time_spent_seconds?: number;
		},
	): Promise<AssessmentAnswer> {
		const attempt = await this.getOwnedAttemptOrThrow(attemptId, studentId);

		if (attempt.status !== "in_progress") {
			throw new ValidationError(
				"Chỉ có thể lưu câu trả lời cho lượt làm bài đang diễn ra",
			);
		}

		const question = await this.questionRepo.findById(data.question_id);

		if (
			!question ||
			String(question.assessment_id) !== String(attempt.assessment_id)
		) {
			throw new NotFoundError("Không tìm thấy câu hỏi thuộc bài đánh giá này");
		}

		const grading = this.gradeMultipleChoice(
			question as any,
			data.student_answer,
		);
		const existingAnswer = await this.answerRepo.findOne({
			attempt_id: attemptId,
			question_id: data.question_id,
		} as any);

		const payload: Partial<AssessmentAnswer> = {
			attempt_id: attemptId,
			question_id: data.question_id,
			student_answer: data.student_answer,
			selected_choice:
				question.question_type === "multiple_choice"
					? data.student_answer
					: null,
			is_correct: grading.is_correct,
			score: grading.points_earned,
			ai_comment: null,
			answered_at: new Date().toISOString(),
		};

		if (existingAnswer) {
			return this.answerRepo.update(existingAnswer.id, payload as any) as any;
		}

		return this.answerRepo.create(payload as any) as any;
	}

	public async submitAttempt(
		assessmentId: string,
		attemptId: string,
		studentId: string,
	): Promise<AssessmentAttemptWithAnswers> {
		const assessment = await this.getOwnedAssessmentOrThrow(
			assessmentId,
			studentId,
		);
		const attempt = await this.getOwnedAttemptOrThrow(attemptId, studentId);

		if (String(attempt.assessment_id) !== String(assessment.id)) {
			throw new ValidationError(
				"Lượt làm bài không thuộc bài đánh giá được yêu cầu",
			);
		}

		if (attempt.status !== "in_progress") {
			throw new ValidationError(
				"Lượt làm bài này đã được nộp hoặc chấm điểm trước đó",
			);
		}

		const questions = await this.questionRepo.findByAssessmentId(
			assessment.id!,
		);

		if (questions.length === 0) {
			throw new ValidationError("Bài đánh giá chưa có câu hỏi để chấm điểm");
		}

		const existingAnswers = await this.answerRepo.findByAttemptId(attemptId);
		const answerMap = new Map(
			existingAnswers.map((answer) => [String(answer.question_id), answer]),
		);
		const updatedAnswers: AssessmentAnswer[] = [];

		for (const question of questions) {
			const currentAnswer = answerMap.get(String(question.id));

			if (!currentAnswer) {
				continue;
			}

			if (question.question_type === "multiple_choice") {
				const grading = this.gradeMultipleChoice(
					question as any,
					currentAnswer.student_answer ?? "",
				);
				const refreshedAnswer = await this.answerRepo.update(currentAnswer.id, {
					is_correct: grading.is_correct,
					score: grading.points_earned,
				} as any);
				updatedAnswers.push(refreshedAnswer as any);
				continue;
			}

			const grading = await this.gradeOpenQuestion(
				question as any,
				currentAnswer.student_answer ?? "",
			);
			const refreshedAnswer = await this.answerRepo.update(currentAnswer.id, {
				is_correct: grading.is_correct,
				score: grading.points_earned,
				ai_comment: grading.feedback,
			} as any);
			updatedAnswers.push(refreshedAnswer as any);
		}

		const finalAnswers = await this.answerRepo.findByAttemptId(attemptId);
		const maxScore = validateQuestionPoints(
			questions.map((question) => Number(question.score ?? 0)),
		);
		const rawTotalScore = finalAnswers.reduce(
			(sum, answer) => sum + Number(answer.score ?? 0),
			0,
		);
		const totalScore = validateEarnedPoints(rawTotalScore, maxScore);
		const percentage = calculatePercentage(totalScore, maxScore);
		const analysis = await this.analyzePerformance(
			assessment.grade_level,
			questions as any,
			finalAnswers as any,
		);

		const completedAttempt = await this.attemptRepo.update(attempt.id!, {
			submitted_at: new Date().toISOString(),
			total_score: totalScore,
			max_score: maxScore,
			percentage,
			ai_feedback: this.combineFeedback(analysis),
			ai_analysis: {
				strengths: analysis.strengths,
				weaknesses: analysis.weaknesses,
				recommendations: analysis.recommendations ?? "",
			} as JsonValue,
			status: "graded",
		} as any);

		await this.assessmentRepo.update(assessment.id!, {
			status: "completed",
			total_score: totalScore,
		} as any);

		await this.updateTopicMastery(
			studentId,
			questions as any,
			finalAnswers as any,
			assessment.grade_level,
		);

		await pointService.recordAssessmentResult({
			student_id: studentId,
			assessment_id: assessment.id!,
			attempt_id: completedAttempt.id!,
			earned_points: totalScore,
			max_points: maxScore,
			competency_score: percentage,
			difficulty: assessment.target_difficulty,
			reason: `Hoàn thành bài đánh giá: ${assessment.title}`,
			metadata: {
				assessment_type: assessment.type,
				total_questions: questions.length,
			},
		});

		await this.detectAssessmentAnomalies({
			studentId,
			assessmentId: assessment.id!,
			completedAttempt: completedAttempt as any,
			finalAnswers: finalAnswers as any,
		});

		const classification = await this.autoClassifyAfterSubmit({
			studentId,
			attemptId: completedAttempt.id!,
		});

		// User-flow đặc tả: sau khi AI phân tích/phân loại → tự tạo giáo trình.
		const curriculumGenerated =
			await this.autoGenerateCurriculumIfMissing(studentId);

		return {
			...completedAttempt,
			answers: finalAnswers,
			classification,
			curriculum_generated: curriculumGenerated,
		} as any;
	}

	/**
	 * Tự tạo giáo trình cá nhân hóa ngay sau khi nộp bài đánh giá nếu học sinh
	 * CHƯA có giáo trình active (idempotent). Fail-soft: lỗi tạo giáo trình không
	 * làm hỏng kết quả nộp bài. Trả về true nếu vừa tạo mới giáo trình.
	 */
	private async autoGenerateCurriculumIfMissing(
		studentId: string,
	): Promise<boolean> {
		try {
			const active = await this.curriculumRepo.findActiveByStudent(studentId);
			if (active.length > 0) {
				return false;
			}
			await this.curriculumGenerator.generateCurriculum(studentId, {});
			return true;
		} catch (error) {
			console.warn("Assessment auto-curriculum generation failed", {
				studentId,
				error,
			});
			return false;
		}
	}

	public async getLatestResult(
		studentId: string,
	): Promise<LatestAssessmentResult | null> {
		const latestAttempt = (await AssessmentAttemptModel.findOne({
			student_id: studentId,
			status: "graded",
		})
			.sort({ updatedAt: -1 })
			.exec()) as any;

		if (!latestAttempt) {
			return null;
		}

		const assessment = await this.assessmentRepo.findById(
			latestAttempt.assessment_id as any,
		);

		if (!assessment || String(assessment.student_id) !== String(studentId)) {
			return null;
		}

		const answers = await this.answerRepo.findByAttemptId(latestAttempt.id!);
		let aiAnalysis = this.parseAnalysis(latestAttempt.ai_analysis);
		let aiFeedback = latestAttempt.ai_feedback;

		if (aiAnalysis.strengths.length === 0 || aiAnalysis.weaknesses.length === 0) {
			const questions = await this.questionRepo.findByAssessmentId(assessment.id!);
			const repairedAnalysis = this.buildDeterministicAnalysis(
				assessment.grade_level,
				this.collectTopicPerformance(questions as any, answers as any),
				answers.length,
			);
			aiAnalysis = {
				overall_feedback: aiAnalysis.overall_feedback || repairedAnalysis.overall_feedback,
				strengths: aiAnalysis.strengths.length > 0 ? aiAnalysis.strengths : repairedAnalysis.strengths,
				weaknesses: aiAnalysis.weaknesses.length > 0 ? aiAnalysis.weaknesses : repairedAnalysis.weaknesses,
				recommendations: aiAnalysis.recommendations || repairedAnalysis.recommendations,
			};
			aiFeedback = aiFeedback || this.combineFeedback(aiAnalysis);

			await this.attemptRepo.update(latestAttempt.id!, {
				ai_feedback: aiFeedback,
				ai_analysis: {
					strengths: aiAnalysis.strengths,
					weaknesses: aiAnalysis.weaknesses,
					recommendations: aiAnalysis.recommendations ?? "",
				} as JsonValue,
			} as any);
		}

		return {
			...latestAttempt,
			ai_feedback: aiFeedback,
			ai_analysis: {
				strengths: aiAnalysis.strengths,
				weaknesses: aiAnalysis.weaknesses,
				recommendations: aiAnalysis.recommendations ?? "",
			},
			answers,
			assessment,
		} as any;
	}

	public async getAssessmentResult(
		assessmentId: string,
		studentId: string,
	): Promise<AssessmentAttemptWithAnswers | null> {
		await this.getOwnedAssessmentOrThrow(assessmentId, studentId);

		const attempt = (await AssessmentAttemptModel.findOne({
			assessment_id: assessmentId,
			student_id: studentId,
			status: "graded",
		})
			.sort({ updatedAt: -1 })
			.exec()) as any;

		if (!attempt) {
			return null;
		}

		const answers = await this.answerRepo.findByAttemptId(attempt.id!);

		return {
			...attempt,
			answers,
		} as any;
	}

	private async detectAssessmentAnomalies(input: {
		studentId: string;
		assessmentId: string;
		completedAttempt: AssessmentAttempt;
		finalAnswers: AssessmentAnswer[];
	}): Promise<void> {
		try {
			const previousAttempts = await AssessmentAttemptModel.find({
				student_id: input.studentId,
				status: "graded",
				_id: { $ne: input.completedAttempt.id },
			})
				.sort({ submitted_at: -1, updatedAt: -1 })
				.limit(5)
				.lean()
				.exec();

			await assessmentAnomalyDetectorService.detect({
				source: "assessment_attempt",
				studentId: input.studentId,
				sourceId: input.completedAttempt.id!,
				attempt: {
					id: input.completedAttempt.id!,
					assessment_id: input.assessmentId,
					student_id: input.studentId,
					started_at: input.completedAttempt.started_at,
					submitted_at: input.completedAttempt.submitted_at,
					total_score: Number(input.completedAttempt.total_score ?? 0),
					max_score: Number(input.completedAttempt.max_score ?? 0),
					percentage: Number(input.completedAttempt.percentage ?? 0),
					status: input.completedAttempt.status,
				},
				answers: input.finalAnswers.map((answer: any) => ({
					id: answer.id,
					question_id: String(answer.question_id),
					student_answer: answer.student_answer,
					selected_choice: answer.selected_choice,
					score:
						answer.score === null || answer.score === undefined
							? null
							: Number(answer.score),
					is_correct: answer.is_correct,
					answered_at: answer.answered_at,
					createdAt: answer.createdAt,
					updatedAt: answer.updatedAt,
				})),
				previousResults: previousAttempts.map((attempt: any) => ({
					percentage: attempt.percentage,
					total_score: attempt.total_score,
					max_score: attempt.max_score,
					submitted_at: attempt.submitted_at,
				})),
				persistSignals: true,
			});
		} catch (error) {
			console.warn("Assessment anomaly detection failed", {
				studentId: input.studentId,
				attemptId: input.completedAttempt.id,
				error,
			});
		}
	}

	private async autoClassifyAfterSubmit(input: {
		studentId: string;
		attemptId: string;
	}): Promise<ClassificationResult | null> {
		try {
			return await this.classificationService.classifyStudent(input.studentId);
		} catch (error) {
			console.warn("Assessment auto-classification failed", {
				studentId: input.studentId,
				attemptId: input.attemptId,
				error,
			});
			return null;
		}
	}

	private async updateTopicMastery(
		studentId: string,
		questions: AssessmentQuestion[],
		answers: AssessmentAnswer[],
		gradeLevel: number,
	): Promise<void> {
		const topicStats = new Map<string, { total: number; correct: number }>();
		const questionMap = new Map(
			questions.map((question) => [String(question.id), question]),
		);

		for (const answer of answers) {
			const question = questionMap.get(String(answer.question_id));

			if (!question || !question.topic) {
				continue;
			}

			const current = topicStats.get(question.topic) ?? {
				total: 0,
				correct: 0,
			};
			current.total += 1;
			current.correct += answer.is_correct ? 1 : 0;
			topicStats.set(question.topic, current);
		}

		for (const [topic, stats] of topicStats.entries()) {
			const existing = await this.topicMasteryRepo.findOne({
				student_id: studentId,
				topic,
				grade_level: gradeLevel,
			} as any);

			const totalAttempts = (existing?.total_attempts ?? 0) + stats.total;
			const correctAttempts = (existing?.correct_attempts ?? 0) + stats.correct;
			const masteryLevel =
				totalAttempts > 0
					? Number(((correctAttempts / totalAttempts) * 100).toFixed(2))
					: 0;
			const strengthLabel = this.resolveStrengthLabel(masteryLevel);

			if (existing) {
				await this.topicMasteryRepo.update(existing.id, {
					mastery_level: masteryLevel,
					total_attempts: totalAttempts,
					correct_attempts: correctAttempts,
					strength_label: strengthLabel,
					last_practiced_at: new Date().toISOString(),
				} as any);
				continue;
			}

			await this.topicMasteryRepo.create({
				student_id: studentId,
				topic,
				grade_level: gradeLevel,
				mastery_level: masteryLevel,
				total_attempts: totalAttempts,
				correct_attempts: correctAttempts,
				strength_label: strengthLabel,
				last_practiced_at: new Date().toISOString(),
			} as any);
		}
	}

	private async getStudentProfileOrThrow(
		studentId: string,
	): Promise<StudentProfile> {
		const profile = await this.studentRepo.findById(studentId);

		if (!profile) {
			throw new NotFoundError("Không tìm thấy hồ sơ học sinh");
		}

		return profile as any;
	}

	private async getOwnedAssessmentOrThrow(
		assessmentId: string,
		studentId: string,
	): Promise<Assessment> {
		const assessment = await this.assessmentRepo.findById(assessmentId);

		if (!assessment || String(assessment.student_id) !== String(studentId)) {
			throw new NotFoundError("Không tìm thấy bài đánh giá");
		}

		return assessment as any;
	}

	private async getOwnedAttemptOrThrow(
		attemptId: string,
		studentId: string,
	): Promise<AssessmentAttempt> {
		const attempt = await this.attemptRepo.findById(attemptId);

		if (!attempt || String(attempt.student_id) !== String(studentId)) {
			throw new NotFoundError("Không tìm thấy lượt làm bài đánh giá");
		}

		return attempt as any;
	}

	private mapAssessmentType(type: string): AssessmentType {
		if (type === "quiz") {
			return "lesson_quiz";
		}

		if (type === "practice") {
			return "weekly_review";
		}

		return "diagnostic";
	}

	private buildAssessmentTitle(type: string, gradeLevel: number): string {
		if (type === "practice") {
			return `Bài luyện tập lớp ${gradeLevel}`;
		}

		if (type === "quiz") {
			return `Bài kiểm tra nhanh lớp ${gradeLevel}`;
		}

		return `Bài kiểm tra đầu vào lớp ${gradeLevel}`;
	}

	private buildGeneratePrompt(input: {
		totalQuestions: number;
		gradeLevel: number;
		difficulty: string;
		topics?: string[];
		selfAssessedLevel?: string;
		schoolName?: string;
		mathAverageScore?: number;
		previousAnswers?: {
			question_text: string;
			topic: string;
			is_correct: boolean;
			difficulty: string;
		}[];
	}): string {
		const topicsText =
			input.topics && input.topics.length > 0
				? input.topics.join(", ")
				: "Tự chọn các topic nền tảng bao quát chương trình lớp đó";
		const selfAssessmentText = input.selfAssessedLevel
			? `Mức tự đánh giá của học sinh: ${input.selfAssessedLevel}.`
			: "Không có thông tin tự đánh giá.";
		const schoolText = input.schoolName ? `Trường: ${input.schoolName}.` : "";
		const scoreText =
			input.mathAverageScore !== undefined
				? `Điểm trung bình toán cuối kỳ: ${input.mathAverageScore}.`
				: "";

		// Adaptive: phân tích kết quả các câu trước để điều chỉnh
		let adaptiveContext = "";
		if (input.previousAnswers && input.previousAnswers.length > 0) {
			const correct = input.previousAnswers.filter((a) => a.is_correct).length;
			const total = input.previousAnswers.length;
			const weakTopics = [
				...new Set(
					input.previousAnswers
						.filter((a) => !a.is_correct)
						.map((a) => a.topic),
				),
			];
			const strongTopics = [
				...new Set(
					input.previousAnswers.filter((a) => a.is_correct).map((a) => a.topic),
				),
			];

			adaptiveContext = [
				"",
				"THÔNG TIN TỪ CÁC CÂU ĐÃ LÀM:",
				`- Đã trả lời: ${total} câu, đúng ${correct}/${total}`,
				`- Chủ đề yếu (trả lời sai): ${weakTopics.length > 0 ? weakTopics.join(", ") : "Không có"}`,
				`- Chủ đề mạnh (trả lời đúng): ${strongTopics.length > 0 ? strongTopics.join(", ") : "Không có"}`,
				"",
				"YÊU CẦU ADAPTIVE:",
				"- Nếu học sinh sai nhiều ở topic nào → thêm 1-2 câu ở topic đó nhưng DỄ hơn để xác nhận mức thật",
				"- Nếu học sinh đúng hết ở mức easy → tăng lên medium/hard để tìm giới hạn",
				"- KHÔNG lặp lại câu đã hỏi",
				"- Tập trung vào các topic CHƯA được kiểm tra",
			].join("\n");
		}

		return [
			`Tạo ${input.totalQuestions} câu hỏi toán cho học sinh lớp ${input.gradeLevel}.`,
			schoolText,
			scoreText,
			`Mức độ: ${input.difficulty} (nếu mixed thì phân bố 30% easy, 40% medium, 30% hard).`,
			"Phân bố loại câu hỏi: 60% multiple_choice, 25% short_answer, 15% essay.",
			`Topic ưu tiên: ${topicsText}.`,
			selfAssessmentText,
			"",
			"QUY CHUẨN KÝ HIỆU TOÁN HỌC:",
			"- Viết công thức bằng LaTeX inline trong chuỗi JSON, ví dụ: \\(x^2\\), \\(\\frac{3}{4}\\), \\(\\sqrt{x}\\), \\(\\le\\).",
			"- Không dùng dạng thô như x^2, 3/4, sqrt(x) trong question_text, correct_answer hoặc explanation nếu có thể viết bằng LaTeX.",
			"- Đảm bảo JSON vẫn hợp lệ: escape dấu backslash đúng chuẩn JSON khi cần.",
			"",
			"MỤC TIÊU ĐỀ KIỂM TRA ĐẦU VÀO:",
			"- Phải bao quát đúng các chủ đề NỀN TẢNG của chương trình Toán Việt Nam ở chính lớp được yêu cầu.",
			"- Không tạo bài quá thấp cấp: nếu lớp 10 trở lên, không dùng phép tính số học/phân số tiểu học hoặc kiến thức lớp 5-7 làm nội dung chính, trừ khi ghi rõ là câu chẩn đoán mất gốc và chỉ chiếm tối đa 10% đề.",
			"- Với lớp 10, ưu tiên đại số, hàm số, phương trình/bất phương trình, hệ thức lượng, tọa độ/vectơ hoặc các chủ đề phù hợp chương trình; không chỉ hỏi cộng trừ phân số đơn giản.",
			"- Độ khó vừa sức nhưng đủ để PHÂN LOẠI học lực (yeu/trung_binh/kha/gioi).",
			"- Bắt đầu từ câu dễ, tăng dần độ khó → giúp học sinh tự tin và phân loại chính xác.",
			"- Mỗi câu hỏi phải test 1 kỹ năng/kiến thức rõ ràng và có topic khớp cấp lớp.",
			"- Nếu cần kiểm tra kiến thức lớp dưới, topic phải ghi rõ là 'Ôn nền tảng lớp ...' và explanation phải nêu vì sao cần ôn.",
			adaptiveContext,
			"",
			"Mỗi câu hỏi phải có topic rõ ràng, đáp án đúng và giải thích cực kỳ ngắn gọn (tối đa 1-2 câu ngắn). Đề bài viết cô đọng, dễ hiểu.",
			"Câu multiple_choice phải có đúng 4 lựa chọn dạng mảng chuỗi.",
			"Trả về JSON array với các field: question_number, question_type, question_text, options, correct_answer, explanation, difficulty_level, topic, points.",
			"Không trả về markdown.",
		]
			.filter(Boolean)
			.join("\n");
	}

	private normalizeGeneratedQuestions(
		questions: GeneratedQuestion[],
		expectedTotal: number,
	): GeneratedQuestion[] {
		if (!Array.isArray(questions) || questions.length === 0) {
			throw new ValidationError("AI không tạo được danh sách câu hỏi hợp lệ");
		}

		return questions.slice(0, expectedTotal).map((question, index) => {
			if (
				!question.question_text ||
				!question.question_type ||
				!question.topic
			) {
				throw new ValidationError("AI trả về câu hỏi thiếu thông tin bắt buộc");
			}

			return {
				question_number: question.question_number || index + 1,
				question_type: question.question_type,
				question_text: question.question_text.trim(),
				options:
					question.question_type === "multiple_choice"
						? (question.options ?? []).slice(0, 4)
						: null,
				correct_answer: question.correct_answer?.trim() ?? null,
				explanation: question.explanation?.trim() ?? null,
				difficulty_level: question.difficulty_level ?? "medium",
				topic: question.topic.trim(),
				points:
					question.points ?? this.defaultQuestionScore(question.question_type),
			};
		});
	}

	private gradeMultipleChoice(
		question: AssessmentQuestion,
		studentAnswer: string,
	): AIGradingResult {
		if (question.question_type !== "multiple_choice") {
			return {
				points_earned: 0,
				is_correct: false,
				feedback: "",
			};
		}

		const normalizedStudentAnswer = this.normalizeAnswer(studentAnswer);
		const normalizedCorrectAnswer = this.normalizeAnswer(
			question.correct_answer ?? "",
		);
		const isCorrect =
			normalizedStudentAnswer.length > 0 &&
			normalizedStudentAnswer === normalizedCorrectAnswer;

		return {
			points_earned: isCorrect ? Number(question.score ?? 0) : 0,
			is_correct: isCorrect,
			feedback: isCorrect
				? "Đúng"
				: `Đáp án đúng là ${question.correct_answer ?? ""}`,
		};
	}

	private async gradeOpenQuestion(
		question: AssessmentQuestion,
		studentAnswer: string,
	): Promise<AIGradingResult> {
		if (!studentAnswer.trim()) {
			return {
				points_earned: 0,
				is_correct: false,
				feedback: "Chưa có câu trả lời cho câu hỏi này",
			};
		}

		const prompt = [
			"Bạn là giáo viên toán. Chấm điểm câu trả lời sau.",
			`Câu hỏi: ${question.question_text}`,
			`Đáp án đúng: ${question.correct_answer ?? "Không có đáp án mẫu cố định"}`,
			`Câu trả lời của học sinh: ${studentAnswer}`,
			`Điểm tối đa: ${Number(question.score ?? 0)}`,
			'Trả về JSON: {"points_earned": number, "is_correct": boolean, "feedback": "..."}',
		].join("\n");

		const result = await aiService.generateJSON<AIGradingResult>(
			"Bạn là giáo viên toán, chấm điểm công bằng, ngắn gọn và chính xác.",
			prompt,
			{ temperature: 0.2 },
		);

		const maxScore = Number(question.score ?? 0);
		const boundedScore = Math.min(
			Math.max(Number(result.data.points_earned ?? 0), 0),
			maxScore,
		);

		return {
			points_earned: boundedScore,
			is_correct: Boolean(result.data.is_correct),
			feedback: result.data.feedback ?? "",
		};
	}

	private async analyzePerformance(
		gradeLevel: number,
		questions: AssessmentQuestion[],
		answers: AssessmentAnswer[],
	): Promise<AIAnalysisResult> {
		const topicPerformance = this.collectTopicPerformance(questions, answers);
		const deterministicAnalysis = this.buildDeterministicAnalysis(
			gradeLevel,
			topicPerformance,
			answers.length,
		);
		const summary = topicPerformance
			.map((stats) => {
				return `- ${stats.topic}: ${stats.correct}/${stats.total} câu đúng, ${stats.score}/${stats.maxScore} điểm (${stats.percentage.toFixed(2)}%)`;
			})
			.join("\n");

		if (!summary) {
			return deterministicAnalysis;
		}

		const prompt = [
			`Phân tích kết quả kiểm tra đầu vào của học sinh lớp ${gradeLevel}.`,
			"Kết quả theo topic:",
			summary,
			'Trả về JSON tiếng Việt: {"overall_feedback":"...", "strengths":["..."], "weaknesses":["..."], "recommendations":"..."}',
			'strengths và weaknesses phải là nhận xét cụ thể theo chủ đề, không dùng tiếng Anh.',
		].join("\n");

		try {
			const result = await aiService.generateJSON<AIAnalysisResult>(
				"Bạn là giáo viên toán đang phân tích điểm mạnh và điểm yếu của học sinh. Chỉ trả lời bằng tiếng Việt.",
				prompt,
				{ temperature: 0.3 },
			);

			const strengths = this.cleanAnalysisList(result.data.strengths);
			const weaknesses = this.cleanAnalysisList(result.data.weaknesses);

			return {
				overall_feedback:
					this.cleanAnalysisText(result.data.overall_feedback) ||
					deterministicAnalysis.overall_feedback,
				strengths: strengths.length > 0 ? strengths : deterministicAnalysis.strengths,
				weaknesses: weaknesses.length > 0 ? weaknesses : deterministicAnalysis.weaknesses,
				recommendations:
					this.cleanAnalysisText(result.data.recommendations) ||
					deterministicAnalysis.recommendations,
			};
		} catch {
			return deterministicAnalysis;
		}
	}

	private collectTopicPerformance(
		questions: AssessmentQuestion[],
		answers: AssessmentAnswer[],
	): TopicPerformance[] {
		const questionMap = new Map(
			questions.map((question) => [String(question.id), question]),
		);
		const topicStats = new Map<
			string,
			{ correct: number; total: number; score: number; maxScore: number }
		>();

		for (const answer of answers) {
			const question = questionMap.get(String(answer.question_id));

			if (!question) {
				continue;
			}

			const topic = (question.topic || "Chủ đề chưa phân loại").trim();
			const current = topicStats.get(topic) ?? {
				correct: 0,
				total: 0,
				score: 0,
				maxScore: 0,
			};
			current.total += 1;
			current.correct += answer.is_correct ? 1 : 0;
			current.score += Number(answer.score ?? 0);
			current.maxScore += Number(question.score ?? 0);
			topicStats.set(topic, current);
		}

		return Array.from(topicStats.entries())
			.map(([topic, stats]) => ({
				topic,
				...stats,
				percentage: stats.maxScore > 0 ? (stats.score / stats.maxScore) * 100 : 0,
			}))
			.sort((a, b) => b.percentage - a.percentage || b.total - a.total);
	}

	private buildDeterministicAnalysis(
		gradeLevel: number | null | undefined,
		topicPerformance: TopicPerformance[],
		answerCount: number,
	): AIAnalysisResult {
		if (topicPerformance.length === 0 || answerCount === 0) {
			return {
				overall_feedback: "Chưa có đủ dữ liệu để phân tích kết quả.",
				strengths: ["Đã bắt đầu bài đánh giá, đây là dữ liệu đầu vào để cá nhân hóa lộ trình học."],
				weaknesses: ["Cần hoàn thành thêm câu hỏi để hệ thống xác định chính xác phần kiến thức cần củng cố."],
				recommendations: "Hãy làm thêm bài đánh giá hoặc trả lời đầy đủ hơn để có nhận xét chính xác.",
			};
		}

		const totalScore = topicPerformance.reduce((sum, item) => sum + item.score, 0);
		const maxScore = topicPerformance.reduce((sum, item) => sum + item.maxScore, 0);
		const overallPercentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
		const gradeLabel =
			typeof gradeLevel === "number" && Number.isFinite(gradeLevel) && gradeLevel > 0
				? `lớp ${gradeLevel}`
				: "lớp hiện tại";
		const strongTopics = topicPerformance.filter((item) => item.percentage >= 70);
		const weakTopics = topicPerformance.filter((item) => item.percentage < 70);
		const strengths =
			strongTopics.length > 0
				? strongTopics.map((item) => this.formatStrength(item))
				: [
						`Đã hoàn thành ${answerCount} câu trong bài đánh giá ${gradeLabel}, đủ dữ liệu để bắt đầu xây lộ trình học cá nhân hóa.`,
					];
		const weaknesses =
			weakTopics.length > 0
				? weakTopics.map((item) => this.formatWeakness(item))
				: ["Chưa ghi nhận điểm yếu rõ ràng trong các chủ đề đã làm."];
		const weakTopicNames = weakTopics.map((item) => item.topic);

		return {
			overall_feedback:
				overallPercentage >= 80
					? "Kết quả đầu vào tốt. Học sinh có nền tảng tương đối vững ở các chủ đề đã làm."
					: overallPercentage >= 50
						? "Học sinh đã có nền tảng ban đầu nhưng vẫn cần luyện thêm ở một số chủ đề."
						: "Học sinh cần củng cố lại kiến thức nền tảng trước khi học nội dung mới.",
			strengths,
			weaknesses,
			recommendations:
				weakTopicNames.length > 0
					? `Ưu tiên ôn lại: ${weakTopicNames.join(", ")}. Sau mỗi bài nên làm bài tập ngắn để kiểm tra mức độ hiểu.`
					: "Tiếp tục học theo lộ trình cá nhân hóa và tăng dần độ khó.",
		};
	}

	private formatStrength(item: TopicPerformance): string {
		return `${item.topic}: làm đúng ${item.correct}/${item.total} câu, đạt ${this.formatScore(item.score)}/${this.formatScore(item.maxScore)} điểm (${Math.round(item.percentage)}%).`;
	}

	private formatWeakness(item: TopicPerformance): string {
		return `${item.topic}: cần củng cố thêm vì mới đạt ${this.formatScore(item.score)}/${this.formatScore(item.maxScore)} điểm (${Math.round(item.percentage)}%).`;
	}

	private formatScore(value: number): string {
		return Number.isInteger(value) ? String(value) : value.toFixed(1);
	}

	private cleanAnalysisList(value: unknown): string[] {
		return Array.isArray(value)
			? value
					.map((item) => this.cleanAnalysisText(item))
					.filter((item): item is string => Boolean(item))
			: [];
	}

	private cleanAnalysisText(value: unknown): string {
		return typeof value === "string" ? value.trim() : "";
	}

	private parseAnalysis(value: unknown): AIAnalysisResult {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			return {
				overall_feedback: "",
				strengths: [],
				weaknesses: [],
				recommendations: "",
			};
		}

		const raw = value as Record<string, unknown>;
		return {
			overall_feedback: this.cleanAnalysisText(raw.overall_feedback),
			strengths: this.cleanAnalysisList(raw.strengths),
			weaknesses: this.cleanAnalysisList(raw.weaknesses),
			recommendations: this.cleanAnalysisText(raw.recommendations),
		};
	}

	private combineFeedback(analysis: AIAnalysisResult): string {
		const parts = [analysis.overall_feedback];

		if (analysis.recommendations) {
			parts.push(`Khuyến nghị: ${analysis.recommendations}`);
		}

		return parts.filter(Boolean).join("\n\n");
	}

	private normalizeAnswer(value: string): string {
		return value.trim().toLowerCase().replace(/\s+/g, " ");
	}

	private defaultQuestionScore(
		questionType: GeneratedQuestion["question_type"],
	): number {
		if (questionType === "essay") {
			return 2;
		}

		return 1;
	}

	private resolveStrengthLabel(
		masteryLevel: number,
	): TopicMastery["strength_label"] {
		if (masteryLevel >= 90) {
			return "mastered";
		}

		if (masteryLevel >= 75) {
			return "strong";
		}

		if (masteryLevel >= 50) {
			return "average";
		}

		return "weak";
	}
}

export const assessmentService = new AssessmentService();

export default assessmentService;
