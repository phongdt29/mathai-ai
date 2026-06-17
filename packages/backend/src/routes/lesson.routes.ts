import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { recommendationService } from '../services/recommendation.service';
import { lessonService } from '../services/lesson.service';
import { lessonRepository } from '../models/lesson.model';
import { getStudentProfileId } from '../utils/helpers';
import { successResponse } from '../utils/response';

const router = Router();

router.use(authenticate);

// GET /api/lessons - Danh sách bài học theo curriculum
router.get('/', async (req, res, next) => {
  try {
    const studentId = await getStudentProfileId(String(req.user!.id));
    const curriculumId = req.query.curriculum_id as string | undefined;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const filter: any = { student_id: studentId };
    if (curriculumId) filter.curriculum_id = curriculumId;

    const result = await lessonRepository.findWithPagination(filter, page, limit, 'order_index', 'asc');
    res.json({
      success: true,
      data: result.data,
      meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages },
    });
  } catch (error: unknown) {
    next(error);
  }
});

// GET /api/lessons/today-recommendation - Gợi ý học hôm nay (adaptive)
router.get('/today-recommendation', async (req, res, next) => {
  try {
    const studentId = await getStudentProfileId(String(req.user!.id));
    const result = await recommendationService.getAdaptiveRecommendation(studentId);
    successResponse(res, result, 'Lấy gợi ý học hôm nay thành công');
  } catch (error: unknown) {
    next(error);
  }
});

// GET /api/lessons/:id - Chi tiết bài học thuộc học sinh hiện tại
router.get('/:id', async (req, res, next) => {
  try {
    const lesson = await lessonService.getLessonWithExercises(String(req.user!.id), req.params.id);
    successResponse(res, lesson, 'Lấy chi tiết bài học thành công');
  } catch (error: unknown) {
    next(error);
  }
});

// POST /api/lessons/:id/quiz-results - Ghi nhận kết quả quiz/bài tập và cộng điểm idempotent
router.post('/:id/quiz-results', async (req, res, next) => {
  try {
    const result = await lessonService.createQuizResult(String(req.user!.id), req.params.id, req.body);
    successResponse(res, result, 'Ghi nhận kết quả bài học thành công');
  } catch (error: unknown) {
    next(error);
  }
});

// POST /api/lessons/:id/exercises/generate - Tạo bài tập thực tế bằng AI
router.post('/:id/exercises/generate', async (req, res, next) => {
  try {
    const result = await lessonService.generateExercises(
      String(req.user!.id),
      req.params.id,
      Boolean(req.body?.force_regenerate)
    );
    successResponse(
      res,
      result,
      result.source === 'existing'
        ? 'Bài học đã có bài tập, trả về danh sách hiện có'
        : 'Tạo bài tập thực tế bằng AI thành công'
    );
  } catch (error: unknown) {
    next(error);
  }
});

// POST /api/lessons/:id/exercise-attempts/submit - Nộp bài tập thực tế và lưu từng câu trả lời
router.post('/:id/exercise-attempts/submit', async (req, res, next) => {
  try {
    const result = await lessonService.submitExerciseAttempt(String(req.user!.id), req.params.id, req.body);
    successResponse(res, result, 'Nộp bài tập thực tế thành công');
  } catch (error: unknown) {
    next(error);
  }
});

// GET /api/lessons/:id/exercise-attempts/history - Lịch sử làm bài tập thực tế của học sinh hiện tại
router.get('/:id/exercise-attempts/history', async (req, res, next) => {
  try {
    const result = await lessonService.getExerciseAttemptHistory(String(req.user!.id), req.params.id);
    successResponse(res, result, 'Lấy lịch sử bài tập thực tế thành công');
  } catch (error: unknown) {
    next(error);
  }
});

// POST /api/lessons/:id/complete - Đánh dấu hoàn thành bài học thuộc học sinh hiện tại
router.post('/:id/complete', async (req, res, next) => {
  try {
    const updated = await lessonService.completeLesson(String(req.user!.id), req.params.id);
    successResponse(res, updated, 'Hoàn thành bài học thành công');
  } catch (error: unknown) {
    next(error);
  }
});

export default router;
