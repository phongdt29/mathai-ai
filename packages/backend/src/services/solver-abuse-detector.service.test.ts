import assert from 'node:assert/strict';
import test from 'node:test';

import { SolverAbuseDetectorService } from './solver-abuse-detector.service';
import type {
  AIGenerationLogReader,
  SolverRequestReader,
  SolverRequestSnapshot,
} from './solver-abuse-detector.service';
import type { IFraudSignal } from '../models/fraud-signal.model';

const studentId = '507f1f77bcf86cd799439011';
const now = new Date('2026-05-06T12:00:00.000Z');

const makeRequest = (minutesAgo: number, response: string, id = `solver-${minutesAgo}`): SolverRequestSnapshot => ({
  id,
  ai_response: response,
  input_text: `problem ${minutesAgo}`,
  createdAt: new Date(now.getTime() - minutesAgo * 60_000),
});

test('detectForStudent emits rapid repeated solver request signal without AI provider calls', async () => {
  const requests = [0, 1, 2, 3, 4].map((minute) => makeRequest(minute, 'hint only'));
  const solverReader: SolverRequestReader = {
    findRecentByStudent: async () => requests,
  };
  const aiLogReader: AIGenerationLogReader = {
    findRecentByStudent: async () => [],
  };

  const service = new SolverAbuseDetectorService({ solverReader, aiLogReader });
  const result = await service.detectForStudent(studentId, {
    now,
    persistSignals: false,
    rapidRequestThreshold: 5,
  });

  assert.equal(result.createdSignals.length, 0);
  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0]?.signalType, 'rapid_repeated_solver_requests');
  assert.equal(result.signals[0]?.riskLevel, 'low');
  assert.equal(result.signals[0]?.evidence.request_count, 5);
  assert.match(result.signals[0]?.explanation ?? '', /không phải kết luận/i);
});

test('detectForStudent emits high full solution dependency signal', async () => {
  const fullSolution = 'Bước 1: '.repeat(90);
  const requests = [0, 5, 10, 15, 20].map((minute) => makeRequest(minute, fullSolution));
  const service = new SolverAbuseDetectorService({
    solverReader: { findRecentByStudent: async () => requests },
    aiLogReader: { findRecentByStudent: async () => [] },
  });

  const result = await service.detectForStudent(studentId, {
    now,
    persistSignals: false,
    minRequestsForDependency: 5,
    fullSolutionDependencyThreshold: 0.7,
  });

  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0]?.signalType, 'high_full_solution_dependency');
  assert.equal(result.signals[0]?.riskLevel, 'medium');
  assert.equal(result.signals[0]?.evidence.full_solution_like_ratio, 1);
});

test('detectForStudent emits assessment proximity and safety event signals when data is available', async () => {
  const service = new SolverAbuseDetectorService({
    solverReader: { findRecentByStudent: async () => [makeRequest(12, 'hint')] },
    aiLogReader: {
      findRecentByStudent: async () => [
        { id: 'log-1', generation_type: 'solver_hint', safety_status: 'flagged', createdAt: now },
        { id: 'log-2', generation_type: 'chat_message', safety_status: 'blocked', createdAt: now },
        { id: 'log-3', generation_type: 'solver_full_solution', requires_approval: true, createdAt: now },
      ],
    },
  });

  const result = await service.detectForStudent(studentId, {
    now,
    persistSignals: false,
    assessmentStartTimes: [new Date(now.getTime() - 10 * 60_000)],
    flaggedSafetyThreshold: 3,
  });

  assert.deepEqual(result.signals.map((signal) => signal.signalType).sort(), [
    'repeated_flagged_safety_events',
    'solver_usage_near_assessment',
  ]);
  assert.equal(result.signals.find((signal) => signal.signalType === 'solver_usage_near_assessment')?.riskLevel, 'informational');
});

test('detectForStudent persists neutral pending signals when enabled', async () => {
  const createdInputs: unknown[] = [];
  const service = new SolverAbuseDetectorService({
    solverReader: { findRecentByStudent: async () => [0, 1, 2, 3, 4].map((minute) => makeRequest(minute, 'hint')) },
    aiLogReader: { findRecentByStudent: async () => [] },
    signalService: {
      createSignal: async (input) => {
        createdInputs.push(input);
        return { id: 'signal-created' } as IFraudSignal;
      },
    },
  });

  const result = await service.detectForStudent(studentId, { now, persistSignals: true });

  assert.equal(result.createdSignals.length, 1);
  assert.equal(createdInputs.length, 1);
  assert.equal((createdInputs[0] as { status: string }).status, 'pending_review');
  assert.equal((createdInputs[0] as { signalType: string }).signalType, 'rapid_repeated_solver_requests');
});
