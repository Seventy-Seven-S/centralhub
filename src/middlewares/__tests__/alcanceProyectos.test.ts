import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    proyectoSocio: { findMany: vi.fn() },
    lot: { findUnique: vi.fn() },
  },
}));
vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));

import { soloProyectoDelSocio, soloLoteDelSocio } from '../alcanceProyectos';

/** Corre el middleware y devuelve con qué se llamó a next (undefined = pasó). */
function correr(mw: any, req: any): Promise<any> {
  return new Promise(resolve => mw(req, {}, (err?: any) => resolve(err)));
}
const socio = (extra: any = {}) => ({ user: { role: 'SOCIO', userId: 's-1' }, params: {}, query: {}, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.proyectoSocio.findMany.mockResolvedValue([{ projectId: 'MON1' }, { projectId: 'VDB' }]);
});

describe('soloProyectoDelSocio', () => {
  it('no toca a los demás roles (ni siquiera consulta la base)', async () => {
    for (const role of ['ADMIN', 'MANAGER', 'AGENT']) {
      expect(await correr(soloProyectoDelSocio(), { user: { role }, query: {} })).toBeUndefined();
    }
    expect(mocks.prisma.proyectoSocio.findMany).not.toHaveBeenCalled();
  });

  it('un socio pasa con un proyecto suyo', async () => {
    expect(await correr(soloProyectoDelSocio(), socio({ query: { projectId: 'VDB' } }))).toBeUndefined();
    expect(mocks.prisma.proyectoSocio.findMany).toHaveBeenCalledWith({ where: { userId: 's-1' }, select: { projectId: true } });
  });

  it('un proyecto ajeno → 403', async () => {
    const err = await correr(soloProyectoDelSocio(), socio({ query: { projectId: 'JSA1' } }));
    expect(err.statusCode).toBe(403);
  });

  it('sin proyecto → 400: un listado sin proyecto devolvería los de todo el negocio', async () => {
    expect((await correr(soloProyectoDelSocio(), socio())).statusCode).toBe(400);
  });

  it('?projectId repetido (llega como arreglo) → 400, no se cuela', async () => {
    const err = await correr(soloProyectoDelSocio(), socio({ query: { projectId: ['VDB', 'JSA1'] } }));
    expect(err.statusCode).toBe(400);
  });

  it('lee el proyecto de la URL cuando se le pide', async () => {
    expect(await correr(soloProyectoDelSocio('params'), socio({ params: { projectId: 'MON1' } }))).toBeUndefined();
    expect((await correr(soloProyectoDelSocio('params'), socio({ params: { projectId: 'LCS' } }))).statusCode).toBe(403);
  });

  it('un socio sin proyectos asignados no ve nada', async () => {
    mocks.prisma.proyectoSocio.findMany.mockResolvedValue([]);
    expect((await correr(soloProyectoDelSocio(), socio({ query: { projectId: 'MON1' } }))).statusCode).toBe(403);
  });
});

describe('soloLoteDelSocio', () => {
  it('pasa si el lote es de un proyecto suyo', async () => {
    mocks.prisma.lot.findUnique.mockResolvedValue({ projectId: 'MON1' });
    expect(await correr(soloLoteDelSocio(), socio({ params: { id: 'l-1' } }))).toBeUndefined();
  });

  it('lote de otro proyecto → 403', async () => {
    mocks.prisma.lot.findUnique.mockResolvedValue({ projectId: 'VDR' });
    expect((await correr(soloLoteDelSocio(), socio({ params: { id: 'l-1' } }))).statusCode).toBe(403);
  });

  it('lote inexistente → 404', async () => {
    mocks.prisma.lot.findUnique.mockResolvedValue(null);
    expect((await correr(soloLoteDelSocio(), socio({ params: { id: 'x' } }))).statusCode).toBe(404);
  });
});
