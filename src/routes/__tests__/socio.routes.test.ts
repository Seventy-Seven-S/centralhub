import { describe, it, expect, vi, beforeEach } from 'vitest';

// El alcance del socio consulta sus proyectos en la base: aquí tiene uno ("MIO").
// Para /lots/:id el proyecto del lote es el propio id, para poder probar ambos casos.
const mocks = vi.hoisted(() => ({
  prisma: {
    proyectoSocio: { findMany: vi.fn() },
    lot: { findUnique: vi.fn() },
  },
}));
vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));

import { authenticate } from '../../middlewares/auth';
import lotRouter from '../lot.routes';
import projectRouter from '../project.routes';
import expenseRouter from '../expense.routes';
import paymentRouter from '../payment.routes';
import dashboardRouter from '../dashboard.routes';
import informeRouter from '../informe.routes';
import clientRouter from '../client.routes';
import contractRouter from '../contract.routes';
import corteRouter from '../corte.routes';
import corteDiarioRouter from '../corteDiario.routes';
import cuotaRouter from '../cuota.routes';
import traspasoRouter from '../traspaso.routes';
import userRouter from '../user.routes';
import notificationRouter from '../notification.routes';
import documentRouter from '../document.routes';

const ROUTERS: Record<string, any> = {
  lots: lotRouter, projects: projectRouter, expenses: expenseRouter, payments: paymentRouter,
  dashboard: dashboardRouter, informes: informeRouter, clients: clientRouter, contracts: contractRouter,
  cortes: corteRouter, 'cortes-diarios': corteDiarioRouter, cuotas: cuotaRouter, traspasos: traspasoRouter,
  users: userRouter, notifications: notificationRouter, documents: documentRouter,
};

// Lo ÚNICO que un socio puede tocar. "proyecto": la ruta exige que el proyecto
// pedido sea suyo; "libre": no nombra proyecto (sus preferencias, las
// categorías de gasto, y el listado de proyectos, que se filtra en el controller).
const PERMITIDAS: Record<string, 'proyecto' | 'libre'> = {
  'GET lots /': 'proyecto',
  'GET lots /:id': 'proyecto',
  'GET projects /': 'libre',
  'GET projects /:id': 'proyecto',
  'GET expenses /categories': 'libre',
  'GET expenses /project/:projectId/summary': 'proyecto',
  'GET expenses /project/:projectId': 'proyecto',
  'GET payments /': 'proyecto',
  'GET dashboard /summary': 'proyecto',
  'GET informes /proyecto/:projectId': 'proyecto',
  'GET informes /proyecto/:projectId/excel': 'proyecto',
  'GET users /mis-preferencias': 'libre',
  'PUT users /mis-preferencias': 'libre',
};

interface Ruta { clave: string; cadena: any[] }

/** Cada ruta con los middlewares que corren antes de su handler (sin authenticate). */
function rutas(): Ruta[] {
  const out: Ruta[] = [];
  for (const [nombre, router] of Object.entries(ROUTERS)) {
    const previos: any[] = [];
    for (const capa of router.stack) {
      if (!capa.route) { if (capa.handle !== authenticate) previos.push(capa.handle); continue; }
      const handlers = capa.route.stack.map((s: any) => s.handle).filter((h: any) => h !== authenticate);
      for (const metodo of Object.keys(capa.route.methods)) {
        out.push({ clave: `${metodo.toUpperCase()} ${nombre} ${capa.route.path}`, cadena: [...previos, ...handlers.slice(0, -1)] });
      }
    }
  }
  return out;
}

/** Corre la cadena como lo haría Express; devuelve el status con que se detuvo, o 'pasa'. */
async function correr(cadena: any[], proyecto: string): Promise<number | 'pasa'> {
  const req: any = {
    user: { role: 'SOCIO', userId: 's-1' },
    params: { projectId: proyecto, id: proyecto }, query: { projectId: proyecto }, body: {}, headers: {},
  };
  for (const h of cadena) {
    try {
      await new Promise<void>((resolve, reject) => {
        h(req, { status: () => ({ json: () => undefined }) }, (err?: any) => (err ? reject(err) : resolve()));
      });
    } catch (err: any) {
      return err.statusCode ?? 500;
    }
  }
  return 'pasa';
}

beforeEach(() => {
  mocks.prisma.proyectoSocio.findMany.mockResolvedValue([{ projectId: 'MIO' }]);
  mocks.prisma.lot.findUnique.mockImplementation(({ where }: any) => Promise.resolve({ projectId: where.id }));
});

describe('rol SOCIO: solo consulta, y solo sus proyectos', () => {
  const todas = rutas();

  it('las rutas permitidas existen tal cual (si se renombra una, esta prueba avisa)', () => {
    const claves = todas.map(r => r.clave);
    for (const k of Object.keys(PERMITIDAS)) expect(claves).toContain(k);
  });

  it('cualquier otra ruta del sistema → 403, aunque nombre un proyecto suyo', async () => {
    const bloqueadas = todas.filter(r => !PERMITIDAS[r.clave]);
    expect(bloqueadas.length).toBeGreaterThan(50);
    for (const r of bloqueadas) {
      expect([r.clave, await correr(r.cadena, 'MIO')]).toEqual([r.clave, 403]);
    }
  });

  it('las permitidas pasan con un proyecto suyo', async () => {
    for (const r of todas.filter(r => PERMITIDAS[r.clave])) {
      expect([r.clave, await correr(r.cadena, 'MIO')]).toEqual([r.clave, 'pasa']);
    }
  });

  it('las que nombran proyecto → 403 con uno ajeno', async () => {
    for (const r of todas.filter(r => PERMITIDAS[r.clave] === 'proyecto')) {
      expect([r.clave, await correr(r.cadena, 'AJENO')]).toEqual([r.clave, 403]);
    }
  });
});
