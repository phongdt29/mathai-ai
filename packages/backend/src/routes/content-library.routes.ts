import { Router } from "express";
import { contentLibraryController } from "../controllers/content-library.controller";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { validate } from "../middleware/validate";
import {
	contentAssignmentIdSchema,
	contentTemplateIdSchema,
	createContentAssignmentSchema,
	generateCurriculumTemplateSchema,
	generateLessonTemplateSchema,
	listContentAssignmentsSchema,
	listCurriculumTemplatesSchema,
	listLessonTemplatesSchema,
	requestPublishTemplateSchema,
	updateContentAssignmentSchema,
	updateLessonTemplateSchema,
} from "../validators/content-library.validator";

const router = Router();

router.use(authenticate, requireRole("teacher", "admin"));

router.post(
	"/assignments",
	validate(createContentAssignmentSchema),
	contentLibraryController.createAssignment,
);
router.get(
	"/assignments",
	validate(listContentAssignmentsSchema),
	contentLibraryController.listAssignments,
);
router.patch(
	"/assignments/:id",
	validate(updateContentAssignmentSchema),
	contentLibraryController.updateAssignment,
);
router.get(
	"/assignments/:id",
	validate(contentAssignmentIdSchema),
	contentLibraryController.getAssignmentDetail,
);
router.put(
	"/assignments/:id/pause",
	validate(contentAssignmentIdSchema),
	contentLibraryController.pauseAssignment,
);
router.put(
	"/assignments/:id/activate",
	validate(contentAssignmentIdSchema),
	contentLibraryController.activateAssignment,
);
router.delete(
	"/assignments/:id",
	validate(contentAssignmentIdSchema),
	contentLibraryController.archiveAssignment,
);

router.post(
	"/curriculum-templates/generate",
	validate(generateCurriculumTemplateSchema),
	contentLibraryController.generateCurriculumTemplate,
);
router.get(
	"/curriculum-templates",
	validate(listCurriculumTemplatesSchema),
	contentLibraryController.listCurriculumTemplates,
);
router.get(
	"/curriculum-templates/:id",
	validate(contentTemplateIdSchema),
	contentLibraryController.getCurriculumTemplateDetail,
);
router.post(
	"/curriculum-templates/:id/publish",
	validate(contentTemplateIdSchema),
	contentLibraryController.publishCurriculumTemplate,
);
router.post(
	"/curriculum-templates/:id/request-publish",
	validate(requestPublishTemplateSchema),
	contentLibraryController.requestPublishCurriculumTemplate,
);

router.post(
	"/lesson-templates/generate",
	validate(generateLessonTemplateSchema),
	contentLibraryController.generateLessonTemplate,
);
router.get(
	"/lesson-templates",
	validate(listLessonTemplatesSchema),
	contentLibraryController.listLessonTemplates,
);
router.get(
	"/lesson-templates/:id",
	validate(contentTemplateIdSchema),
	contentLibraryController.getLessonTemplateDetail,
);
router.patch(
	"/lesson-templates/:id",
	validate(updateLessonTemplateSchema),
	contentLibraryController.updateLessonTemplate,
);
router.post(
	"/lesson-templates/:id/publish",
	validate(contentTemplateIdSchema),
	contentLibraryController.publishLessonTemplate,
);
router.post(
	"/lesson-templates/:id/request-publish",
	validate(requestPublishTemplateSchema),
	contentLibraryController.requestPublishLessonTemplate,
);

export default router;
