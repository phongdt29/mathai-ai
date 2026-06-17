import { NextFunction, Request, Response } from 'express';
import { contentLibraryService } from '../services/content-library.service';
import { successResponse } from '../utils/response';

export class ContentLibraryController {
  public async generateCurriculumTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.generateCurriculumTemplate(req.user!, req.body);
      successResponse(res, result, 'Tạo curriculum template draft thành công', undefined, 201);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async listCurriculumTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.listCurriculumTemplates(req.query as any, req.user!);
      successResponse(res, result.data, 'Lấy danh sách curriculum templates thành công', {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  public async getCurriculumTemplateDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.getCurriculumTemplateDetail(req.params.id, req.user!);
      successResponse(res, result, 'Lấy chi tiết curriculum template thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async publishCurriculumTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.publishCurriculumTemplate(req.params.id, req.user!);
      successResponse(res, result, 'Publish curriculum template thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async requestPublishCurriculumTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.requestPublishCurriculumTemplate(req.params.id, req.user!);
      successResponse(res, result, 'Gửi yêu cầu publish curriculum template thành công', undefined, 201);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async generateLessonTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.generateLessonTemplate(req.user!, req.body);
      successResponse(res, result, 'Tạo lesson template draft thành công', undefined, 201);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async listLessonTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.listLessonTemplates(req.query as any, req.user!);
      successResponse(res, result.data, 'Lấy danh sách lesson templates thành công', {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  public async getLessonTemplateDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.getLessonTemplateDetail(req.params.id, req.user!);
      successResponse(res, result, 'Lấy chi tiết lesson template thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async updateLessonTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.updateLessonTemplate(req.params.id, req.user!, req.body);
      successResponse(res, result, 'Cap nhat lesson template thanh cong');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async publishLessonTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.publishLessonTemplate(req.params.id, req.user!);
      successResponse(res, result, 'Publish lesson template thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async requestPublishLessonTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.requestPublishLessonTemplate(req.params.id, req.user!);
      successResponse(res, result, 'Gửi yêu cầu publish lesson template thành công', undefined, 201);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async createAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.createAssignment(req.user!, req.body);
      successResponse(res, result, 'Tạo content assignment thành công', undefined, 201);
    } catch (error: unknown) {
      next(error);
    }
  }

  public async listAssignments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.listAssignments(req.user!, req.query as any);
      successResponse(res, result.data, 'Lấy danh sách content assignments thành công', {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  public async getAssignmentDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.getAssignmentDetail(req.params.id, req.user!);
      successResponse(res, result, 'Lấy chi tiết content assignment thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async updateAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.updateAssignment(req.params.id, req.user!, req.body);
      successResponse(res, result, 'Cap nhat content assignment thanh cong');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async pauseAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.pauseAssignment(req.params.id, req.user!);
      successResponse(res, result, 'Pause content assignment thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async activateAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.activateAssignment(req.params.id, req.user!);
      successResponse(res, result, 'Activate content assignment thành công');
    } catch (error: unknown) {
      next(error);
    }
  }

  public async archiveAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await contentLibraryService.archiveAssignment(req.params.id, req.user!);
      successResponse(res, result, 'Archive content assignment thành công');
    } catch (error: unknown) {
      next(error);
    }
  }
}

export const contentLibraryController = new ContentLibraryController();
export default contentLibraryController;
