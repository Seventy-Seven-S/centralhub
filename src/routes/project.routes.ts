import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, authorize } from '../middlewares/auth';
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getReparto,
  putReparto,
} from '../controllers/project.controller';

const router = Router();

router.get('/', authenticate, getAllProjects);
router.get('/:id', authenticate, getProjectById);

// Acuerdo de reparto con el dueño del terreno. Leerlo lo puede cualquiera que
// vea el proyecto; pactarlo o cambiarlo es del ADMIN — es el trato, no un dato
// operativo. Van ANTES de /:id genéricas por el orden de rutas de Express.
router.get('/:id/reparto', authenticate, getReparto);
router.put('/:id/reparto', authenticate, authorize('ADMIN'), putReparto);

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
  ],
  createProject
);

router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), updateProject);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteProject);

export default router;
