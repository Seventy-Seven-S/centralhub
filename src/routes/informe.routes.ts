import { Router, type Request, type Response } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/errorHandler';
import { soloProyectoDelSocio } from '../middlewares/alcanceProyectos';
import { informeDelProyecto, excelDelInforme } from '../services/informe.service';

const router = Router();

router.use(authenticate);

// Ingresos y egresos por mes de un proyecto. Son cifras del negocio: ADMIN, y
// el SOCIO de ese proyecto (es justo lo que viene a consultar).
const lectores = [authorize('ADMIN', 'SOCIO'), soloProyectoDelSocio('params')];

router.get('/proyecto/:projectId', ...lectores, asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await informeDelProyecto(req.params.projectId) });
}));

router.get('/proyecto/:projectId/excel', ...lectores, asyncHandler(async (req: Request, res: Response) => {
  const informe = await informeDelProyecto(req.params.projectId);
  const hoy = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="informe-${informe.proyecto.code}-${hoy}.xlsx"`);
  res.send(excelDelInforme(informe));
}));

export default router;
