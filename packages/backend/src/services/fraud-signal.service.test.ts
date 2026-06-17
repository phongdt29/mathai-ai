import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';

import { FraudSignalService, redactFraudSignalEvidence } from './fraud-signal.service';
import type { FraudSignalWriter } from './fraud-signal.service';
import type { IFraudSignal } from '../models/fraud-signal.model';

const studentId = '507f1f77bcf86cd799439011';

test('redactFraudSignalEvidence limits sensitive solver/chat evidence', () => {
  const redacted = redactFraudSignalEvidence({
    request_count: 6,
    input_text: 'Solve this full problem with all private details',
    nested: {
      ai_response: 'long response should be removed',
      safe_metric: 0.8,
    },
    notes: 'x'.repeat(220),
  });

  assert.equal(redacted.request_count, 6);
  assert.equal(redacted.input_text, '[REDACTED]');
  assert.deepEqual(redacted.nested, { ai_response: '[REDACTED]', safe_metric: 0.8 });
  assert.match(String(redacted.notes), /\[truncated\]$/);
});

test('FraudSignalService creates neutral pending signal and audits medium risk fail-safe', async () => {
  const createdPayloads: Array<Partial<IFraudSignal>> = [];
  const auditPayloads: unknown[] = [];
  const writer: FraudSignalWriter = {
    create: async (payload: Partial<IFraudSignal>) => {
      createdPayloads.push(payload);
      return {
        ...payload,
        id: 'signal-1',
      } as IFraudSignal;
    },
    findById: async () => null,
    update: async () => null,
    findByStudent: async () => [],
    findPendingReview: async () => [],
    listForReview: async () => [],
  };

  const service = new FraudSignalService({
    writer,
    auditor: {
      record: async (payload) => {
        auditPayloads.push(payload);
        return null;
      },
    },
  });

  const signal = await service.createSignal({
    studentId,
    actor: { userId: studentId, role: 'student', ipAddress: '127.0.0.1' },
    sourceType: 'solver',
    sourceId: 'solver-1',
    signalType: 'high_full_solution_dependency',
    riskLevel: 'medium',
    confidence: 1.5,
    evidence: { ai_response: 'sensitive output', full_solution_like_ratio: 0.91 },
    explanation: 'fraud confirmed should be neutralized',
  });

  const created = createdPayloads[0];
  assert.ok(created);
  assert.equal(String(created.student_id), studentId);
  assert.equal(created.status, 'pending_review');
  assert.equal(created.risk_level, 'medium');
  assert.equal(created.severity, 'medium');
  assert.equal(created.confidence, 1);
  assert.equal((created.evidence as Record<string, unknown>).ai_response, '[REDACTED]');
  assert.equal(created.explanation, 'risk signal observed should be neutralized');
  assert.equal(signal.id, 'signal-1');
  assert.equal(auditPayloads.length, 1);
});

test('FraudSignalService does not fail signal creation if audit throws', async () => {
  const writer: FraudSignalWriter = {
    create: async (payload: Partial<IFraudSignal>) => ({
      ...payload,
      id: 'signal-2',
      student_id: new mongoose.Types.ObjectId(studentId),
    }) as IFraudSignal,
    findById: async () => null,
    update: async () => null,
    findByStudent: async () => [],
    findPendingReview: async () => [],
    listForReview: async () => [],
  };

  let warned = false;
  const service = new FraudSignalService({
    writer,
    auditor: {
      record: async () => {
        throw new Error('audit unavailable');
      },
    },
    logger: {
      warn: () => {
        warned = true;
      },
      error: () => undefined,
    },
  });

  const signal = await service.createSignal({
    studentId,
    sourceType: 'ai_log',
    signalType: 'repeated_flagged_safety_events',
    riskLevel: 'high',
    confidence: 0.8,
    evidence: { flagged_event_count: 3 },
    explanation: 'Tín hiệu cần xem xét từ safety events.',
  });

  assert.equal(signal.id, 'signal-2');
  assert.equal(warned, true);
});
