
import { NextFunction, Request, Response } from 'express';
import { curriculumService } from '../services/curriculum.service';
import { getStudentProfileId } from '../utils/helpers';
import { successResponse } from '../utils/response';

export class CurriculumController {
  public async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = await getStudentProfileId(String(req.user!.id));
      const result = await curriculumService.generateCurriculum(studentId, req.body);
      successResponse(res, result, 'Tạo giáo trình thành công', undefined, 201);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = await getStudentProfileId(String(req.user!.id));
      const result = await curriculumService.listCurricula(studentId);
      successResponse(res, result, 'Lấy danh sách giáo trình thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async getActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = await getStudentProfileId(String(req.user!.id));
      const result = await curriculumService.getActiveCurriculum(studentId);
      successResponse(res, result, 'Lấy giáo trình đang hoạt động thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async getDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = await getStudentProfileId(String(req.user!.id));
      const curriculumId = req.params.id;
      const result = await curriculumService.getCurriculumDetail(curriculumId, studentId);
      successResponse(res, result, 'Lấy chi tiết giáo trình thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async getModuleDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = await getStudentProfileId(String(req.user!.id));
      const curriculumId = req.params.id;
      const moduleId = req.params.moduleId;
      const result = await curriculumService.getModuleDetail(curriculumId, moduleId, studentId);
      successResponse(res, result, 'Lấy chi tiết module thành công');
    } catch (error: unknown) {
      next(error);
    }
  }
}

export const curriculumController = new CurriculumController();

export default curriculumController;
