import assert from 'node:assert/strict';
import test from 'node:test';

import { AssessmentAnomalyDetectorService } from './assessment-anomaly-detector.service';
import type { IFraudSignal } from '../models/fraud-signal.model';

const studentId = '507f1f77bcf86cd799439011';
const attemptId = '507f1f77bcf86cd799439012';

const makeService = (createdInputs: unknown[] = []) =>
  new AssessmentAnomalyDetectorService({
    signalService: {
      createSignal: async (input) => {
        createdInputs.push(input);
        return { id: `signal-${createdInputs.length}` } as IFraudSignal;
      },
    },
  });

test('assessment anomaly detector emits neutral rapid submission signal', async () => {
  const result = await makeService().detect({
    source: 'assessment_attempt',
    studentId,
    sourceId: attemptId,
    attempt: {
      id: attemptId,
      assessment_id: 'assessment-1',
      student_id: studentId,
      started_at: new Date('2026-05-06T12:00:00.000Z'),
      submitted_at: new Date('2026-05-06T12:00:45.000Z'),
      percentage: 70,
    },
    answers: [{ question_id: 'q1', student_answer: 'A' }],
    persistSignals: false,
  });

  assert.equal(result.createdSignals.length, 0);
  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0]?.signalType, 'rapid_assessment_submission');
  assert.equal(result.signals[0]?.riskLevel, 'informational');
  assert.match(result.signals[0]?.explanation ?? '', /not a misconduct conclusion/i);
});

test('assessment anomaly detector emits abnormal score jump from prior results', async () => {
  const result = await makeService().detect({
    source: 'assessment_attempt',
    studentId,
    sourceId: attemptId,
    attempt: {
      id: attemptId,
      assessment_id: 'assessment-1',
      student_id: studentId,
      started_at: new Date('2026-05-06T12:00:00.000Z'),
      submitted_at: new Date('2026-05-06T12:20:00.000Z'),
      percentage: 92,
    },
    previousResults: [{ percentage: 40 }, { percentage: 42 }, { percentage: 45 }],
    persistSignals: false,
  });

  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0]?.signalType, 'abnormal_score_jump');
  assert.equal(result.signals[0]?.riskLevel, 'low');
  assert.equal(result.signals[0]?.evidence.previous_result_count, 3);
});

test('assessment anomaly detector emits duplicate answer pattern when peer data allows', async () => {
  const content = 'Bước 1 quy đồng mẫu số. Bước 2 cộng tử số. Kết quả cuối cùng là bảy phần mười hai.';
  const result = await makeService().detect({
    source: 'teacher_assignment_submission',
    studentId,
    sourceId: 'submission-1',
    submission: {
      id: 'submission-1',
      assignment_id: 'assignment-1',
      student_id: studentId,
      content,
      score: 10,
      max_score: 10,
      submitted_at: new Date('2026-05-06T12:00:00.000Z'),
    },
    peerSubmissions: [
      {
        id: 'submission-2',
        assignment_id: 'assignment-1',
        student_id: '507f1f77bcf86cd799439099',
        content,
        submitted_at: new Date('2026-05-06T12:01:00.000Z'),
      },
    ],
    persistSignals: false,
  });

  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0]?.signalType, 'duplicate_answer_pattern');
  assert.equal(result.signals[0]?.riskLevel, 'low');
  assert.equal(result.signals[0]?.evidence.compared_peer_submission_id, 'submission-2');
});

test('assessment anomaly detector persists pending review signals when enabled', async () => {
  const createdInputs: unknown[] = [];
  const result = await makeService(createdInputs).detect({
    source: 'assessment_attempt',
    studentId,
    sourceId: attemptId,
    attempt: {
      id: attemptId,
      assessment_id: 'assessment-1',
      student_id: studentId,
      started_at: new Date('2026-05-06T12:00:00.000Z'),
      submitted_at: new Date('2026-05-06T12:00:30.000Z'),
      percentage: 90,
    },
    persistSignals: true,
  });

  assert.equal(result.createdSignals.length, 1);
  assert.equal((createdInputs[0] as { status: string }).status, 'pending_review');
  assert.equal((createdInputs[0] as { sourceType: string }).sourceType, 'assessment');
});
