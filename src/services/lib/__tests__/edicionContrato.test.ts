import { describe, it, expect } from 'vitest';
import { validarEdicion, camposQueCambian, montosDeCuotas, inicioDesdeMes, mensualidadPara } from '../edicionContrato';
import { round2 } from '../../../utils/money';

const f = (s: string) => new Date(`${s}T00:00:00`);

const actual = {
  totalPrice: 250000, downPayment: 10000, installmentAmount: 4000,
  installmentCount: 60, startDate: f('2025-01-15'), lotIds: ['lote-a'],
};

describe('validarEdicion', () => {
  it('acepta una corrección normal', () => {
    expect(validarEdicion({ ...actual }, { totalPrice: 250000, installmentAmount: 3473, installmentCount: 72 }, { pagado: 50000, primerPago: f('2025-02-10'), lotesOcupadosPorOtros: [] })).toBeNull();
  });

  it('rechaza un precio menor a lo que el cliente ya pagó', () => {
    const msg = validarEdicion({ ...actual }, { totalPrice: 40000 }, { pagado: 50000, primerPago: f('2025-02-10'), lotesOcupadosPorOtros: [] });
    expect(msg).toMatch(/ya pagó/i);
  });

  it('rechaza un lote que ya tiene dueño en otro contrato', () => {
    const msg = validarEdicion({ ...actual }, { lotIds: ['lote-b'] }, { pagado: 0, primerPago: null, lotesOcupadosPorOtros: ['lote-b'] });
    expect(msg).toMatch(/otro contrato/i);
  });

  it('deja arrancar el calendario aunque ya haya pagos: son adelantos', () => {
    // El equipo registra adelantos con frecuencia; el dinero se aplica a la
    // cuota 1 igual. Antes esto se rechazaba y bloqueaba correcciones buenas.
    expect(validarEdicion({ ...actual }, { mesInicioCalendario: '2025-06' },
      { pagado: 50000, primerPago: f('2025-02-10'), lotesOcupadosPorOtros: [] })).toBeNull();
  });

  it('exige que el plazo y la mensualidad sean positivos', () => {
    expect(validarEdicion({ ...actual }, { installmentCount: 0 }, { pagado: 0, primerPago: null, lotesOcupadosPorOtros: [] })).toMatch(/plazo/i);
    expect(validarEdicion({ ...actual }, { installmentAmount: -1 }, { pagado: 0, primerPago: null, lotesOcupadosPorOtros: [] })).toMatch(/mensualidad/i);
  });
});

describe('camposQueCambian', () => {
  it('lista solo lo que de verdad cambia, con su valor anterior', () => {
    const r = camposQueCambian({ ...actual }, { totalPrice: 250000, installmentAmount: 3473 });
    expect(r).toEqual([{ campo: 'installmentAmount', valorAnterior: '4000', valorNuevo: '3473' }]);
  });

  it('registra el cambio de lote como lista legible', () => {
    const r = camposQueCambian({ ...actual }, { lotIds: ['lote-b'] });
    expect(r).toEqual([{ campo: 'lotIds', valorAnterior: 'lote-a', valorNuevo: 'lote-b' }]);
  });

  it('no inventa cambios cuando no se manda nada', () => {
    expect(camposQueCambian({ ...actual }, {})).toEqual([]);
  });
});

describe('montosDeCuotas', () => {
  it('reparte el financiado en cuotas iguales y ajusta la última al centavo', () => {
    const m = montosDeCuotas(10000, 3);
    expect(m).toHaveLength(3);
    expect(m.reduce((a, b) => a + b, 0)).toBeCloseTo(10000, 2);
  });

  it('usa la mensualidad capturada y cierra la suma en la última cuota', () => {
    // 3473 x 72 = 250,056: sesenta y seis pesos de más sobre lo financiado.
    // Si no se ajusta, el cliente nunca llega a saldo cero.
    const m = montosDeCuotas(250000, 72, 3473);
    expect(m).toHaveLength(72);
    expect(m[0]).toBe(3473);
    expect(m[71]).toBe(3417);
    expect(round2(m.reduce((a, b) => a + b, 0))).toBe(250000);
  });

  it('avisa cuando la mensualidad no alcanza a cubrir el financiado en el plazo', () => {
    expect(() => montosDeCuotas(250000, 60, 1000)).toThrow(/no alcanza/i);
  });
});

describe('inicioDesdeMes', () => {
  it('la cuota 1 vence en el mes que el ADMIN indicó', () => {
    // El calendario ancla en startDate y la cuota i vence en startDate + i meses.
    const inicio = inicioDesdeMes('2025-04');
    expect(inicio.getFullYear()).toBe(2025);
    expect(inicio.getMonth()).toBe(2); // marzo: la cuota 1 cae en abril
  });
});

describe('validarEdicion — el mes del primer pago se lee en UTC', () => {
  const actual = {
    totalPrice: 250000, downPayment: 10000, installmentAmount: 4000,
    installmentCount: 60, startDate: new Date('2022-04-29T00:00:00Z'), lotIds: ['l'],
  };

  it('acepta arrancar el mismo mes en que el cliente hizo su primer pago', () => {
    // Las fechas de pago se guardan a medianoche UTC. Leídas en hora local
    // (México, UTC-6) un pago del día 1 cae en el mes anterior, y la
    // validación rechazaba correcciones buenas: caso real de C070.
    const pagoPrimeroDeJunio = new Date('2022-06-01T00:00:00Z');
    expect(validarEdicion(actual, { mesInicioCalendario: '2022-06' },
      { pagado: 40000, primerPago: pagoPrimeroDeJunio, lotesOcupadosPorOtros: [] })).toBeNull();
  });

  it('tampoco estorba cuando el arranque va meses después del primer pago', () => {
    const pago = new Date('2022-06-01T00:00:00Z');
    expect(validarEdicion(actual, { mesInicioCalendario: '2022-08' },
      { pagado: 40000, primerPago: pago, lotesOcupadosPorOtros: [] })).toBeNull();
  });
});

describe('un pago anterior al arranque del calendario es un ADELANTO, no un error', () => {
  const base = {
    totalPrice: 260000, downPayment: 10000, installmentAmount: 4167,
    installmentCount: 60, startDate: new Date('2024-05-21T00:00:00Z'), lotIds: ['l'],
  };

  it('deja arrancar el calendario después de un pago ya hecho', () => {
    // Quien firma después del día 20 empieza a pagar un mes más tarde, pero a
    // veces abona antes. Ese dinero se aplica a la cuota 1 igual; bloquearlo
    // impedía corregir ~60 contratos que el equipo había revisado a mano.
    expect(validarEdicion(base, { mesInicioCalendario: '2024-07' },
      { pagado: 4167, primerPago: new Date('2024-06-05T00:00:00Z'), lotesOcupadosPorOtros: [] })).toBeNull();
  });

  it('sigue exigiendo que el mes venga bien escrito', () => {
    expect(validarEdicion(base, { mesInicioCalendario: '2024-13' },
      { pagado: 0, primerPago: null, lotesOcupadosPorOtros: [] })).toMatch(/AAAA-MM/);
  });
});

describe('cambiar el plazo sin dar mensualidad la RECALCULA', () => {
  it('deriva la mensualidad del financiado y el plazo nuevo', () => {
    // V002: el equipo dice que el plazo son 50 meses. Conservar la mensualidad
    // vieja ($11,600) hacía que 50 cuotas pasaran de lo financiado y la
    // corrección se rechazaba sola.
    expect(mensualidadPara(530000, 50, undefined)).toBe(10600);
  });

  it('respeta la mensualidad cuando sí la capturan', () => {
    expect(mensualidadPara(530000, 50, 11600)).toBe(11600);
  });

  it('sin plazo no inventa nada', () => {
    expect(mensualidadPara(530000, 0, undefined)).toBeNull();
  });
});

describe('el enganche se puede corregir', () => {
  const base = {
    totalPrice: 335038, downPayment: 60000, installmentAmount: 4237,
    installmentCount: 72, startDate: new Date('2025-06-01T00:00:00Z'), lotIds: ['l'],
  };

  it('aparece en la lista de cambios', () => {
    // F080: tenía dos lotes, canceló uno, y su enganche de $60,000 se divide
    // en $30,000 de enganche y $30,000 que abonan mensualidades.
    const cambios = camposQueCambian(base, { downPayment: 30000 });
    expect(cambios).toContainEqual({ campo: 'downPayment', valorAnterior: '60000', valorNuevo: '30000' });
  });

  it('el mismo enganche no cuenta como cambio', () => {
    expect(camposQueCambian(base, { downPayment: 60000 })).toEqual([]);
  });

  it('un enganche negativo se rechaza', () => {
    expect(validarEdicion(base, { downPayment: -1 },
      { pagado: 0, primerPago: null, lotesOcupadosPorOtros: [] })).toMatch(/enganche/i);
  });

  it('un enganche que se pasa del precio se rechaza', () => {
    expect(validarEdicion(base, { downPayment: 400000 },
      { pagado: 0, primerPago: null, lotesOcupadosPorOtros: [] })).toMatch(/enganche/i);
  });

  it('acepta bajarlo cuando cabe en el precio', () => {
    expect(validarEdicion(base, { downPayment: 30000 },
      { pagado: 93948, primerPago: null, lotesOcupadosPorOtros: [] })).toBeNull();
  });
});

describe('mensualidadPara — cuando cambia el enganche', () => {
  it('se recalcula al corregir el enganche', () => {
    // V223: su enganche de $15,000 se había capturado como mensualidad, así
    // que el contrato decía enganche $0. Al reponerlo, lo financiado baja de
    // $235,000 a $220,000 y la mensualidad vuelve a sus $3,667 originales.
    expect(mensualidadPara(220000, 60, undefined)).toBe(3667);
  });

  it('con el enganche en cero sale la mensualidad inflada', () => {
    // Lo que el sistema tenía antes de reponer el enganche.
    expect(mensualidadPara(235000, 60, undefined)).toBe(3917);
  });
});
