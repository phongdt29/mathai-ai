import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import crypto from "node:crypto";
import { ocrStorageService } from "../services/ocr-storage.service";
import {
  type IStudentSubmission,
  type ITeacherAssignment,
  type ITeacherClass,
  studentSubmissionRepository,
  teacherAssignmentRepository,
  teacherClassRepository,
} from "../models/teacher.model";
import { StudentProfileRepository } from "../models/student.model";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { successResponse } from "../utils/response";

const router = Router();

// ── Constants ───────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ATTACHMENTS_PER_ASSIGNMENT = 5;

// ── Multer config — memory storage for buffer access ────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype.toLowerCase();
    if (mime.startsWith("image/") || mime === "application/pdf") {
      cb(null, true);
    } else {
      cb(new ValidationError("Chỉ chấp nhận file ảnh (image/*) hoặc PDF (application/pdf)"));
    }
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────

const studentProfileRepository = new StudentProfileRepository();

function entityId(entity: { id?: unknown; _id?: unknown }): string {
  return String(entity.id ?? entity._id);
}

function objectIdToString(value: unknown): string {
  if (value && typeof value === "object" && "_id" in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}

/**
 * Verify that the student (by userId) belongs to the class that owns the assignment.
 * Returns { assignment, teacherClass, studentId } or throws ForbiddenError/NotFoundError.
 */
async function verifyStudentAssignmentAccess(
  userId: string,
  assignmentId: string,
): Promise<{
  assignment: ITeacherAssignment;
  teacherClass: ITeacherClass;
  studentId: string;
}> {
  const profile = await studentProfileRepository.findByUserId(userId);
  if (!profile) {
    throw new NotFoundError("Không tìm thấy hồ sơ học sinh");
  }
  const studentId = entityId(profile);

  const assignment = await teacherAssignmentRepository.findById(assignmentId);
  if (!assignment) {
    throw new NotFoundError("Không tìm thấy bài tập");
  }

  const classId = objectIdToString(assignment.class_id);
  const teacherClass = await teacherClassRepository.findById(classId);
  if (!teacherClass) {
    throw new NotFoundError("Không tìm thấy lớp của bài tập");
  }

  const enrolled = (teacherClass.student_ids ?? []).some(
    (value) => objectIdToString(value) === studentId,
  );
  if (!enrolled) {
    throw new ForbiddenError("Bạn không thuộc lớp được giao bài tập này");
  }

  return { assignment, teacherClass, studentId };
}

// ── POST /me/assignments/:assignmentId/attachments ──────────────────────

router.post(
  "/me/assignments/:assignmentId/attachments",
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { assignmentId } = req.params;
      const userId = String(req.user!.id);

      // 1. Scoped authorization: verify student belongs to class
      const { assignment, studentId } = await verifyStudentAssignmentAccess(userId, assignmentId);

      // 2. Validate file presence
      const file = req.file;
      if (!file) {
        throw new ValidationError("Vui lòng chọn file để upload");
      }

      // 3. Validate MIME type (double-check after multer filter)
      const mime = file.mimetype.toLowerCase();
      if (!mime.startsWith("image/") && mime !== "application/pdf") {
        throw new ValidationError("Chỉ chấp nhận file ảnh (image/*) hoặc PDF (application/pdf)");
      }

      // 4. Validate file size
      if (file.size > MAX_FILE_SIZE) {
        throw new ValidationError("File không được vượt quá 10MB");
      }

      // 5. Check max attachments per assignment
      const existingSubmission = await studentSubmissionRepository.findByAssignmentAndStudent(
        entityId(assignment),
        studentId,
      );
      const currentAttachments = existingSubmission?.attachments ?? [];
      if (currentAttachments.length >= MAX_ATTACHMENTS_PER_ASSIGNMENT) {
        throw new ValidationError(
          `Bài tập chỉ cho phép tối đa ${MAX_ATTACHMENTS_PER_ASSIGNMENT} file đính kèm`,
        );
      }

      // 6. Upload file via OCR storage service with scope="submissions"
      const uploadResult = await ocrStorageService.putImage({
        buffer: file.buffer,
        mimeType: file.mimetype,
        scope: "submissions",
      });

      // 7. Create attachment metadata
      const attachment = {
        attachment_id: crypto.randomUUID(),
        file_url: uploadResult.storage_url,
        file_name: file.originalname,
        mime_type: file.mimetype,
        size_bytes: file.size,
        uploaded_at: new Date(),
      };

      // 8. Upsert submission with new attachment
      if (existingSubmission) {
        await studentSubmissionRepository.model.findByIdAndUpdate(
          entityId(existingSubmission),
          { $push: { attachments: attachment } },
          { new: true },
        );
      } else {
        // Create a new submission record with just the attachment (no content yet)
        await studentSubmissionRepository.create({
          assignment_id: entityId(assignment),
          student_id: studentId,
          content: "",
          attachments: [attachment],
          submitted_at: new Date(),
        } as unknown as Partial<IStudentSubmission>);
      }

      // 9. Return attachment metadata
      successResponse(res, attachment, "Upload file đính kèm thành công", undefined, 201);
    } catch (error) {
      next(error);
    }
  },
);

// ── DELETE /me/assignments/:assignmentId/attachments/:attachmentId ───────

router.delete(
  "/me/assignments/:assignmentId/attachments/:attachmentId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { assignmentId, attachmentId } = req.params;
      const userId = String(req.user!.id);

      // 1. Scoped authorization: verify student belongs to class
      const { assignment, studentId } = await verifyStudentAssignmentAccess(userId, assignmentId);

      // 2. Find the submission
      const submission = await studentSubmissionRepository.findByAssignmentAndStudent(
        entityId(assignment),
        studentId,
      );
      if (!submission) {
        throw new NotFoundError("Không tìm thấy bài nộp");
      }

      // 3. Find the attachment
      const attachmentIndex = submission.attachments.findIndex(
        (a) => a.attachment_id === attachmentId,
      );
      if (attachmentIndex === -1) {
        throw new NotFoundError("Không tìm thấy file đính kèm");
      }

      // 4. Reject deletion if submission is already graded
      if (submission.graded_at != null) {
        throw new AppError(
          "Không thể xoá file đính kèm vì bài đã được chấm điểm",
          422,
        );
      }

      // 5. Get the attachment info for storage cleanup
      const attachment = submission.attachments[attachmentIndex];

      // 6. Remove attachment from submission
      await studentSubmissionRepository.model.findByIdAndUpdate(
        entityId(submission),
        { $pull: { attachments: { attachment_id: attachmentId } } },
        { new: true },
      );

      // 7. Delete file from storage (best-effort, don't fail the request)
      try {
        // Extract storage_key from file_url (remove /uploads/ prefix)
        const storageKey = attachment.file_url.replace(/^\/uploads\//, "");
        await ocrStorageService.delete(storageKey);
      } catch {
        // Storage deletion is best-effort; log but don't fail
      }

      successResponse(res, { deleted: true, attachment_id: attachmentId }, "Xoá file đính kèm thành công");
    } catch (error) {
      next(error);
    }
  },
);

export default router;
