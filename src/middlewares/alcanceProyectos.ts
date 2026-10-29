// Alcance de un SOCIO: solo consulta, y solo los proyectos que tiene asignados.
//
// El authorize() de cada ruta decide QUÉ puede ver un rol; esto decide DE QUÉ
// proyecto. Para un SOCIO toda consulta tiene que nombrar un proyecto suyo:
// sin proyecto, los listados devolverían todos los del negocio. Para los demás
// roles estos middlewares no hacen nada.
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { ApiError } from './errorHandler';

export const ROL_SOCIO = 'SOCIO';

export const esSocio = (req: Request) => req.user?.role === ROL_SOCIO;

/** Ids de los proyectos que el usuario tiene asignados como socio. */
export async function proyectosDelSocio(userId: string): Promise<string[]> {
  const filas = await prisma.proyectoSocio.findMany({ where: { userId }, select: { projectId: true } });
  return filas.map(f => f.projectId);
}

async function exigirProyecto(req: Request, projectId: unknown) {
  // Un ?projectId repetido llega como arreglo: se rechaza igual que si faltara.
  if (typeof projectId !== 'string' || !projectId) throw new ApiError(400, 'Elige un proyecto');
  const permitidos = await proyectosDelSocio(req.user!.userId);
  if (!permitidos.includes(projectId)) throw new ApiError(403, 'No tienes acceso a este proyecto');
}

// Express 4 no atrapa promesas rechazadas: el error se pasa a next a mano.
const middleware = (fn: (req: Request) => Promise<void>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!esSocio(req)) return next();
    fn(req).then(() => next(), next);
  };

/** El proyecto viene en la URL (`/proyecto/:projectId`) o en el query (`?projectId=`). */
export const soloProyectoDelSocio = (origen: 'params' | 'query' = 'query', campo = 'projectId') =>
  middleware(req => exigirProyecto(req, origen === 'params' ? req.params[campo] : req.query[campo]));

/** Para `/lots/:id`: el proyecto es el del lote. */
export const soloLoteDelSocio = (campo = 'id') => middleware(async req => {
  const lote = await prisma.lot.findUnique({ where: { id: req.params[campo] }, select: { projectId: true } });
  if (!lote) throw new ApiError(404, 'Lote no encontrado');
  await exigirProyecto(req, lote.projectId);
});
