
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { engagementTrackingService } from '../services/engagement.service';
import { attendanceService } from '../services/attendance.service';
import { learningRiskService } from '../services/risk.service';
import { parentMonitoringService } from '../services/parent-monitoring.service';
import { getStudentProfileId } from '../utils/helpers';
import { successResponse } from '../utils/response';

const router = Router();

router.use(authenticate);

// POST /api/engagement/sessions/start - Bắt đầu phiên học
router.post('/sessions/start', async (req, res, next) => {
  try {
    if (!req.body.lesson_id && !req.body.curriculum_id) {
      res.status(400).json({ success: false, error: 'lesson_id hoặc curriculum_id là bắt buộc' });
      return;
    }
    const studentId = await getStudentProfileId(String(req.user!.id));
    const session = await engagementTrackingService.startSession({
      student_id: studentId,
      lesson_id: req.body.lesson_id,
      curriculum_id: req.body.curriculum_id,
    });

    // Notify parents
    if (req.body.lesson_title) {
      parentMonitoringService.notifySessionStart(studentId as any, req.body.lesson_title).catch((err) => console.error('[ParentMonitoring] notifySessionStart error:', err));
    }

    successResponse(res, session, 'Bắt đầu phiên học thành công');
  } catch (error: unknown) {
    next(error);
  }
});

// POST /api/engagement/sessions/:id/end - Kết thúc phiên học
router.post('/sessions/:id/end', async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const session = await engagementTrackingService.endSession(sessionId);

    // Record attendance if lesson_id present
    if (session.lesson_id) {
      await attendanceService.recordAttendance(
        session,
        session.lesson_id,
        req.body.expected_duration_minutes ?? 45
      );
    }

    // Compute risk score
    await learningRiskService.computeRiskScore(session.student_id);

    // Notify parents
    parentMonitoringService.notifySessionComplete(
      session.student_id as any,
      req.body.lesson_title ?? 'N/A',
      Math.round(session.active_duration_seconds / 60),
      Number(session.focus_ratio),
      session.quiz_score ? Number(session.quiz_score) : undefined
    ).catch((err) => console.error('[ParentMonitoring] notifySessionComplete error:', err));

    // Check alerts
    parentMonitoringService.checkAndTriggerAlerts(session.student_id as any).catch((err) => console.error('[ParentMonitoring] checkAndTriggerAlerts error:', err));

    successResponse(res, session, 'Kết thúc phiên học thành công');
  } catch (error: unknown) {
    next(error);
  }
});

// POST /api/engagement/events - Ghi nhận sự kiện tương tác
router.post('/events', async (req, res, next) => {
  try {
    if (!req.body.event_type) {
      res.status(400).json({ success: false, error: 'event_type là bắt buộc' });
      return;
    }
    const event = await engagementTrackingService.trackEvent(req.body);
    successResponse(res, event, 'Ghi nhận sự kiện thành công');
  } catch (error: unknown) {
    next(error);
  }
});

// POST /api/engagement/events/batch - Ghi nhận nhiều sự kiện
router.post('/events/batch', async (req, res, next) => {
  try {
    await engagementTrackingService.trackEvents(req.body.events);
    successResponse(res, null, 'Ghi nhận sự kiện thành công');
  } catch (error: unknown) {
    next(error);
  }
});

// GET /api/engagement/sessions/active - Phiên đang active
router.get('/sessions/active', async (req, res, next) => {
  try {
    const studentId = await getStudentProfileId(String(req.user!.id));
    const session = await engagementTrackingService.getActiveSession(studentId);
    successResponse(res, session, session ? 'Có phiên đang hoạt động' : 'Không có phiên nào');
  } catch (error: unknown) {
    next(error);
  }
});

// GET /api/engagement/sessions/recent - Phiên gần đây
router.get('/sessions/recent', async (req, res, next) => {
  try {
    const studentId = await getStudentProfileId(String(req.user!.id));
    const limit = Number(req.query.limit) || 10;
    const sessions = await engagementTrackingService.getRecentSessions(studentId, limit);
    successResponse(res, sessions, 'Lấy danh sách phiên thành công');
  } catch (error: unknown) {
    next(error);
  }
});

// GET /api/engagement/stats - Thống kê engagement
router.get('/stats', async (req, res, next) => {
  try {
    const studentId = await getStudentProfileId(String(req.user!.id));
    const [avgFocus, avgDuration] = await Promise.all([
      engagementTrackingService.getAverageFocusRatio(studentId),
      engagementTrackingService.getAverageActiveDuration(studentId),
    ]);
    successResponse(res, {
      avg_focus_ratio: avgFocus,
      avg_active_minutes: avgDuration,
    }, 'Lấy thống kê thành công');
  } catch (error: unknown) {
    next(error);
  }
});

export default router;
