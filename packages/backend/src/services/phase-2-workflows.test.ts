import assert from 'node:assert/strict';
import test from 'node:test';

import { adminApprovalService } from './admin-approval.service';
import { attendanceService } from './attendance.service';
import { auditService } from './audit.service';
import { learningRiskService } from './risk.service';
import { teacherService } from './teacher.service';
import { attendanceRecordRepo } from '../models/engagement.model';
import { approvalRequestRepository } from '../models/approval.model';

const objectId = (suffix: string | number) => `507f1f77bcf86cd79943${String(suffix).padStart(4, '0')}`.slice(0, 24);

test('attendance class update audits each record and recomputes risk without blocking writes', async (t) => {
  const originalFindOne = attendanceRecordRepo.model.findOne;
  const originalCreate = attendanceRecordRepo.create;
  const originalAuditRecord = auditService.record;
  const originalComputeRisk = learningRiskService.computeRiskScore;

  const audited: any[] = [];
  const recomputed: string[] = [];
  const created: any[] = [];

  attendanceRecordRepo.model.findOne = (() => ({ exec: async () => null })) as any;
  attendanceRecordRepo.create = async (payload: any) => {
    const doc = { _id: objectId(String(created.length + 1).padStart(2, '0')), id: objectId(String(created.length + 1).padStart(2, '0')), ...payload };
    created.push(doc);
    return doc as any;
  };
  auditService.record = async (input: any) => {
    audited.push(input);
    return input;
  };
  learningRiskService.computeRiskScore = async (studentId: string) => {
    recomputed.push(studentId);
    throw new Error('risk backend unavailable');
  };

  t.after(() => {
    attendanceRecordRepo.model.findOne = originalFindOne;
    attendanceRecordRepo.create = originalCreate;
    auditService.record = originalAuditRecord;
    learningRiskService.computeRiskScore = originalComputeRisk;
  });

  const studentId = objectId('11');
  const result = await attendanceService.applyClassAttendanceUpdate({
    classId: objectId('22'),
    studentIdsInClass: [studentId],
    date: '2026-05-06',
    records: [{ student_id: studentId, status: 'present', status_reason: 'Manual check-in' }],
    actor: { id: objectId('33'), role: 'admin' },
  });

  assert.equal(result.length, 1);
  assert.equal(created.length, 1);
  assert.equal(recomputed[0], studentId);
  assert.equal(audited.some((event) => event.action === 'attendance.create' && event.result === 'success'), true);
  assert.equal(audited.some((event) => event.action === 'risk.recompute_after_attendance_failed' && event.result === 'failure'), true);
});

test('attendance class update rejects students outside class scope before writing', async (t) => {
  const originalCreate = attendanceRecordRepo.create;
  let created = false;
  attendanceRecordRepo.create = async () => {
    created = true;
    throw new Error('should not write');
  };
  t.after(() => {
    attendanceRecordRepo.create = originalCreate;
  });

  await assert.rejects(
    attendanceService.applyClassAttendanceUpdate({
      classId: objectId('44'),
      studentIdsInClass: [objectId('45')],
      date: '2026-05-06',
      records: [{ student_id: objectId('46'), status: 'absent' }],
      actor: { id: objectId('47'), role: 'admin' },
    }),
    /Học sinh không thuộc lớp học này/
  );
  assert.equal(created, false);
});

test('admin approval approve executes remove_student and audits approval decision', async (t) => {
  const originalEnsureAdmin = (adminApprovalService as any).ensureAdmin;
  const originalFindById = approvalRequestRepository.findById;
  const originalUpdate = approvalRequestRepository.update;
  const originalRemove = teacherService.removeStudentFromClass;
  const originalAuditRecord = auditService.record;

  const proposal = {
    _id: objectId('55'),
    id: objectId('55'),
    type: 'remove_student',
    status: 'pending',
    requester_id: { toString: () => objectId('56') },
    data: { class_id: objectId('57'), student_profile_id: objectId('58') },
  };
  const calls: any[] = [];
  const audited: any[] = [];

  (adminApprovalService as any).ensureAdmin = async () => undefined;
  approvalRequestRepository.findById = async () => proposal as any;
  approvalRequestRepository.update = async (_id: string, payload: any) => ({ ...proposal, ...payload, toObject: () => ({ ...proposal, ...payload }) }) as any;
  teacherService.removeStudentFromClass = async (...args: any[]) => {
    calls.push(args);
  };
  auditService.record = async (input: any) => {
    audited.push(input);
    return input;
  };

  t.after(() => {
    (adminApprovalService as any).ensureAdmin = originalEnsureAdmin;
    approvalRequestRepository.findById = originalFindById;
    approvalRequestRepository.update = originalUpdate;
    teacherService.removeStudentFromClass = originalRemove;
    auditService.record = originalAuditRecord;
  });

  const result = await adminApprovalService.approve(objectId('59'), objectId('55'));

  assert.equal(result.status, 'approved');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 3), [objectId('56'), objectId('57'), objectId('58')]);
  assert.deepEqual(calls[0][3], { id: objectId('59'), role: 'admin' });
  assert.equal(audited.some((event) => event.action === 'approval.approve' && event.metadata.approval_type === 'remove_student'), true);
});

test('teacher delete and remove routes are backed by approval request helpers', async (t) => {
  const originalEnsureClassOwner = (teacherService as any).ensureClassOwner;
  const originalCreate = approvalRequestRepository.create;
  const originalAuditRecord = auditService.record;

  const teacherId = objectId('60');
  const classId = objectId('61');
  const studentId = objectId('62');
  const cls = { _id: classId, id: classId, name: 'Lớp 6A', student_ids: [{ toString: () => studentId }] };
  const proposalTypes: string[] = [];

  (teacherService as any).ensureClassOwner = async () => cls;
  approvalRequestRepository.create = async (payload: any) => {
    proposalTypes.push(payload.type);
    return { _id: objectId(String(proposalTypes.length + 70)), ...payload, toObject: () => ({ _id: objectId(String(proposalTypes.length + 70)), ...payload }) } as any;
  };
  auditService.record = async (input: any) => input;

  t.after(() => {
    (teacherService as any).ensureClassOwner = originalEnsureClassOwner;
    approvalRequestRepository.create = originalCreate;
    auditService.record = originalAuditRecord;
  });

  await teacherService.requestArchiveClass(teacherId, classId);
  await teacherService.requestRemoveStudent(teacherId, classId, studentId);

  assert.deepEqual(proposalTypes, ['archive_class', 'remove_student']);
});
