import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { assessmentController } from '../controllers/assessment.controller';
import {
  assessmentIdSchema,
  generateAssessmentSchema,
  saveAnswerSchema,
  startAttemptSchema,
  submitAttemptSchema,
} from '../validators/assessment.validator';

const router = Router();

router.get(
  '/',
  authenticate,
  assessmentController.list.bind(assessmentController)
);
router.post(
  '/classify',
  authenticate,
  assessmentController.classifyStudent.bind(assessmentController)
);
router.post(
  '/generate',
  authenticate,
  validate(generateAssessmentSchema),
  assessmentController.generate.bind(assessmentController)
);
router.get(
  '/latest-result',
  authenticate,
  assessmentController.getLatestResult.bind(assessmentController)
);
router.get(
  '/:id',
  authenticate,
  validate(assessmentIdSchema),
  assessmentController.getDetail.bind(assessmentController)
);
router.post(
  '/:id/start',
  authenticate,
  validate(startAttemptSchema),
  assessmentController.startAttempt.bind(assessmentController)
);
router.post(
  '/:id/attempts/:attemptId/answers',
  authenticate,
  validate(saveAnswerSchema),
  assessmentController.saveAnswer.bind(assessmentController)
);
router.post(
  '/:id/attempts/:attemptId/submit',
  authenticate,
  validate(submitAttemptSchema),
  assessmentController.submitAttempt.bind(assessmentController)
);
router.get(
  '/:id/result',
  authenticate,
  validate(assessmentIdSchema),
  assessmentController.getResult.bind(assessmentController)
);

export default router;
