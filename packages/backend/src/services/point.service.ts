import { type ClientSession, Types } from "mongoose";
import {
	type IPointLedger,
	type PointLedgerCreateInput,
	PointLedgerRepository,
	type PointLedgerSourceType,
} from "../models/point-ledger.model";
import { ValidationError } from "../utils/errors";
import {
	calculatePercentage,
	calculateRewardPoints,
	roundPoints,
	validateEarnedPoints,
} from "../utils/scoring";

export interface RecordAssessmentPointsInput {
	student_id: string;
	assessment_id: string;
	attempt_id: string;
	earned_points: number;
	max_points: number;
	competency_score?: number;
	difficulty?: string | null;
	reason?: string;
	metadata?: Record<string, unknown>;
}

export interface RecordLessonPointsInput {
	student_id: string;
	lesson_id: string;
	attempt_id: string;
	earned_points: number;
	max_points: number;
	competency_score?: number;
	reason?: string;
	metadata?: Record<string, unknown>;
}

export interface RecordTeacherAssignmentPointsInput {
	student_id: string;
	assignment_id: string;
	submission_id: string;
	earned_points: number;
	max_points: number;
	competency_score?: number;
	reason?: string;
	metadata?: Record<string, unknown>;
	created_by?: string | null;
}

export interface RecordManualAdjustmentInput {
	student_id: string;
	reward_points: number;
	reason: string;
	created_by: string;
	metadata?: Record<string, unknown>;
}

export interface PointSourceSummary {
	earned_points: number;
	available_points: number;
	reward_points: number;
	competency_score: number;
	entries: number;
}

export interface StudentPointSummary {
	total_earned_points: number;
	total_available_points: number;
	reward_points: number;
	academic_percentage: number;
	competency_score: number;
	by_source_type: Partial<Record<PointLedgerSourceType, PointSourceSummary>>;
	gamification: StudentGamificationSummary;
}

export interface StudentGamificationBadge {
	key: string;
	title: string;
	description: string;
	unlocked: boolean;
	progress: {
		current: number;
		target: number;
		percentage: number;
	};
}

export interface StudentGamificationSummary {
	level: number;
	level_title: string;
	reward_points: number;
	next_level_reward_points: number | null;
	points_to_next_level: number;
	progress_percentage: number;
	badges: StudentGamificationBadge[];
}

const GAMIFICATION_LEVELS = [
	{ minRewardPoints: 0, title: "Khởi động" },
	{ minRewardPoints: 50, title: "Bền bỉ" },
	{ minRewardPoints: 150, title: "Tăng tốc" },
	{ minRewardPoints: 300, title: "Chinh phục" },
	{ minRewardPoints: 600, title: "Bậc thầy" },
] as const;

export interface StudentPointHeaderSummary {
	reward_points: number;
	academic_percentage: number;
	competency_score: number;
}

export interface StudentPointHistoryResult {
	summary: StudentPointSummary;
	history: IPointLedger[];
}

export class PointService {
	private readonly ledgerRepo: PointLedgerRepository;

	constructor(ledgerRepo = new PointLedgerRepository()) {
		this.ledgerRepo = ledgerRepo;
	}

	private normalizeRequiredId(value: string, field: string): string {
		const normalized = String(value ?? "").trim();
		if (!normalized) {
			throw new ValidationError(`${field} is required`);
		}
		return normalized;
	}

	private normalizeRequiredObjectId(
		value: string,
		field: string,
	): Types.ObjectId {
		const normalized = this.normalizeRequiredId(value, field);
		if (!Types.ObjectId.isValid(normalized)) {
			throw new ValidationError(`${field} must be a valid ObjectId`);
		}
		return new Types.ObjectId(normalized);
	}

	private buildAttemptLedgerInsert(input: {
		student_id: string;
		source_type: Extract<
			PointLedgerSourceType,
			"assessment" | "lesson" | "teacher_assignment"
		>;
		source_id: string;
		attempt_id: string;
		earned_points: number;
		max_points: number;
		competency_score?: number;
		difficulty?: string | null;
		reason: string;
		metadata?: Record<string, unknown>;
		created_by?: string | null;
	}): PointLedgerCreateInput {
		const sourceId = this.normalizeRequiredId(input.source_id, "Source id");
		const attemptId = this.normalizeRequiredId(input.attempt_id, "Attempt id");

		const earnedPoints = validateEarnedPoints(
			input.earned_points,
			input.max_points,
		);
		const maxPoints = roundPoints(input.max_points);
		const competencyScore = roundPoints(
			input.competency_score ?? calculatePercentage(earnedPoints, maxPoints),
		);
		const rewardPoints = calculateRewardPoints(
			earnedPoints,
			maxPoints,
			input.difficulty,
		);

		return {
			student_id: this.normalizeRequiredObjectId(
				input.student_id,
				"Student id",
			),
			source_type: input.source_type,
			source_id: sourceId,
			attempt_id: attemptId,
			earned_points: earnedPoints,
			max_points: maxPoints,
			reward_points: rewardPoints,
			competency_score: competencyScore,
			reason: input.reason,
			metadata: input.metadata ?? null,
			created_by:
				input.created_by === undefined ? null : String(input.created_by),
		};
	}

	public async recordAssessmentResult(
		input: RecordAssessmentPointsInput,
		session?: ClientSession,
	): Promise<IPointLedger> {
		const studentId = this.normalizeRequiredId(input.student_id, "Student id");
		const insert = this.buildAttemptLedgerInsert({
			student_id: studentId,
			source_type: "assessment",
			source_id: input.assessment_id,
			attempt_id: input.attempt_id,
			earned_points: input.earned_points,
			max_points: input.max_points,
			competency_score: input.competency_score,
			difficulty: input.difficulty,
			reason: input.reason ?? "Assessment graded",
			metadata: input.metadata ?? undefined,
		});

		return this.ledgerRepo.upsertAssessmentLedger(
			{
				student_id: studentId,
				source_type: "assessment",
				source_id: insert.source_id,
				attempt_id: insert.attempt_id ?? "",
			},
			insert,
			session,
		);
	}

	public async recordLessonResult(
		input: RecordLessonPointsInput,
		session?: ClientSession,
	): Promise<IPointLedger> {
		const studentId = this.normalizeRequiredId(input.student_id, "Student id");
		const insert = this.buildAttemptLedgerInsert({
			student_id: studentId,
			source_type: "lesson",
			source_id: input.lesson_id,
			attempt_id: input.attempt_id,
			earned_points: input.earned_points,
			max_points: input.max_points,
			competency_score: input.competency_score,
			reason: input.reason ?? "Lesson result submitted",
			metadata: input.metadata ?? undefined,
		});

		return this.ledgerRepo.upsertLessonLedger(
			{
				student_id: studentId,
				source_type: "lesson",
				source_id: insert.source_id,
				attempt_id: insert.attempt_id ?? "",
			},
			insert,
			session,
		);
	}

	public async recordTeacherAssignmentResult(
		input: RecordTeacherAssignmentPointsInput,
		session?: ClientSession,
	): Promise<IPointLedger> {
		const studentId = this.normalizeRequiredId(input.student_id, "Student id");
		const insert = this.buildAttemptLedgerInsert({
			student_id: studentId,
			source_type: "teacher_assignment",
			source_id: input.assignment_id,
			attempt_id: input.submission_id,
			earned_points: input.earned_points,
			max_points: input.max_points,
			competency_score: input.competency_score,
			reason: input.reason ?? "Teacher assignment graded",
			metadata: input.metadata ?? undefined,
			created_by: input.created_by ?? null,
		});

		return this.ledgerRepo.updateTeacherAssignmentLedger(
			{
				student_id: studentId,
				source_type: "teacher_assignment",
				source_id: insert.source_id,
				attempt_id: insert.attempt_id ?? "",
			},
			insert,
			session,
		);
	}

	public async recordManualAdjustment(
		input: RecordManualAdjustmentInput,
		session?: ClientSession,
	): Promise<IPointLedger> {
		const rewardPoints = roundPoints(input.reward_points);
		const reason = typeof input.reason === "string" ? input.reason.trim() : "";
		const createdBy = String(input.created_by ?? "").trim();

		if (rewardPoints === 0) {
			throw new ValidationError(
				"Manual adjustment reward points must be non-zero",
			);
		}
		if (!reason) {
			throw new ValidationError("Manual adjustment reason is required");
		}
		if (!createdBy) {
			throw new ValidationError("Manual adjustment creator is required");
		}

		return this.ledgerRepo.create(
			{
				student_id: this.normalizeRequiredObjectId(
					input.student_id,
					"Student id",
				),
				source_type: "manual_adjustment",
				source_id: "manual_adjustment",
				attempt_id: null,
				earned_points: 0,
				max_points: 0,
				reward_points: rewardPoints,
				competency_score: 0,
				reason,
				metadata: input.metadata ?? null,
				created_by: createdBy,
			},
			session,
		);
	}

	public async getStudentPointHistory(
		studentId: string,
	): Promise<StudentPointHistoryResult> {
		const history = await this.ledgerRepo.findByStudentId(studentId);
		return {
			summary: this.buildSummary(history),
			history,
		};
	}

	public async getStudentPointSummary(
		studentId: string,
	): Promise<StudentPointSummary> {
		const history = await this.ledgerRepo.findByStudentId(studentId);
		return this.buildSummary(history);
	}

	public async getStudentPointHeaderSummary(
		studentId: string,
	): Promise<StudentPointHeaderSummary> {
		const { reward_points, academic_percentage, competency_score } =
			await this.getStudentPointSummary(studentId);

		return {
			reward_points,
			academic_percentage,
			competency_score,
		};
	}

	private buildSummary(entries: IPointLedger[]): StudentPointSummary {
		const summary: StudentPointSummary = {
			total_earned_points: 0,
			total_available_points: 0,
			reward_points: 0,
			academic_percentage: 0,
			competency_score: 0,
			by_source_type: {},
			gamification: {
				level: 1,
				level_title: GAMIFICATION_LEVELS[0].title,
				reward_points: 0,
				next_level_reward_points: GAMIFICATION_LEVELS[1].minRewardPoints,
				points_to_next_level: GAMIFICATION_LEVELS[1].minRewardPoints,
				progress_percentage: 0,
				badges: [],
			},
		};
		const sourceCompetencyWeights = new Map<
			PointLedgerSourceType,
			{ weightedSum: number; totalWeight: number }
		>();
		let totalCompetencyWeightedSum = 0;
		let totalCompetencyWeight = 0;

		for (const entry of entries) {
			const sourceType = entry.source_type;
			const earnedPoints = Number(entry.earned_points ?? 0);
			const maxPoints = Number(entry.max_points ?? 0);
			const rewardPoints = Number(entry.reward_points ?? 0);
			const competencyScore = Number(entry.competency_score);
			const sourceSummary = summary.by_source_type[sourceType] ?? {
				earned_points: 0,
				available_points: 0,
				reward_points: 0,
				competency_score: 0,
				entries: 0,
			};

			sourceSummary.earned_points += earnedPoints;
			sourceSummary.available_points += maxPoints;
			sourceSummary.reward_points += rewardPoints;
			sourceSummary.entries += 1;
			summary.by_source_type[sourceType] = sourceSummary;

			if (maxPoints > 0 && Number.isFinite(competencyScore)) {
				const sourceCompetencyWeight = sourceCompetencyWeights.get(
					sourceType,
				) ?? {
					weightedSum: 0,
					totalWeight: 0,
				};
				sourceCompetencyWeight.weightedSum += competencyScore * maxPoints;
				sourceCompetencyWeight.totalWeight += maxPoints;
				sourceCompetencyWeights.set(sourceType, sourceCompetencyWeight);

				totalCompetencyWeightedSum += competencyScore * maxPoints;
				totalCompetencyWeight += maxPoints;
			}

			summary.total_earned_points += earnedPoints;
			summary.total_available_points += maxPoints;
			summary.reward_points += rewardPoints;
		}

		summary.total_earned_points = roundPoints(summary.total_earned_points);
		summary.total_available_points = roundPoints(
			summary.total_available_points,
		);
		summary.reward_points = roundPoints(summary.reward_points);
		summary.academic_percentage = calculatePercentage(
			summary.total_earned_points,
			summary.total_available_points,
		);
		summary.competency_score =
			totalCompetencyWeight > 0
				? roundPoints(totalCompetencyWeightedSum / totalCompetencyWeight)
				: summary.academic_percentage;

		for (const [sourceType, sourceSummary] of Object.entries(
			summary.by_source_type,
		) as Array<[PointLedgerSourceType, PointSourceSummary]>) {
			sourceSummary.earned_points = roundPoints(sourceSummary.earned_points);
			sourceSummary.available_points = roundPoints(
				sourceSummary.available_points,
			);
			sourceSummary.reward_points = roundPoints(sourceSummary.reward_points);

			const sourceCompetencyWeight = sourceCompetencyWeights.get(sourceType);
			sourceSummary.competency_score = sourceCompetencyWeight?.totalWeight
				? roundPoints(
						sourceCompetencyWeight.weightedSum /
							sourceCompetencyWeight.totalWeight,
					)
				: calculatePercentage(
						sourceSummary.earned_points,
						sourceSummary.available_points,
					);
		}

		summary.gamification = this.buildGamification(summary);

		return summary;
	}

	private buildGamification(
		summary: Omit<StudentPointSummary, "gamification">,
	): StudentGamificationSummary {
		const rewardPoints = Math.max(roundPoints(summary.reward_points), 0);
		const levelIndex = GAMIFICATION_LEVELS.reduce(
			(currentIndex, level, index) => {
				return rewardPoints >= level.minRewardPoints ? index : currentIndex;
			},
			0,
		);
		const currentLevel = GAMIFICATION_LEVELS[levelIndex];
		const nextLevel = GAMIFICATION_LEVELS[levelIndex + 1] ?? null;
		const currentLevelFloor = currentLevel.minRewardPoints;
		const levelSpan = nextLevel
			? nextLevel.minRewardPoints - currentLevelFloor
			: Math.max(rewardPoints - currentLevelFloor, 1);
		const levelProgress = nextLevel
			? calculatePercentage(rewardPoints - currentLevelFloor, levelSpan)
			: 100;

		return {
			level: levelIndex + 1,
			level_title: currentLevel.title,
			reward_points: rewardPoints,
			next_level_reward_points: nextLevel?.minRewardPoints ?? null,
			points_to_next_level: nextLevel
				? Math.max(roundPoints(nextLevel.minRewardPoints - rewardPoints), 0)
				: 0,
			progress_percentage: levelProgress,
			badges: [
				this.buildBadge(
					"first_points",
					"Điểm đầu tiên",
					"Nhận điểm thưởng đầu tiên từ hoạt động học tập.",
					rewardPoints,
					1,
				),
				this.buildBadge(
					"lesson_momentum",
					"Đà học bài",
					"Hoàn thành 5 lượt điểm từ bài học.",
					summary.by_source_type.lesson?.entries ?? 0,
					5,
				),
				this.buildBadge(
					"assessment_starter",
					"Bắt đầu đánh giá",
					"Có ít nhất 1 lượt đánh giá được chấm điểm.",
					summary.by_source_type.assessment?.entries ?? 0,
					1,
				),
				this.buildBadge(
					"assignment_finisher",
					"Hoàn thành bài tập",
					"Có ít nhất 1 bài tập giáo viên được chấm điểm.",
					summary.by_source_type.teacher_assignment?.entries ?? 0,
					1,
				),
				this.buildBadge(
					"high_competency",
					"Năng lực nổi bật",
					"Đạt năng lực tổng hợp từ 80% trở lên.",
					summary.competency_score,
					80,
				),
			],
		};
	}

	private buildBadge(
		key: string,
		title: string,
		description: string,
		current: number,
		target: number,
	): StudentGamificationBadge {
		const normalizedCurrent = Math.max(roundPoints(current), 0);
		const normalizedTarget = Math.max(roundPoints(target), 1);
		const progressCurrent = Math.min(normalizedCurrent, normalizedTarget);

		return {
			key,
			title,
			description,
			unlocked: normalizedCurrent >= normalizedTarget,
			progress: {
				current: progressCurrent,
				target: normalizedTarget,
				percentage: Math.min(
					calculatePercentage(progressCurrent, normalizedTarget),
					100,
				),
			},
		};
	}
}

export const pointService = new PointService();

export default pointService;
