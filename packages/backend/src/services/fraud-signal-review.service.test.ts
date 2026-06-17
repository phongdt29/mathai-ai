import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';

import { FraudSignalService } from './fraud-signal.service';
import type { IFraudSignal } from '../models/fraud-signal.model';

const signalId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
const studentId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439012');
const reviewerId = '507f1f77bcf86cd799439013';

const makeSignal = (status: IFraudSignal['status'] = 'pending_review'): IFraudSignal => ({
  id: signalId.toString(),
  _id: signalId,
  student_id: studentId,
  actor: null,
  source_type: 'assessment',
  source_id: 'attempt-1',
  signal_type: 'rapid_assessment_submission',
  risk_level: 'informational',
  severity: 'informational',
  confidence: 0.6,
  evidence: { elapsed_seconds: 45 },
  explanation: 'review signal only',
  status,
  reviewed_by: status === 'pending_review' ? null : new mongoose.Types.ObjectId(reviewerId),
  reviewed_at: status === 'pending_review' ? null : new Date('2026-05-06T12:00:00.000Z'),
  createdAt: new Date('2026-05-06T11:00:00.000Z'),
  updatedAt: new Date('2026-05-06T11:00:00.000Z'),
} as unknown as IFraudSignal);

test('reviewSignal updates status and writes fail-safe audit decision', async () => {
  const updatedPayloads: unknown[] = [];
  const audited: unknown[] = [];
  const service = new FraudSignalService({
    writer: {
      create: async () => makeSignal(),
      findById: async () => makeSignal(),
      update: async (_id, payload) => {
        updatedPayloads.push(payload);
        return { ...makeSignal('resolved'), ...payload, id: signalId.toString(), student_id: studentId } as unknown as IFraudSignal;
      },
      findByStudent: async () => [],
      findPendingReview: async () => [],
      listForReview: async () => [],
    },
    auditor: {
      record: async (input) => {
        audited.push(input);
        return null;
      },
    },
  });

  const result = await service.reviewSignal({
    signalId: signalId.toString(),
    reviewerId,
    reviewerRole: 'admin',
    decision: 'resolved',
    note: 'Reviewed with teacher context; no automatic penalty.',
  });

  assert.equal(result.status, 'resolved');
  assert.equal(updatedPayloads.length, 1);
  assert.equal((updatedPayloads[0] as { status: string }).status, 'resolved');
  assert.equal(audited.length, 1);
  assert.equal((audited[0] as { action: string }).action, 'risk_signal.review_decision');
  assert.equal((audited[0] as { metadata: { decision: string } }).metadata.decision, 'resolved');
});

test('listReviewSignals builds bounded review filters', async () => {
  const seen: Array<{ filter: Record<string, unknown>; limit: number }> = [];
  const service = new FraudSignalService({
    writer: {
      create: async () => makeSignal(),
      findById: async () => makeSignal(),
      update: async () => makeSignal('reviewed'),
      findByStudent: async () => [],
      findPendingReview: async () => [],
      listForReview: async (filter, limit) => {
        seen.push({ filter: filter ?? {}, limit: limit ?? 0 });
        return [makeSignal()];
      },
    },
    auditor: { record: async () => null },
  });

  const results = await service.listReviewSignals({
    status: 'pending_review',
    studentId: studentId.toString(),
    sourceType: 'assessment',
    signalType: 'rapid_assessment_submission',
    limit: 999,
  });

  assert.equal(results.length, 1);
  assert.equal(seen[0]?.limit, 250);
  assert.equal(seen[0]?.filter.status, 'pending_review');
  assert.equal(String(seen[0]?.filter.student_id), studentId.toString());
  assert.equal(seen[0]?.filter.source_type, 'assessment');
});
