import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import {
	studentProgressRepository,
	topicMasteryRepository,
} from "../models/progress.model";
import { pointService } from "../services/point.service";
import { getStudentProfileId } from "../utils/helpers";
import { successResponse } from "../utils/response";

const router = Router();

router.use(authenticate, requireRole("student"));

// GET /api/dashboard/progress - Tiến độ học tập
router.get("/progress", async (req, res, next) => {
	try {
		const studentId = await getStudentProfileId(String(req.user!.id));
		const progress = await studentProgressRepository.findOne({
			student_id: studentId,
		} as any);
		successResponse(res, progress, "Lấy tiến độ học tập thành công");
	} catch (error: unknown) {
		next(error);
	}
});

// GET /api/dashboard/stats - Thống kê học tập
router.get("/stats", async (req, res, next) => {
	try {
		const studentId = await getStudentProfileId(String(req.user!.id));
		const progress = await studentProgressRepository.findOne({
			student_id: studentId,
		} as any);
		const pointSummary = await pointService.getStudentPointSummary(studentId);
		const stats = {
			total_lessons: progress?.total_lessons ?? 0,
			completed_lessons: progress?.completed_lessons ?? 0,
			completion_percentage: progress?.completion_percentage ?? 0,
			average_quiz_score: progress?.average_quiz_score ?? null,
			total_study_time_minutes: progress?.total_study_time_minutes ?? 0,
			current_streak_days: progress?.current_streak_days ?? 0,
			longest_streak_days: progress?.longest_streak_days ?? 0,
			points: pointSummary,
		};
		successResponse(res, stats, "Lấy thống kê học tập thành công");
	} catch (error: unknown) {
		next(error);
	}
});

// GET /api/dashboard/points - Điểm thưởng và năng lực
router.get("/points", async (req, res, next) => {
	try {
		const studentId = await getStudentProfileId(String(req.user!.id));
		const points = await pointService.getStudentPointHistory(studentId);
		successResponse(res, points, "Lấy điểm thưởng và năng lực thành công");
	} catch (error: unknown) {
		next(error);
	}
});

// GET /api/dashboard/points/summary - Điểm thưởng compact cho dashboard header
router.get("/points/summary", async (req, res, next) => {
	try {
		const studentId = await getStudentProfileId(String(req.user!.id));
		const points = await pointService.getStudentPointHeaderSummary(studentId);
		successResponse(res, points, "Lấy tổng điểm thưởng thành công");
	} catch (error: unknown) {
		next(error);
	}
});

// GET /api/dashboard/mastery - Mức độ thành thạo theo chủ đề
router.get("/mastery", async (req, res, next) => {
	try {
		const studentId = await getStudentProfileId(String(req.user!.id));
		const mastery = await topicMasteryRepository.findAll({
			student_id: studentId,
		} as any);
		successResponse(res, mastery, "Lấy mức độ thành thạo thành công");
	} catch (error: unknown) {
		next(error);
	}
});

export default router;
