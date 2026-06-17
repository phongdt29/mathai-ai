import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { requireScopedAccess } from '../middleware/scoped-authorization';
import { teacherService } from '../services/teacher.service';
import { attendanceService } from '../services/attendance.service';
import { auditService } from '../services/audit.service';
import { teacherClassRepository } from '../models/teacher.model';
import { ForbiddenError, ValidationError } from '../utils/errors';

const router = Router();
router.use(authenticate);

// ── Middleware: ensure teacher role ──
function requireTeacher(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'teacher') {
    return next(new ForbiddenError('Chỉ giáo viên mới có quyền truy cập'));
  }
  next();
}
router.use(requireTeacher);

const userId = (req: Request) => String(req.user!.id);

// ── Dashboard ──
router.get('/dashboard', async (req, res, next) => {
  try {
    const data = await teacherService.getDashboard(userId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ── Classes ──
router.get('/classes', async (req, res, next) => {
  try {
    const data = await teacherService.getClasses(userId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ── Proposals (teacher requests, admin approves) ──
router.post('/classes', async (req, res, next) => {
  try {
    const data = await teacherService.requestCreateClass(userId(req), req.body);
    res.status(201).json({ success: true, data, message: 'Đề xuất tạo lớp đã được gửi, chờ quản trị viên duyệt' });
  } catch (e) { next(e); }
});

router.get('/classes/:classId', requireScopedAccess({
  resourceType: 'teacher_class',
  action: 'read',
  resourceId: { source: 'params', field: 'classId' },
}), async (req, res, next) => {
  try {
    const data = await teacherService.getClassDetail(userId(req), req.params.classId);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.put('/classes/:classId', requireScopedAccess({
  resourceType: 'teacher_class',
  action: 'update',
  resourceId: { source: 'params', field: 'classId' },
}), async (req, res, next) => {
  try {
    const data = await teacherService.updateClass(userId(req), req.params.classId, req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.delete('/classes/:classId', requireScopedAccess({
  resourceType: 'teacher_class',
  action: 'delete',
  resourceId: { source: 'params', field: 'classId' },
}), async (req, res, next) => {
  try {
    const data = await teacherService.requestArchiveClass(userId(req), req.params.classId);
    res.status(201).json({ success: true, data, message: 'Đề xuất lưu trữ lớp đã được gửi, chờ quản trị viên duyệt' });
  } catch (e) { next(e); }
});

// ── Students in class ──
router.get('/classes/:classId/students', requireScopedAccess({
  resourceType: 'teacher_class',
  action: 'read',
  resourceId: { source: 'params', field: 'classId' },
}), async (req, res, next) => {
  try {
    const data = await teacherService.getStudentsInClass(userId(req), req.params.classId);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/classes/:classId/students', requireScopedAccess({
  resourceType: 'teacher_class',
  action: 'update',
  resourceId: { source: 'params', field: 'classId' },
}), async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email là bắt buộc' });
    const data = await teacherService.requestAddStudent(userId(req), req.params.classId, email);
    res.status(201).json({ success: true, data, message: 'Đề xuất thêm học sinh đã được gửi, chờ quản trị viên duyệt' });
  } catch (e) { next(e); }
});

router.delete('/classes/:classId/students/:studentId', requireScopedAccess({
  resourceType: 'teacher_class',
  action: 'update',
  resourceId: { source: 'params', field: 'classId' },
}), requireScopedAccess({
  resourceType: 'student',
  action: 'update',
  resourceId: { source: 'params', field: 'studentId' },
}), async (req, res, next) => {
  try {
    const data = await teacherService.requestRemoveStudent(userId(req), req.params.classId, req.params.studentId);
    res.status(201).json({ success: true, data, message: 'Đề xuất xóa học sinh khỏi lớp đã được gửi, chờ quản trị viên duyệt' });
  } catch (e) { next(e); }
});

// ── All students across classes ──
router.get('/students', async (req, res, next) => {
  try {
    const data = await teacherService.getAllStudents(userId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ── Assignments ──
router.get('/assignments', async (req, res, next) => {
  try {
    const { status, class_id } = req.query;
    const data = await teacherService.getAssignments(userId(req), status as string, class_id as string);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/assignments', requireScopedAccess({
  resourceType: 'teacher_class',
  action: 'create',
  resourceId: { source: 'body', field: 'class_id' },
}), async (req, res, next) => {
  try {
    const data = await teacherService.createAssignment(userId(req), req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/assignments/:id', requireScopedAccess({
  resourceType: 'teacher_assignment',
  action: 'read',
  resourceId: { source: 'params', field: 'id' },
}), async (req, res, next) => {
  try {
    const data = await teacherService.getAssignment(userId(req), req.params.id);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.put('/assignments/:id', requireScopedAccess({
  resourceType: 'teacher_assignment',
  action: 'update',
  resourceId: { source: 'params', field: 'id' },
}), async (req, res, next) => {
  try {
    const data = await teacherService.updateAssignment(userId(req), req.params.id, req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.delete('/assignments/:id', requireScopedAccess({
  resourceType: 'teacher_assignment',
  action: 'delete',
  resourceId: { source: 'params', field: 'id' },
}), async (req, res, next) => {
  try {
    await teacherService.deleteAssignment(userId(req), req.params.id);
    res.json({ success: true, message: 'Đã xóa bài tập' });
  } catch (e) { next(e); }
});

// ── Submissions & Grading ──
router.get('/assignments/:id/submissions', requireScopedAccess({
  resourceType: 'teacher_assignment',
  action: 'read',
  resourceId: { source: 'params', field: 'id' },
}), async (req, res, next) => {
  try {
    const data = await teacherService.getSubmissions(userId(req), req.params.id);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/submissions/:id/attachments', async (req, res, next) => {
  try {
    const data = await teacherService.getSubmissionAttachments(userId(req), req.params.id);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.put('/submissions/:id/grade', async (req, res, next) => {
  try {
    const data = await teacherService.gradeSubmission(userId(req), req.params.id, req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ── Gradebook ──
router.get('/gradebook', async (req, res, next) => {
  try {
    const { class_id, student_id } = req.query;
    const data = await teacherService.getGradebookSummary(userId(req), class_id as string | undefined, student_id as string | undefined);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/gradebook/students/:studentId', async (req, res, next) => {
  try {
    const data = await teacherService.getStudentGradebookDetail(userId(req), req.params.studentId);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/classes/:classId/gradebook', requireScopedAccess({
  resourceType: 'teacher_class',
  action: 'read',
  resourceId: { source: 'params', field: 'classId' },
}), async (req, res, next) => {
  try {
    const data = await teacherService.getGradebookSummary(userId(req), req.params.classId, req.query.student_id as string | undefined);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ── Attendance bulk update ──
router.put('/classes/:classId/attendance', requireScopedAccess({
  resourceType: 'teacher_class',
  action: 'update',
  resourceId: { source: 'params', field: 'classId' },
}), async (req, res, next) => {
  try {
    const { date, records } = req.body;
    if (!date || !records || !Array.isArray(records)) {
      throw new ValidationError('date và records là bắt buộc');
    }

    const cls = await teacherClassRepository.findById(req.params.classId);
    if (!cls) {
      throw new ValidationError('Không tìm thấy lớp học');
    }

    const classStudentIds = (cls as any).student_ids.map((id: any) => String(id));
    const results = await attendanceService.applyClassAttendanceUpdate({
      classId: req.params.classId,
      studentIdsInClass: classStudentIds,
      date,
      records,
      actor: { id: userId(req), role: 'teacher' },
    });

    await auditService.recordFromRequest(req, {
      action: 'teacher.attendance.update',
      resourceType: 'teacher_class',
      resourceId: req.params.classId,
      before: null,
      after: { date, record_count: records.length },
      result: 'success',
      metadata: { class_id: req.params.classId, date },
    });

    res.json({ success: true, data: results, message: 'Đã cập nhật điểm danh' });
  } catch (e) { next(e); }
});

// ── Analytics ──
router.get('/analytics', async (req, res, next) => {
  try {
    const data = await teacherService.getAnalytics(userId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ── My Proposals ──
router.get('/proposals', async (req, res, next) => {
  try {
    const { status } = req.query;
    const data = await teacherService.getMyProposals(userId(req), status as string);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

export default router;
