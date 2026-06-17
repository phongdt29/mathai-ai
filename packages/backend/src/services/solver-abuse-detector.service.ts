import type { IAIGenerationLog } from '../models/ai-log.model';
import { AIGenerationLogModel } from '../models/ai-log.model';
import type { IFraudSignal } from '../models/fraud-signal.model';
import type { ISolverRequest } from '../models/solver.model';
import { SolverRequestModel } from '../models/solver.model';
import { fraudSignalService, type FraudSignalActorContextInput, type FraudSignalService } from './fraud-signal.service';
import type { JsonObject } from '../types';

export interface SolverAbuseDetectionSignal {
  signalType:
    | 'rapid_repeated_solver_requests'
    | 'high_full_solution_dependency'
    | 'solver_usage_near_assessment'
    | 'repeated_flagged_safety_events';
  riskLevel: 'informational' | 'low' | 'medium' | 'high';
  confidence: number;
  evidence: JsonObject;
  explanation: string;
  sourceType: 'solver' | 'ai_log';
  sourceId: string | null;
}

export interface SolverAbuseDetectionOptions {
  now?: Date;
  lookbackMinutes?: number;
  rapidRequestThreshold?: number;
  rapidWindowMinutes?: number;
  fullSolutionDependencyThreshold?: number;
  minRequestsForDependency?: number;
  assessmentWindowMinutes?: number;
  assessmentStartTimes?: Date[];
  flaggedSafetyThreshold?: number;
  persistSignals?: boolean;
  actor?: FraudSignalActorContextInput | null;
}

export interface SolverAbuseDetectionResult {
  studentId: string;
  signals: SolverAbuseDetectionSignal[];
  createdSignals: IFraudSignal[];
}

export interface SolverAbuseDetectorDependencies {
  solverReader?: SolverRequestReader;
  aiLogReader?: AIGenerationLogReader;
  signalService?: Pick<FraudSignalService, 'createSignal'>;
}

export interface SolverRequestReader {
  findRecentByStudent(studentId: string, since: Date, limit: number): Promise<SolverRequestSnapshot[]>;
}

export interface AIGenerationLogReader {
  findRecentByStudent(studentId: string, since: Date, limit: number): Promise<AIGenerationLogSnapshot[]>;
}

export interface SolverRequestSnapshot {
  id?: string;
  _id?: unknown;
  input_type?: string | null;
  input_text?: string | null;
  ai_response?: string | null;
  createdAt?: Date | string;
}

export interface AIGenerationLogSnapshot {
  id?: string;
  _id?: unknown;
  generation_type?: string;
  purpose?: string | null;
  safety_status?: string;
  requires_approval?: boolean;
  approval_status?: string | null;
  createdAt?: Date | string;
}

class MongoSolverRequestReader implements SolverRequestReader {
  public async findRecentByStudent(studentId: string, since: Date, limit: number): Promise<SolverRequestSnapshot[]> {
    return SolverRequestModel.find({ student_id: studentId, createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<ISolverRequest[]>()
      .exec() as unknown as SolverRequestSnapshot[];
  }
}

class MongoAIGenerationLogReader implements AIGenerationLogReader {
  public async findRecentByStudent(studentId: string, since: Date, limit: number): Promise<AIGenerationLogSnapshot[]> {
    return AIGenerationLogModel.find({
      student_id: studentId,
      createdAt: { $gte: since },
      generation_type: { $regex: /^(solver_|chat_|tutor_)/ },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<IAIGenerationLog[]>()
      .exec() as unknown as AIGenerationLogSnapshot[];
  }
}

const DEFAULT_LOOKBACK_MINUTES = 60;
const DEFAULT_RAPID_WINDOW_MINUTES = 10;
const DEFAULT_RAPID_REQUEST_THRESHOLD = 5;
const DEFAULT_FULL_SOLUTION_DEPENDENCY_THRESHOLD = 0.7;
const DEFAULT_MIN_REQUESTS_FOR_DEPENDENCY = 5;
const DEFAULT_ASSESSMENT_WINDOW_MINUTES = 30;
const DEFAULT_FLAGGED_SAFETY_THRESHOLD = 3;
const MAX_READER_LIMIT = 100;

export class SolverAbuseDetectorService {
  private readonly solverReader: SolverRequestReader;
  private readonly aiLogReader: AIGenerationLogReader;
  private readonly signalService: Pick<FraudSignalService, 'createSignal'>;

  constructor(dependencies: SolverAbuseDetectorDependencies = {}) {
    this.solverReader = dependencies.solverReader ?? new MongoSolverRequestReader();
    this.aiLogReader = dependencies.aiLogReader ?? new MongoAIGenerationLogReader();
    this.signalService = dependencies.signalService ?? fraudSignalService;
  }

  public async detectForStudent(studentId: string, options: SolverAbuseDetectionOptions = {}): Promise<SolverAbuseDetectionResult> {
    const now = options.now ?? new Date();
    const lookbackMinutes = options.lookbackMinutes ?? DEFAULT_LOOKBACK_MINUTES;
    const since = new Date(now.getTime() - lookbackMinutes * 60_000);
    const [solverRequests, aiLogs] = await Promise.all([
      this.solverReader.findRecentByStudent(studentId, since, MAX_READER_LIMIT),
      this.aiLogReader.findRecentByStudent(studentId, since, MAX_READER_LIMIT),
    ]);

    const signals = [
      ...this.detectRapidRepeatedSolverRequests(solverRequests, now, options),
      ...this.detectFullSolutionDependency(solverRequests, options),
      ...this.detectSolverUsageNearAssessment(solverRequests, options),
      ...this.detectRepeatedFlaggedSafetyEvents(aiLogs, options),
    ];

    const createdSignals = options.persistSignals === false
      ? []
      : await this.persistSignals(studentId, signals, options.actor ?? null);

    return { studentId, signals, createdSignals };
  }

  public detectRapidRepeatedSolverRequests(
    solverRequests: SolverRequestSnapshot[],
    now: Date,
    options: SolverAbuseDetectionOptions = {}
  ): SolverAbuseDetectionSignal[] {
    const threshold = options.rapidRequestThreshold ?? DEFAULT_RAPID_REQUEST_THRESHOLD;
    const windowMinutes = options.rapidWindowMinutes ?? DEFAULT_RAPID_WINDOW_MINUTES;
    const windowStart = new Date(now.getTime() - windowMinutes * 60_000);
    const inWindow = solverRequests.filter((request) => this.toDate(request.createdAt) >= windowStart);

    if (inWindow.length < threshold) return [];

    return [{
      signalType: 'rapid_repeated_solver_requests',
      riskLevel: inWindow.length >= threshold * 2 ? 'medium' : 'low',
      confidence: Math.min(0.95, 0.55 + inWindow.length / (threshold * 10)),
      sourceType: 'solver',
      sourceId: this.getId(inWindow[0]) ?? null,
      evidence: {
        request_count: inWindow.length,
        threshold,
        window_minutes: windowMinutes,
        first_observed_at: this.toDate(inWindow[inWindow.length - 1]?.createdAt).toISOString(),
        last_observed_at: this.toDate(inWindow[0]?.createdAt).toISOString(),
      },
      explanation: 'Tín hiệu cần xem xét: nhiều yêu cầu solver liên tiếp trong thời gian ngắn. Đây không phải kết luận vi phạm.',
    }];
  }

  public detectFullSolutionDependency(
    solverRequests: SolverRequestSnapshot[],
    options: SolverAbuseDetectionOptions = {}
  ): SolverAbuseDetectionSignal[] {
    const minRequests = options.minRequestsForDependency ?? DEFAULT_MIN_REQUESTS_FOR_DEPENDENCY;
    if (solverRequests.length < minRequests) return [];

    const fullSolutionCount = solverRequests.filter((request) => this.looksLikeFullSolution(request)).length;
    const ratio = fullSolutionCount / solverRequests.length;
    const threshold = options.fullSolutionDependencyThreshold ?? DEFAULT_FULL_SOLUTION_DEPENDENCY_THRESHOLD;

    if (ratio < threshold) return [];

    return [{
      signalType: 'high_full_solution_dependency',
      riskLevel: ratio >= 0.9 ? 'medium' : 'low',
      confidence: Math.min(0.9, 0.5 + ratio * 0.4),
      sourceType: 'solver',
      sourceId: this.getId(solverRequests[0]) ?? null,
      evidence: {
        request_count: solverRequests.length,
        full_solution_like_count: fullSolutionCount,
        full_solution_like_ratio: Math.round(ratio * 100) / 100,
        threshold,
      },
      explanation: 'Tín hiệu cần xem xét: tỷ lệ sử dụng lời giải đầy đủ ở mức cao. Tín hiệu chỉ phục vụ hỗ trợ/kiểm duyệt.',
    }];
  }

  public detectSolverUsageNearAssessment(
    solverRequests: SolverRequestSnapshot[],
    options: SolverAbuseDetectionOptions = {}
  ): SolverAbuseDetectionSignal[] {
    const assessmentStartTimes = options.assessmentStartTimes ?? [];
    if (assessmentStartTimes.length === 0 || solverRequests.length === 0) return [];

    const windowMinutes = options.assessmentWindowMinutes ?? DEFAULT_ASSESSMENT_WINDOW_MINUTES;
    const windowMs = windowMinutes * 60_000;
    const nearAssessment = solverRequests.filter((request) => {
      const requestTime = this.toDate(request.createdAt).getTime();
      return assessmentStartTimes.some((assessmentStart) => Math.abs(requestTime - assessmentStart.getTime()) <= windowMs);
    });

    if (nearAssessment.length === 0) return [];

    return [{
      signalType: 'solver_usage_near_assessment',
      riskLevel: 'informational',
      confidence: 0.55,
      sourceType: 'solver',
      sourceId: this.getId(nearAssessment[0]) ?? null,
      evidence: {
        request_count_near_assessment: nearAssessment.length,
        assessment_count: assessmentStartTimes.length,
        assessment_window_minutes: windowMinutes,
        nearest_request_at: this.toDate(nearAssessment[0]?.createdAt).toISOString(),
      },
      explanation: 'Tín hiệu thông tin: có sử dụng solver gần thời điểm làm assessment nếu dữ liệu lịch assessment đúng. Cần người kiểm duyệt xem xét bối cảnh.',
    }];
  }

  public detectRepeatedFlaggedSafetyEvents(
    aiLogs: AIGenerationLogSnapshot[],
    options: SolverAbuseDetectionOptions = {}
  ): SolverAbuseDetectionSignal[] {
    const threshold = options.flaggedSafetyThreshold ?? DEFAULT_FLAGGED_SAFETY_THRESHOLD;
    const flagged = aiLogs.filter((log) => log.safety_status === 'flagged' || log.safety_status === 'blocked' || log.requires_approval === true);

    if (flagged.length < threshold) return [];

    return [{
      signalType: 'repeated_flagged_safety_events',
      riskLevel: flagged.some((log) => log.safety_status === 'blocked') ? 'medium' : 'low',
      confidence: Math.min(0.95, 0.55 + flagged.length / (threshold * 10)),
      sourceType: 'ai_log',
      sourceId: this.getId(flagged[0]) ?? null,
      evidence: {
        flagged_event_count: flagged.length,
        threshold,
        statuses: Array.from(new Set(flagged.map((log) => log.safety_status ?? 'unknown'))),
        generation_types: Array.from(new Set(flagged.map((log) => log.generation_type ?? 'unknown'))),
      },
      explanation: 'Tín hiệu cần xem xét: nhiều sự kiện AI safety bị gắn cờ/chặn trong thời gian gần đây. Không tự động kết luận hành vi sai phạm.',
    }];
  }

  private async persistSignals(
    studentId: string,
    signals: SolverAbuseDetectionSignal[],
    actor: FraudSignalActorContextInput | null
  ): Promise<IFraudSignal[]> {
    const created: IFraudSignal[] = [];
    for (const signal of signals) {
      created.push(await this.signalService.createSignal({
        studentId,
        actor,
        sourceType: signal.sourceType,
        sourceId: signal.sourceId,
        signalType: signal.signalType,
        riskLevel: signal.riskLevel,
        severity: signal.riskLevel,
        confidence: signal.confidence,
        evidence: signal.evidence,
        explanation: signal.explanation,
        status: 'pending_review',
      }));
    }
    return created;
  }

  private looksLikeFullSolution(request: SolverRequestSnapshot): boolean {
    const response = request.ai_response ?? '';
    const normalized = response.toLowerCase();
    return response.length > 500
      || normalized.includes('lời giải')
      || normalized.includes('đáp án')
      || normalized.includes('bước 1')
      || normalized.includes('step 1');
  }

  private toDate(value: Date | string | undefined): Date {
    if (value instanceof Date) return value;
    if (typeof value === 'string') return new Date(value);
    return new Date(0);
  }

  private getId(value: { id?: string; _id?: unknown } | undefined): string | null {
    if (!value) return null;
    if (typeof value.id === 'string') return value.id;
    if (value._id && typeof (value._id as { toString?: unknown }).toString === 'function') return String(value._id);
    return null;
  }
}

export const solverAbuseDetectorService = new SolverAbuseDetectorService();
export default solverAbuseDetectorService;
