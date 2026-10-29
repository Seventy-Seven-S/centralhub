import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, authorize } from '../middlewares/auth';
import { soloProyectoDelSocio } from '../middlewares/alcanceProyectos';
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

// Los tres roles del equipo ven proyectos (tarjetas, selector de proyecto y
// detalle). Al AGENT se le quitan los ingresos y egresos en el controller,
// porque su pantalla no los muestra — ver cifrasParaRol.
// El SOCIO también los consulta, pero solo los suyos: el listado se le filtra
// en el controller y el detalle de uno ajeno responde 403.
const lectura = authorize('ADMIN', 'MANAGER', 'AGENT', 'SOCIO');

router.get('/', authenticate, lectura, getAllProjects);
router.get('/:id', authenticate, lectura, soloProyectoDelSocio('params', 'id'), getProjectById);

// Acuerdo de reparto con el dueño del terreno: es el trato del arquitecto, no
// un dato operativo. Ninguna pantalla lo muestra a las secretarias ni a los
// asesores, así que leerlo y pactarlo es solo del ADMIN.
router.get('/:id/reparto', authenticate, authorize('ADMIN'), getReparto);
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
