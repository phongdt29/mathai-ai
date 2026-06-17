import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validate } from '../middleware/validate';
import { fraudSignalService } from '../services/fraud-signal.service';
import { successResponse } from '../utils/response';

const router = Router();

const listSignalsSchema = z.object({
  query: z.object({
    status: z.enum(['pending_review', 'reviewed', 'dismissed', 'resolved']).optional(),
    student_id: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
    source_type: z.enum(['solver', 'chat', 'ai_log', 'assessment', 'manual', 'system']).optional(),
    signal_type: z.enum([
      'rapid_repeated_solver_requests',
      'high_full_solution_dependency',
      'solver_usage_near_assessment',
      'repeated_flagged_safety_events',
      'rapid_assessment_submission',
      'abnormal_score_jump',
      'duplicate_answer_pattern',
      'excessive_answer_changes',
      'other_risk_signal',
    ]).optional(),
    limit: z.coerce.number().int().min(1).max(250).optional(),
  }),
});

const reviewSignalSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/),
  }),
  body: z.object({
    decision: z.enum(['reviewed', 'dismissed', 'resolved']),
    note: z.string().max(500).optional(),
  }),
});

router.use(authenticate, requireRole('admin'));

router.get('/signals', validate(listSignalsSchema), async (req, res, next) => {
  try {
    const signals = await fraudSignalService.listReviewSignals({
      status: req.query.status as any,
      studentId: req.query.student_id as string | undefined,
      sourceType: req.query.source_type as any,
      signalType: req.query.signal_type as any,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    successResponse(res, signals, 'Lấy danh sách tín hiệu cần review thành công');
  } catch (error) {
    next(error);
  }
});

router.post('/signals/:id/review', validate(reviewSignalSchema), async (req, res, next) => {
  try {
    const signal = await fraudSignalService.reviewSignal({
      signalId: req.params.id,
      reviewerId: String(req.user!.id),
      reviewerRole: req.user!.role,
      decision: req.body.decision,
      note: req.body.note ?? null,
    });
    successResponse(res, signal, 'Cập nhật quyết định review tín hiệu thành công');
  } catch (error) {
    next(error);
  }
});

export default router;
