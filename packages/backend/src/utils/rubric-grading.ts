import { ValidationError } from './errors';
import { roundPoints } from './scoring';
import type { MathRubricCriterion, MathRubricLevel } from '../models/content-library.model';

const SCORE_TOLERANCE = 0.000001;

export interface RubricScoreInput {
  criterion_key: string;
  points?: number;
  level_label?: string;
}

export interface RubricCriterionScoreResult {
  criterion_key: string;
  earned_points: number;
  max_points: number;
  level_label?: string;
}

export interface RubricScoreResult {
  earned_points: number;
  total_points: number;
  percentage: number;
  criteria: RubricCriterionScoreResult[];
}

export interface RubricContractLike {
  total_points: number;
  criteria: MathRubricCriterion[];
}

function validateCriterionDefinition(criterion: MathRubricCriterion): void {
  if (!criterion.key?.trim()) {
    throw new ValidationError('Rubric criterion key is required');
  }

  if (!Number.isFinite(criterion.max_points) || criterion.max_points < 0) {
    throw new ValidationError(`Rubric criterion ${criterion.key} max points must be zero or positive`);
  }

  if (criterion.scoring === 'levels') {
    if (!criterion.levels || criterion.levels.length === 0) {
      throw new ValidationError(`Rubric criterion ${criterion.key} requires levels`);
    }

    criterion.levels.forEach((level) => validateRubricLevel(criterion.key, criterion.max_points, level));
  }
}

function validateRubricLevel(criterionKey: string, maxPoints: number, level: MathRubricLevel): void {
  if (!level.label?.trim()) {
    throw new ValidationError(`Rubric criterion ${criterionKey} level label is required`);
  }

  if (!Number.isFinite(level.points) || level.points < 0 || level.points - maxPoints > SCORE_TOLERANCE) {
    throw new ValidationError(`Rubric criterion ${criterionKey} level points must be between 0 and max points`);
  }
}

export function validateRubricContract(contract: RubricContractLike): number {
  if (!Number.isFinite(contract.total_points) || contract.total_points <= 0) {
    throw new ValidationError('Rubric total points must be positive');
  }

  if (!Array.isArray(contract.criteria) || contract.criteria.length === 0) {
    throw new ValidationError('Rubric criteria are required');
  }

  const seenKeys = new Set<string>();
  const criteriaTotal = contract.criteria.reduce((sum, criterion) => {
    validateCriterionDefinition(criterion);
    const normalizedKey = criterion.key.trim().toLowerCase();
    if (seenKeys.has(normalizedKey)) {
      throw new ValidationError(`Rubric criterion ${criterion.key} is duplicated`);
    }
    seenKeys.add(normalizedKey);
    return sum + criterion.max_points;
  }, 0);

  const roundedCriteriaTotal = roundPoints(criteriaTotal);
  const roundedContractTotal = roundPoints(contract.total_points);

  if (Math.abs(roundedCriteriaTotal - roundedContractTotal) > SCORE_TOLERANCE) {
    throw new ValidationError('Rubric total points must equal sum of criterion max points');
  }

  return roundedContractTotal;
}

export function calculateRubricScore(contract: RubricContractLike, scores: RubricScoreInput[]): RubricScoreResult {
  const totalPoints = validateRubricContract(contract);
  const scoreByKey = new Map(scores.map((score) => [score.criterion_key.trim().toLowerCase(), score]));

  const criteria = contract.criteria.map((criterion) => {
    const score = scoreByKey.get(criterion.key.trim().toLowerCase());
    if (!score) {
      throw new ValidationError(`Rubric score for criterion ${criterion.key} is required`);
    }

    const earnedPoints = resolveCriterionScore(criterion, score);
    return {
      criterion_key: criterion.key,
      earned_points: earnedPoints,
      max_points: roundPoints(criterion.max_points),
      level_label: score.level_label,
    };
  });

  const earnedPoints = roundPoints(criteria.reduce((sum, criterion) => sum + criterion.earned_points, 0));
  return {
    earned_points: earnedPoints,
    total_points: totalPoints,
    percentage: totalPoints === 0 ? 0 : roundPoints((earnedPoints / totalPoints) * 100),
    criteria,
  };
}

function resolveCriterionScore(criterion: MathRubricCriterion, score: RubricScoreInput): number {
  if (criterion.scoring === 'levels') {
    const level = criterion.levels?.find(
      (candidate) => candidate.label.trim().toLowerCase() === score.level_label?.trim().toLowerCase()
    );

    if (!level) {
      throw new ValidationError(`Rubric criterion ${criterion.key} requires a valid level score`);
    }

    return roundPoints(level.points);
  }

  if (!Number.isFinite(score.points) || score.points === undefined || score.points < 0 || score.points - criterion.max_points > SCORE_TOLERANCE) {
    throw new ValidationError(`Rubric criterion ${criterion.key} score must be between 0 and max points`);
  }

  return roundPoints(score.points);
}
