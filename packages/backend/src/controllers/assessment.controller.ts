
import { NextFunction, Request, Response } from 'express';
import { assessmentService } from '../services/assessment.service';
import { classificationService } from '../services/classification.service';
import { getStudentProfileId } from '../utils/helpers';
import { successResponse } from '../utils/response';

export class AssessmentController {
  public async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = await getStudentProfileId(String(req.user!.id));
      const result = await assessmentService.listAssessments(studentId);
      successResponse(res, result, 'Lấy danh sách bài đánh giá thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = await getStudentProfileId(String(req.user!.id));
      const result = await assessmentService.generateDiagnostic(studentId, req.body);
      successResponse(res, result, 'Tạo bài đánh giá thành công', undefined, 201);
    } catch (error: unknown) {
      // Temporarily expose error details for debugging
      if (error instanceof Error) {
        console.error('[assessment.generate] Error:', error.message, error.stack);
      }
      next(error);
    }
  }

  public async getDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = await getStudentProfileId(String(req.user!.id));
      const assessmentId = req.params.id;
      const result = await assessmentService.getAssessmentDetail(assessmentId, studentId);
      successResponse(res, result, 'Lấy chi tiết bài đánh giá thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async startAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = await getStudentProfileId(String(req.user!.id));
      const assessmentId = req.params.id;
      const result = await assessmentService.startAttempt(assessmentId, studentId);
      successResponse(res, result, 'Bắt đầu làm bài đánh giá thành công', undefined, 201);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async saveAnswer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = await getStudentProfileId(String(req.user!.id));
      const attemptId = req.params.attemptId;
      const assessmentId = req.params.id;

      await assessmentService.getAssessmentDetail(assessmentId, studentId);

      const result = await assessmentService.saveAnswer(attemptId, studentId, req.body);
      successResponse(res, result, 'Lưu câu trả lời thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async submitAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = await getStudentProfileId(String(req.user!.id));
      const assessmentId = req.params.id;
      const attemptId = req.params.attemptId;
      const result = await assessmentService.submitAttempt(assessmentId, attemptId, studentId);
      successResponse(res, result, 'Nộp bài đánh giá thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async getResult(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = await getStudentProfileId(String(req.user!.id));
      const assessmentId = req.params.id;
      const result = await assessmentService.getAssessmentResult(assessmentId, studentId);
      successResponse(res, result, 'Lấy kết quả bài đánh giá thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async getLatestResult(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = await getStudentProfileId(String(req.user!.id));
      const result = await assessmentService.getLatestResult(studentId);
      successResponse(res, result, 'Lấy kết quả đánh giá gần nhất thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async classifyStudent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = await getStudentProfileId(String(req.user!.id));
      const result = await classificationService.classifyStudent(studentId);
      successResponse(res, result, 'Phân loại học lực thành công');
    } catch (error: unknown) {
      next(error);
    }
  }
}

export const assessmentController = new AssessmentController();

export default assessmentController;
