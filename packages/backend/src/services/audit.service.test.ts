import assert from 'node:assert/strict';
import test from 'node:test';

import { AuditService, redactAuditJson } from './audit.service';
import type { AuditLogWriter } from './audit.service';
import type { IAuditLog } from '../models/audit-log.model';

test('redactAuditJson removes sensitive nested fields', () => {
  const redacted = redactAuditJson({
    email: 'student@example.com',
    password: 'plain-text',
    nested: {
      apiKey: 'secret-api-key',
      token: 'jwt-token',
      safe: true,
    },
    list: [{ refreshToken: 'refresh-token' }, 'visible'],
  });

  assert.deepEqual(redacted, {
    email: 'student@example.com',
    password: '[REDACTED]',
    nested: {
      apiKey: '[REDACTED]',
      token: '[REDACTED]',
      safe: true,
    },
    list: [{ refreshToken: '[REDACTED]' }, 'visible'],
  });
});

test('audit service writes redacted event payload', async () => {
  const createdPayloads: Array<Partial<IAuditLog>> = [];
  const writer: AuditLogWriter = {
    create: async (payload: Partial<IAuditLog>) => {
      createdPayloads.push(payload);
      return payload as IAuditLog;
    },
  };

  const service = new AuditService({ writer });
  const result = await service.record({
    actor: { id: '507f1f77bcf86cd799439011', role: 'teacher' },
    action: 'student.update',
    resourceType: 'student',
    resourceId: 'student-profile-1',
    scopeType: 'class',
    scopeId: 'class-1',
    before: { password_hash: 'old-hash', full_name: 'Old Name' },
    after: { password_hash: 'new-hash', full_name: 'New Name' },
    requestId: 'req-1',
    ipAddress: '127.0.0.1',
    userAgent: 'node-test',
    result: 'success',
    metadata: { reason: 'unit-test' },
  });

  const createdPayload = createdPayloads[0];
  assert.ok(createdPayload);
  assert.equal(result, createdPayload);
  assert.equal(createdPayload.actorRole, 'teacher');
  assert.equal(String(createdPayload.actorUserId), '507f1f77bcf86cd799439011');
  assert.deepEqual(createdPayload.before, { password_hash: '[REDACTED]', full_name: 'Old Name' });
  assert.deepEqual(createdPayload.after, { password_hash: '[REDACTED]', full_name: 'New Name' });
  assert.equal(createdPayload.result, 'success');
});

test('audit service is fail-safe when writer throws', async () => {
  let logged = false;
  const writer: AuditLogWriter = {
    create: async () => {
      throw new Error('database unavailable');
    },
  };

  const service = new AuditService({
    writer,
    logger: {
      error: () => {
        logged = true;
      },
      warn: () => undefined,
    },
  });

  const result = await service.record({
    action: 'authorization.denied',
    resourceType: 'student',
    resourceId: 'student-1',
    result: 'denied',
    errorCode: 'FORBIDDEN',
  });

  assert.equal(result, null);
  assert.equal(logged, true);
});
