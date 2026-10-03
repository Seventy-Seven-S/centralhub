import { describe, it, expect } from 'vitest';
import { buildCuotaRows, addMonthsClamped } from '../cuotaSchedule';

describe('buildCuotaRows', () => {
  it('genera una fila por cuota, numeradas desde 1, con vencimiento mensual a partir de startDate', () => {
    const rows = buildCuotaRows({
      contractId: 'c-1',
      startDate: new Date('2026-07-10T00:00:00'),
      cuotaAmounts: [4416.67, 4416.67, 4416.66],
      idFactory: () => 'id',
    });
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.numeroCuota)).toEqual([1, 2, 3]);
    expect(rows.map(r => r.montoEsperado)).toEqual([4416.67, 4416.67, 4416.66]);
    expect(rows[0].fechaVencimiento.getMonth()).toBe(7); // agosto
    expect(rows[2].fechaVencimiento.getMonth()).toBe(9); // octubre
    expect(rows.every(r => r.status === 'PENDIENTE' && r.montoPagado === 0 && r.contractId === 'c-1')).toBe(true);
  });

  it('un startDate a fin de mes no produce fechas inválidas (29-ene + 1 mes cae en marzo, no en 29-feb)', () => {
    const rows = buildCuotaRows({
      contractId: 'c-1',
      startDate: new Date('2025-01-29T00:00:00'),
      cuotaAmounts: [1, 1],
      idFactory: () => 'id',
    });
    expect(rows.every(r => !isNaN(r.fechaVencimiento.getTime()))).toBe(true);
  });

  it('startDate 31-ene: un vencimiento por mes calendario, sin saltar ni repetir meses (caso real V205)', () => {
    const rows = buildCuotaRows({
      contractId: 'c-1',
      startDate: new Date('2025-01-31T00:00:00'),
      cuotaAmounts: new Array(12).fill(1),
      idFactory: () => 'id',
    });
    const ym = rows.map(r => `${r.fechaVencimiento.getFullYear()}-${String(r.fechaVencimiento.getMonth() + 1).padStart(2, '0')}`);
    expect(ym).toEqual(['2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01']);
    // El día se recorta al último del mes cuando el mes es más corto.
    expect(rows[0].fechaVencimiento.getDate()).toBe(28); // feb 2025
    expect(rows[2].fechaVencimiento.getDate()).toBe(30); // abr
    expect(rows[1].fechaVencimiento.getDate()).toBe(31); // mar
    expect(rows.map(r => r.mes)).toEqual([
      'febrero de 2025', 'marzo de 2025', 'abril de 2025', 'mayo de 2025', 'junio de 2025', 'julio de 2025',
      'agosto de 2025', 'septiembre de 2025', 'octubre de 2025', 'noviembre de 2025', 'diciembre de 2025', 'enero de 2026',
    ]);
  });

  it('cada fila lleva un id distinto de la fábrica', () => {
    let n = 0;
    const rows = buildCuotaRows({
      contractId: 'c-1',
      startDate: new Date('2026-01-01T00:00:00'),
      cuotaAmounts: [1, 1, 1],
      idFactory: () => `id-${++n}`,
    });
    expect(rows.map(r => r.id)).toEqual(['id-1', 'id-2', 'id-3']);
  });
});

describe('addMonthsClamped no debe depender de la zona horaria', () => {
  // Corría con métodos de hora local, así que una fecha guardada a medianoche
  // UTC daba un mes distinto según dónde corriera: en México (UTC-6) el ancla
  // 2025-05-01 producía la cuota 1 el 31 de MAYO, y en el servidor (UTC) el 1
  // de JUNIO. Caso real F059, cuyo calendario quedó un mes antes de lo pactado
  // porque la corrección se corrió desde una laptop y no desde Railway.

  it('un ancla a medianoche UTC avanza al mes siguiente, no al fin del mismo', () => {
    const r = addMonthsClamped(new Date('2025-05-01T00:00:00Z'), 1);
    expect(r.toISOString().slice(0, 10)).toBe('2025-06-01');
  });

  it('un ancla con hora local sigue dando lo mismo que antes', () => {
    const r = addMonthsClamped(new Date('2025-06-01T05:00:00Z'), 1);
    expect(r.toISOString().slice(0, 10)).toBe('2025-07-01');
  });

  it('recorta al último día cuando el mes destino es más corto', () => {
    // 31 de enero + 1 mes no existe en febrero.
    expect(addMonthsClamped(new Date('2025-01-31T00:00:00Z'), 1).toISOString().slice(0, 10))
      .toBe('2025-02-28');
    expect(addMonthsClamped(new Date('2024-01-31T00:00:00Z'), 1).toISOString().slice(0, 10))
      .toBe('2024-02-29');   // bisiesto
  });

  it('cruza el fin de año', () => {
    expect(addMonthsClamped(new Date('2025-11-15T00:00:00Z'), 2).toISOString().slice(0, 10))
      .toBe('2026-01-15');
  });

  it('un plazo completo no pierde el día del mes', () => {
    const base = new Date('2025-03-18T00:00:00Z');
    for (let i = 1; i <= 60; i++) {
      expect(addMonthsClamped(base, i).getUTCDate()).toBe(18);
    }
  });
});

describe('el nombre del mes se lee en UTC', () => {
  it('una cuota que vence el día 1 no se etiqueta con el mes anterior', () => {
    // El texto salía de toLocaleDateString en hora local: una fecha guardada a
    // medianoche UTC retrocede un día en México y cae en el mes anterior. La
    // cuota de F059 vencía el 1 de junio y el equipo leía "mayo de 2025" —
    // justo el dato por el que reportaron meses equivocados.
    const [c1] = buildCuotaRows({
      contractId: 'c', startDate: new Date('2025-05-01T00:00:00Z'), cuotaAmounts: [1000],
    });
    expect(c1.fechaVencimiento.toISOString().slice(0, 10)).toBe('2025-06-01');
    expect(c1.mes).toMatch(/junio/i);
    expect(c1.mes).toMatch(/2025/);
  });

  it('el nombre concuerda con la fecha en todo el plazo', () => {
    const filas = buildCuotaRows({
      contractId: 'c', startDate: new Date('2025-01-01T00:00:00Z'),
      cuotaAmounts: Array(12).fill(1000),
    });
    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    for (const f of filas) {
      expect(f.mes.toLowerCase()).toContain(MESES[f.fechaVencimiento.getUTCMonth()]);
    }
  });
});
