import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, authorize } from '../middlewares/auth';
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
} from '../controllers/project.controller';

const router = Router();

router.get('/', authenticate, getAllProjects);
router.get('/:id', authenticate, getProjectById);

router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  [
    body('code').trim().notEmpty().withMessage('Project code is required'),
    body('name').trim().notEmpty().withMessage('Project name is required'),
    body('location').trim().notEmpty().withMessage('Location is required'),
    body('city').trim().notEmpty().withMessage('City is required'),
    body('state').trim().notEmpty().withMessage('State is required'),
    body('totalLots').isInt({ min: 1 }).withMessage('Total lots must be at least 1'),
  ],
  createProject
);

router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), updateProject);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteProject);

export default router;
