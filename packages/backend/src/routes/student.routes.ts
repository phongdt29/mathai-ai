import { Router } from "express";
import { studentController } from "../controllers/student.controller";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { validate } from "../middleware/validate";
import {
	submitAssignmentSchema,
	updateProfileSchema,
	updateThemeSchema,
} from "../validators/student.validator";
import studentAssignmentAttachmentRoutes from "./student-assignment-attachment.routes";

const router = Router();

router.use(authenticate, requireRole("student"));

router.get("/profile", studentController.getProfile.bind(studentController));
router.put(
	"/profile",
	validate(updateProfileSchema),
	studentController.updateProfile.bind(studentController),
);
router.get("/theme", studentController.getTheme.bind(studentController));
router.put(
	"/theme",
	validate(updateThemeSchema),
	studentController.updateTheme.bind(studentController),
);
router.get("/tutors", studentController.getTutors.bind(studentController));
router.get(
	"/personalization",
	studentController.getPersonalization.bind(studentController),
);
router.get(
	"/assignments",
	studentController.listAssignments.bind(studentController),
);
router.get(
	"/assignments/:id",
	studentController.getAssignment.bind(studentController),
);
router.post(
	"/assignments/:id/submit",
	validate(submitAssignmentSchema),
	studentController.submitAssignment.bind(studentController),
);
router.get(
	"/me/assignments/:id/submission-history",
	studentController.getSubmissionHistory.bind(studentController),
);
router.put(
	"/select-tutor",
	studentController.selectTutor.bind(studentController),
);

// ── Assignment attachment routes ────────────────────────────────────────
router.use(studentAssignmentAttachmentRoutes);

export default router;
