import { Router } from 'express';
import { curriculumController } from '../controllers/curriculum.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  curriculumIdSchema,
  generateCurriculumSchema,
  moduleIdSchema,
} from '../validators/curriculum.validator';

const router = Router();

router.post('/generate', authenticate, validate(generateCurriculumSchema), curriculumController.generate);
router.get('/', authenticate, curriculumController.list);
router.get('/active', authenticate, curriculumController.getActive);
router.get('/:id', authenticate, validate(curriculumIdSchema), curriculumController.getDetail);
router.get('/:id/modules/:moduleId', authenticate, validate(moduleIdSchema), curriculumController.getModuleDetail);

export default router;
