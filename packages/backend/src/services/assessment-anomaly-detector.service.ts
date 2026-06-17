import type { IFraudSignal } from '../models/fraud-signal.model';
import { fraudSignalService, type FraudSignalActorContextInput, type FraudSignalService } from './fraud-signal.service';

export interface AssessmentAnomalyAttemptSnapshot {
  id: string;
  assessment_id: string;
  student_id: string;
  started_at?: Date | string | null;
  submitted_at?: Date | string | null;
  total_score?: number | null;
  max_score?: number | null;
  percentage?: number | null;
  status?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface AssessmentAnomalyAnswerSnapshot {
  id?: string;
  question_id: string;
  student_answer?: string | null;
  selected_choice?: string | null;
  score?: number | null;
  is_correct?: boolean | null;
  answered_at?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface AssessmentAnomalySubmissionSnapshot {
  id: string;
  assignment_id: string;
  student_id: string;
  content?: string | null;
  score?: number | null;
  max_score?: number | null;
  submitted_at?: Date | string | null;
  graded_at?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export type AssessmentAnomalySource = 'assessment_attempt' | 'teacher_assignment_submission';

export interface AssessmentAnomalyDetectionInput {
  source: AssessmentAnomalySource;
  studentId: string;
  sourceId: string;
  attempt?: AssessmentAnomalyAttemptSnapshot | null;
  answers?: AssessmentAnomalyAnswerSnapshot[];
  submission?: AssessmentAnomalySubmissionSnapshot | null;
  peerSubmissions?: AssessmentAnomalySubmissionSnapshot[];
  previousResults?: Array<{ percentage?: number | null; total_score?: number | null; max_score?: number | null; submitted_at?: Date | string | null; graded_at?: Date | string | null }>;
  answerSaveEvents?: Array<{ question_id?: string | null; answered_at?: Date | string | null; updatedAt?: Date | string | null }>;
  actor?: FraudSignalActorContextInput | null;
  now?: Date;
  persistSignals?: boolean;
  rapidSubmissionSecondsThreshold?: number;
  scoreJumpPercentagePointsThreshold?: number;
  duplicateSimilarityThreshold?: number;
  excessiveAnswerChangesThreshold?: number;
}

export interface AssessmentAnomalyCandidate {
  signalType: 'rapid_assessment_submission' | 'abnormal_score_jump' | 'duplicate_answer_pattern' | 'excessive_answer_changes';
  riskLevel: 'informational' | 'low' | 'medium';
  confidence: number;
  evidence: Record<string, unknown>;
  explanation: string;
}

export interface AssessmentAnomalyDetectionResult {
  signals: AssessmentAnomalyCandidate[];
  createdSignals: IFraudSignal[];
}

export interface AssessmentAnomalyDetectorDependencies {
  signalService?: Pick<FraudSignalService, 'createSignal'>;
}

const DEFAULT_RAPID_SUBMISSION_SECONDS = 90;
const DEFAULT_SCORE_JUMP_POINTS = 35;
const DEFAULT_DUPLICATE_SIMILARITY = 0.92;
const DEFAULT_EXCESSIVE_CHANGES = 8;

const toDateOrNull = (value?: Date | string | null): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const round = (value: number): number => Math.round(value * 100) / 100;

const normalizeText = (value?: string | null): string =>
  (value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();

const jaccardSimilarity = (left: string, right: string): number => {
  const leftTokens = new Set(normalizeText(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeText(right).split(' ').filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 ? intersection / union : 0;
};

const resolvePercentage = (result: { percentage?: number | null; total_score?: number | null; max_score?: number | null }): number | null => {
  if (typeof result.percentage === 'number' && Number.isFinite(result.percentage)) return result.percentage;
  if (typeof result.total_score === 'number' && typeof result.max_score === 'number' && result.max_score > 0) {
    return (result.total_score / result.max_score) * 100;
  }
  return null;
};

export class AssessmentAnomalyDetectorService {
  private readonly signalService: Pick<FraudSignalService, 'createSignal'>;

  constructor(dependencies: AssessmentAnomalyDetectorDependencies = {}) {
    this.signalService = dependencies.signalService ?? fraudSignalService;
  }

  public async detect(input: AssessmentAnomalyDetectionInput): Promise<AssessmentAnomalyDetectionResult> {
    const signals = this.buildSignals(input);
    const createdSignals: IFraudSignal[] = [];

    if (input.persistSignals) {
      for (const signal of signals) {
        const created = await this.signalService.createSignal({
          studentId: input.studentId,
          actor: input.actor ?? null,
          sourceType: 'assessment',
          sourceId: input.sourceId,
          signalType: signal.signalType,
          riskLevel: signal.riskLevel,
          severity: signal.riskLevel,
          confidence: signal.confidence,
          evidence: signal.evidence,
          explanation: signal.explanation,
          status: 'pending_review',
        });
        createdSignals.push(created);
      }
    }

    return { signals, createdSignals };
  }

  private buildSignals(input: AssessmentAnomalyDetectionInput): AssessmentAnomalyCandidate[] {
    const signals: AssessmentAnomalyCandidate[] = [];
    const rapid = this.detectRapidSubmission(input);
    if (rapid) signals.push(rapid);
    const jump = this.detectScoreJump(input);
    if (jump) signals.push(jump);
    const duplicate = this.detectDuplicatePattern(input);
    if (duplicate) signals.push(duplicate);
    const changes = this.detectExcessiveChanges(input);
    if (changes) signals.push(changes);
    return signals;
  }

  private detectRapidSubmission(input: AssessmentAnomalyDetectionInput): AssessmentAnomalyCandidate | null {
    const threshold = input.rapidSubmissionSecondsThreshold ?? DEFAULT_RAPID_SUBMISSION_SECONDS;
    const start = toDateOrNull(input.attempt?.started_at ?? input.attempt?.createdAt ?? input.submission?.createdAt ?? null);
    const end = toDateOrNull(input.attempt?.submitted_at ?? input.submission?.submitted_at ?? input.submission?.updatedAt ?? input.now ?? null);
    if (!start || !end) return null;
    const elapsedSeconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
    if (elapsedSeconds > threshold) return null;

    return {
      signalType: 'rapid_assessment_submission',
      riskLevel: 'informational',
      confidence: elapsedSeconds <= threshold / 2 ? 0.74 : 0.58,
      evidence: {
        source: input.source,
        source_id: input.sourceId,
        elapsed_seconds: elapsedSeconds,
        threshold_seconds: threshold,
        answered_count: input.answers?.length ?? null,
      },
      explanation: 'Rapid assessment or assignment submission timing was observed; this is an informational review signal, not a misconduct conclusion.',
    };
  }

  private detectScoreJump(input: AssessmentAnomalyDetectionInput): AssessmentAnomalyCandidate | null {
    const current = input.attempt ?? input.submission;
    if (!current) return null;
    const currentPercentage = resolvePercentage(current);
    if (currentPercentage === null) return null;
    const previousPercentages = (input.previousResults ?? [])
      .map(resolvePercentage)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    if (previousPercentages.length < 2) return null;
    const previousAverage = previousPercentages.reduce((sum, value) => sum + value, 0) / previousPercentages.length;
    const jump = currentPercentage - previousAverage;
    const threshold = input.scoreJumpPercentagePointsThreshold ?? DEFAULT_SCORE_JUMP_POINTS;
    if (jump < threshold) return null;

    return {
      signalType: 'abnormal_score_jump',
      riskLevel: 'low',
      confidence: jump >= threshold + 20 ? 0.78 : 0.64,
      evidence: {
        source: input.source,
        source_id: input.sourceId,
        current_percentage: round(currentPercentage),
        previous_average_percentage: round(previousAverage),
        previous_result_count: previousPercentages.length,
        jump_percentage_points: round(jump),
        threshold_percentage_points: threshold,
      },
      explanation: 'A score increase outside the configured review threshold was observed; this is a neutral signal requiring human context review.',
    };
  }

  private detectDuplicatePattern(input: AssessmentAnomalyDetectionInput): AssessmentAnomalyCandidate | null {
    const threshold = input.duplicateSimilarityThreshold ?? DEFAULT_DUPLICATE_SIMILARITY;
    const currentText = input.source === 'teacher_assignment_submission'
      ? normalizeText(input.submission?.content)
      : normalizeText((input.answers ?? []).map((answer) => `${answer.question_id}:${answer.student_answer ?? answer.selected_choice ?? ''}`).join(' | '));
    if (currentText.length < 20) return null;

    let best: { submission_id: string; similarity: number } | null = null;
    for (const peer of input.peerSubmissions ?? []) {
      if (String(peer.student_id) === String(input.studentId)) continue;
      const similarity = jaccardSimilarity(currentText, peer.content ?? '');
      if (!best || similarity > best.similarity) best = { submission_id: peer.id, similarity };
    }
    if (!best || best.similarity < threshold) return null;

    return {
      signalType: 'duplicate_answer_pattern',
      riskLevel: 'low',
      confidence: Math.min(0.9, round(best.similarity)),
      evidence: {
        source: input.source,
        source_id: input.sourceId,
        similarity: round(best.similarity),
        threshold,
        compared_peer_submission_id: best.submission_id,
        content_fingerprint_length: currentText.length,
      },
      explanation: 'A highly similar answer pattern was observed against another submission; this is a review signal only and may have benign explanations.',
    };
  }

  private detectExcessiveChanges(input: AssessmentAnomalyDetectionInput): AssessmentAnomalyCandidate | null {
    const events = input.answerSaveEvents ?? [];
    if (events.length === 0) return null;
    const counts = new Map<string, number>();
    for (const event of events) {
      if (!event.question_id) continue;
      counts.set(event.question_id, (counts.get(event.question_id) ?? 0) + 1);
    }
    const maxChanges = Math.max(0, ...Array.from(counts.values()));
    const threshold = input.excessiveAnswerChangesThreshold ?? DEFAULT_EXCESSIVE_CHANGES;
    if (maxChanges < threshold) return null;

    return {
      signalType: 'excessive_answer_changes',
      riskLevel: 'informational',
      confidence: maxChanges >= threshold * 2 ? 0.72 : 0.55,
      evidence: {
        source: input.source,
        source_id: input.sourceId,
        max_changes_for_single_question: maxChanges,
        total_save_events: events.length,
        threshold,
      },
      explanation: 'Frequent answer changes were observed where event history is available; this is informational and not a grading action.',
    };
  }
}

export const assessmentAnomalyDetectorService = new AssessmentAnomalyDetectorService();
export default assessmentAnomalyDetectorService;
