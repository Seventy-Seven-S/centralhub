import { describe, it, expect } from 'vitest';
import { construirResumenRetenido, CasoRetenido } from '../dineroRetenido';

const caso = (o: Partial<CasoRetenido> = {}): CasoRetenido => ({
  contratoId: 'c1', codigo: 'E016', proyecto: 'VDB',
  cliente: 'Magdaleno Marquez', origen: 'CANCELACION',
  pagado: 164000, devuelto: 0, respetadoEnTraspaso: 0,
  fecha: new Date('2026-06-04'), ...o,
});

describe('dinero retenido — lo que quedó sin respaldar una obligación', () => {
  it('retenido = pagado − devuelto − lo respetado en un traspaso', () => {
    const r = construirResumenRetenido([caso({ pagado: 40000, devuelto: 0, respetadoEnTraspaso: 10000 })]);
    expect(r.total).toBe(30000);
  });

  it('una devolución baja el retenido', () => {
    expect(construirResumenRetenido([caso({ pagado: 100000, devuelto: 30000 })]).total).toBe(70000);
  });

  it('separa por origen: cancelación vs traspaso', () => {
    const r = construirResumenRetenido([
      caso({ origen: 'CANCELACION', pagado: 100000 }),
      caso({ origen: 'TRASPASO', pagado: 40000, respetadoEnTraspaso: 10000 }),
    ]);
    expect(r.porOrigen).toEqual([
      { origen: 'CANCELACION', casos: 1, monto: 100000 },
      { origen: 'TRASPASO', casos: 1, monto: 30000 },
    ]);
  });

  it('agrupa por proyecto, del que más retiene al que menos', () => {
    const r = construirResumenRetenido([
      caso({ proyecto: 'MDS', pagado: 50000 }),
      caso({ proyecto: 'VDR', pagado: 120000 }),
      caso({ proyecto: 'MDS', pagado: 30000 }),
    ]);
    expect(r.porProyecto).toEqual([
      { proyecto: 'VDR', casos: 1, monto: 120000 },
      { proyecto: 'MDS', casos: 2, monto: 80000 },
    ]);
  });

  it('un caso donde se devolvió todo NO aparece en la lista', () => {
    const r = construirResumenRetenido([caso({ pagado: 50000, devuelto: 50000 })]);
    expect(r.total).toBe(0);
    expect(r.casos).toHaveLength(0);
  });

  it('nunca devuelve un retenido negativo, aunque se haya devuelto de más', () => {
    expect(construirResumenRetenido([caso({ pagado: 50000, devuelto: 60000 })]).total).toBe(0);
  });

  it('sin casos da ceros y no truena', () => {
    expect(construirResumenRetenido([])).toMatchObject({ total: 0, casos: [], porOrigen: [], porProyecto: [] });
  });

  it('los casos salen ordenados de mayor a menor', () => {
    const r = construirResumenRetenido([caso({ codigo: 'A', pagado: 10000 }), caso({ codigo: 'B', pagado: 90000 })]);
    expect(r.casos.map(c => c.codigo)).toEqual(['B', 'A']);
  });
});
