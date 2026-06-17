import type { NextFunction, Request, Response } from "express";
import { personalizationService } from "../services/personalization.service";
import { studentService } from "../services/student.service";
import { studentAssignmentService } from "../services/student-assignment.service";
import { getStudentProfileId } from "../utils/helpers";
import { successResponse } from "../utils/response";

export class StudentController {
	public async getProfile(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const result = await studentService.getProfile(String(req.user!.id));
			successResponse(res, result, "Lấy hồ sơ học sinh thành công");
		} catch (error: unknown) {
			next(error);
		}
	}

	public async updateProfile(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const result = await studentService.updateProfile(
				String(req.user!.id),
				req.body,
			);
			successResponse(res, result, "Cập nhật hồ sơ học sinh thành công");
		} catch (error: unknown) {
			next(error);
		}
	}

	public async getTheme(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const result = await studentService.getTheme(String(req.user!.id));
			successResponse(res, result, "Lấy giao diện học sinh thành công");
		} catch (error: unknown) {
			next(error);
		}
	}

	public async updateTheme(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const result = await studentService.updateTheme(
				String(req.user!.id),
				req.body,
			);
			successResponse(res, result, "Cập nhật giao diện học sinh thành công");
		} catch (error: unknown) {
			next(error);
		}
	}

	public async getTutors(
		_req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const result = await studentService.getAvailableTutors();
			successResponse(res, result, "Lấy danh sách tutor thành công");
		} catch (error: unknown) {
			next(error);
		}
	}

	public async selectTutor(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const tutorId = req.body.tutor_id;
			if (!tutorId || typeof tutorId !== "string") {
				res.status(400).json({
					success: false,
					error: "tutor_id là bắt buộc và phải là chuỗi",
				});
				return;
			}
			const result = await studentService.selectTutor(
				String(req.user!.id),
				tutorId,
			);
			successResponse(res, result, "Chọn tutor thành công");
		} catch (error: unknown) {
			next(error);
		}
	}

	public async getPersonalization(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const studentId = await getStudentProfileId(String(req.user!.id));
			const result = await personalizationService.getPersonalization(studentId);
			successResponse(res, result, "Lấy cá nhân hóa thành công");
		} catch (error: unknown) {
			next(error);
		}
	}

	public async listAssignments(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const hasListOptions = [
				"page",
				"limit",
				"status",
				"class_id",
				"submission_status",
			].some((key) => req.query[key] !== undefined);

			if (!hasListOptions) {
				const result = await studentAssignmentService.listAssignments(
					String(req.user!.id),
				);
				successResponse(res, result, "Lấy danh sách bài tập thành công");
				return;
			}

			const submissionStatus =
				typeof req.query.submission_status === "string" &&
				["pending", "submitted", "graded"].includes(req.query.submission_status)
					? (req.query.submission_status as "pending" | "submitted" | "graded")
					: undefined;
			const result = await studentAssignmentService.listAssignmentsPage(
				String(req.user!.id),
				{
					page:
						typeof req.query.page === "string"
							? Number(req.query.page)
							: undefined,
					limit:
						typeof req.query.limit === "string"
							? Number(req.query.limit)
							: undefined,
					status:
						typeof req.query.status === "string" && req.query.status.length > 0
							? req.query.status
							: undefined,
					class_id:
						typeof req.query.class_id === "string" &&
						req.query.class_id.length > 0
							? req.query.class_id
							: undefined,
					submission_status: submissionStatus,
				},
			);
			successResponse(res, result, "Lấy danh sách bài tập thành công");
		} catch (error: unknown) {
			next(error);
		}
	}

	public async getAssignment(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const result = await studentAssignmentService.getAssignment(
				String(req.user!.id),
				req.params.id,
			);
			successResponse(res, result, "L?y chi ti?t b?i t?p th?nh c?ng");
		} catch (error: unknown) {
			next(error);
		}
	}

	public async submitAssignment(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const result = await studentAssignmentService.submitAssignment(
				String(req.user!.id),
				req.params.id,
				req.body,
			);
			successResponse(res, result, "N?p b?i t?p th?nh c?ng");
		} catch (error: unknown) {
			next(error);
		}
	}

	public async getSubmissionHistory(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const result = await studentAssignmentService.getSubmissionHistory(
				String(req.user!.id),
				req.params.id,
			);
			successResponse(res, result, "Lấy lịch sử nộp bài thành công");
		} catch (error: unknown) {
			next(error);
		}
	}
}

export const studentController = new StudentController();

export default studentController;
