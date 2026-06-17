import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { uploadSolverImage } from '../middleware/upload';
import { ocrRateLimit } from '../middleware/rate-limit';
import { getStudentProfileId } from '../utils/helpers';
import { successResponse } from '../utils/response';
import { solverService } from '../services/solver.service';
import { solverRequestRepository } from '../models/solver.model';

const router = Router();

router.use(authenticate);

// POST /api/solver/solve - Giải bài toán
router.post('/solve', async (req, res, next) => {
  try {
    const studentId = await getStudentProfileId(String(req.user!.id));
    const { problem_text, stage, previous_hints, session_id } = req.body;

    if (!problem_text || typeof problem_text !== 'string') {
      return res.status(400).json({ success: false, error: 'problem_text là bắt buộc' });
    }

    const result = await solverService.solve(
      studentId,
      session_id || null,
      problem_text,
      stage || 'hint',
      previous_hints || []
    );
    successResponse(res, result, 'Giải bài toán thành công');
  } catch (error: unknown) {
    next(error);
  }
});

// POST /api/solver/parse-image - Upload ảnh đề toán, OCR nếu AI multimodal khả dụng
router.post('/parse-image', uploadSolverImage, ocrRateLimit, async (req, res, next) => {
  try {
    const studentId = await getStudentProfileId(String(req.user!.id));

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'image là bắt buộc' });
    }

    const imageUrl = `/uploads/solver/${req.file.filename}`;
    const result = await solverService.parseImage(
      studentId,
      imageUrl,
      req.file.path,
      req.file.mimetype
    );

    successResponse(res, result, result.message);
  } catch (error: unknown) {
    next(error);
  }
});

// GET /api/solver/history - Lịch sử giải bài
router.get('/history', async (req, res, next) => {
  try {
    const studentId = await getStudentProfileId(String(req.user!.id));
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const result = await solverRequestRepository.findWithPagination(
      { student_id: studentId } as any,
      page,
      limit,
      'createdAt',
      'desc'
    );
    res.json({
      success: true,
      data: result.data,
      meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages },
    });
  } catch (error: unknown) {
    next(error);
  }
});
// GET /api/solver/examples - Gợi ý bài toán ngẫu nhiên từ AI
router.get('/examples', async (req, res, next) => {
  try {
    const gradeLevel = Number(req.query.grade_level) || 10;
    const count = Math.min(Number(req.query.count) || 4, 6);
    const result = await solverService.generateExamples(gradeLevel, count);
    successResponse(res, result, 'Tạo ví dụ thành công');
  } catch (error: unknown) {
    next(error);
  }
});

export default router;
