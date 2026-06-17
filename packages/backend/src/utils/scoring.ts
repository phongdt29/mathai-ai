import { ValidationError } from "./errors";

const POINT_PRECISION = 2;
const POINT_TOLERANCE = 0.000001;
const DEFAULT_DIFFICULTY_MULTIPLIER = 1;
const MAX_DIFFICULTY_MULTIPLIER = 2;

const DIFFICULTY_MULTIPLIERS: Record<string, number> = {
	easy: 1,
	basic: 1,
	medium: 1.15,
	normal: 1.15,
	hard: 1.3,
	advanced: 1.3,
	challenge: 1.5,
};

export function roundPoints(
	value: number,
	precision: number = POINT_PRECISION,
): number {
	if (!Number.isFinite(value)) {
		throw new ValidationError("Point value must be a finite number");
	}

	const factor = 10 ** precision;
	return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function validateQuestionPoints(questionPoints: number[]): number {
	if (questionPoints.length === 0) {
		throw new ValidationError("Question points are required");
	}

	const total = questionPoints.reduce((sum, point, index) => {
		if (!Number.isFinite(point) || point <= 0) {
			throw new ValidationError(
				`Question max points must be positive at index ${index}`,
			);
		}

		return sum + point;
	}, 0);

	return roundPoints(total);
}

export function validateTotalMaxPoints(
	questionPoints: number[],
	assignmentMaxPoints: number,
): number {
	if (!Number.isFinite(assignmentMaxPoints) || assignmentMaxPoints <= 0) {
		throw new ValidationError("Assignment max points must be positive");
	}

	const questionsTotal = validateQuestionPoints(questionPoints);

	if (Math.abs(questionsTotal - assignmentMaxPoints) > POINT_TOLERANCE) {
		throw new ValidationError(
			"Assignment max points must equal sum of question points",
		);
	}

	return roundPoints(assignmentMaxPoints);
}

export function validateEarnedPoints(
	earnedPoints: number,
	maxPoints: number,
): number {
	if (!Number.isFinite(maxPoints) || maxPoints < 0) {
		throw new ValidationError("Max points must be zero or positive");
	}

	if (
		!Number.isFinite(earnedPoints) ||
		earnedPoints < 0 ||
		earnedPoints - maxPoints > POINT_TOLERANCE
	) {
		throw new ValidationError("Earned points must be between 0 and max points");
	}

	return roundPoints(Math.min(earnedPoints, maxPoints));
}

export function calculatePercentage(
	earnedPoints: number,
	maxPoints: number,
): number {
	if (!Number.isFinite(maxPoints) || maxPoints < 0) {
		throw new ValidationError("Max points must be zero or positive");
	}

	if (maxPoints === 0) {
		return 0;
	}

	const validEarnedPoints = validateEarnedPoints(earnedPoints, maxPoints);
	return roundPoints((validEarnedPoints / maxPoints) * 100);
}

export function normalizeDifficultyMultiplier(
	difficulty?: string | null,
): number {
	if (!difficulty) {
		return DEFAULT_DIFFICULTY_MULTIPLIER;
	}

	const normalizedDifficulty = difficulty.trim().toLowerCase();
	const multiplier =
		DIFFICULTY_MULTIPLIERS[normalizedDifficulty] ??
		DEFAULT_DIFFICULTY_MULTIPLIER;
	return Math.min(
		Math.max(multiplier, DEFAULT_DIFFICULTY_MULTIPLIER),
		MAX_DIFFICULTY_MULTIPLIER,
	);
}

export function calculateRewardPoints(
	earnedPoints: number,
	maxPoints: number,
	difficulty?: string | null,
): number {
	const validEarnedPoints = validateEarnedPoints(earnedPoints, maxPoints);
	const multiplier = normalizeDifficultyMultiplier(difficulty);
	return roundPoints(Math.min(validEarnedPoints * multiplier, maxPoints));
}
