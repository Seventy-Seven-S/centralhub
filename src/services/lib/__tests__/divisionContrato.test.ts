import { describe, it, expect } from 'vitest';
import { repartoSugerido, validarDivision, componerDivision, repartirPagos } from '../divisionContrato';

const V110 = {
  totalPrice: 470000,
  downPayment: 30000,
  installmentCount: 60,
  pagado: 175102,
  lotes: [
    { lotId: 'l-13', precio: 235000 },
    { lotId: 'l-26', precio: 235000 },
  ],
};

describe('repartoSugerido', () => {
  it('propone en proporción al precio del lote', () => {
    // Los dos lotes de Erik valen lo mismo: mitad y mitad.
    expect(repartoSugerido(V110, 'l-26')).toEqual({ precioQueSeVa: 235000, montoQueSeVa: 87551 });
  });

  it('con lotes de distinto valor, la proporción sigue al precio', () => {
    const c = { ...V110, totalPrice: 300000, pagado: 90000,
      lotes: [{ lotId: 'a', precio: 100000 }, { lotId: 'b', precio: 200000 }] };
    expect(repartoSugerido(c, 'b')).toEqual({ precioQueSeVa: 200000, montoQueSeVa: 60000 });
  });

  it('es solo una sugerencia: la secretaria puede cambiarla', () => {
    // Se documenta como contrato de la función, no como regla inviolable.
    const s = repartoSugerido(V110, 'l-13');
    expect(s.montoQueSeVa).toBeGreaterThan(0);
  });
});

describe('validarDivision', () => {
  const base = { precioQueSeVa: 235000, montoQueSeVa: 87551, lotId: 'l-26' };

  it('acepta una división que cuadra', () => {
    expect(validarDivision(V110, base)).toBeNull();
  });

  it('rechaza separar un lote que no es del contrato', () => {
    expect(validarDivision(V110, { ...base, lotId: 'otro' })).toMatch(/no pertenece/i);
  });

  it('rechaza dividir un contrato de un solo lote', () => {
    const uno = { ...V110, lotes: [{ lotId: 'l-13', precio: 235000 }] };
    expect(validarDivision(uno, { ...base, lotId: 'l-13' })).toMatch(/un solo lote|al menos dos/i);
  });

  it('rechaza llevarse más dinero del que el cliente ha pagado', () => {
    expect(validarDivision(V110, { ...base, montoQueSeVa: 200000 })).toMatch(/pagado/i);
  });

  it('rechaza un precio que deja al contrato original en cero o negativo', () => {
    expect(validarDivision(V110, { ...base, precioQueSeVa: 470000 })).toMatch(/precio/i);
  });

  it('rechaza dejar al contrato NUEVO con saldo negativo', () => {
    // Se lleva poco precio pero mucho dinero: el nuevo quedaría sobrepagado.
    expect(validarDivision(V110, { precioQueSeVa: 60000, montoQueSeVa: 100000, lotId: 'l-26' }))
      .toMatch(/negativo/i);
  });

  it('rechaza dejar al contrato ORIGINAL con saldo negativo', () => {
    // Se lleva casi todo el precio y nada de dinero: al original le queda un
    // precio chico contra todo lo que el cliente ya pagó.
    expect(validarDivision(V110, { precioQueSeVa: 400000, montoQueSeVa: 0, lotId: 'l-26' }))
      .toMatch(/negativo/i);
  });
});

describe('componerDivision', () => {
  it('los dos contratos suman exactamente lo que había', () => {
    const r = componerDivision(V110, { precioQueSeVa: 235000, montoQueSeVa: 87551, lotId: 'l-26' });
    expect(r.nuevo.precio + r.original.precio).toBe(470000);
    expect(r.nuevo.pagado + r.original.pagado).toBe(175102);
    expect(r.nuevo.balance + r.original.balance).toBe(294898);
  });

  it('reparte a Erik mitad y mitad', () => {
    const r = componerDivision(V110, { precioQueSeVa: 235000, montoQueSeVa: 87551, lotId: 'l-26' });
    expect(r.nuevo).toMatchObject({ precio: 235000, pagado: 87551, balance: 147449 });
    expect(r.original).toMatchObject({ precio: 235000, pagado: 87551, balance: 147449 });
  });

  it('respeta un reparto desigual decidido a mano', () => {
    const r = componerDivision(V110, { precioQueSeVa: 235000, montoQueSeVa: 100000, lotId: 'l-26' });
    expect(r.nuevo.pagado).toBe(100000);
    expect(r.original.pagado).toBe(75102);
    expect(r.nuevo.balance + r.original.balance).toBe(294898);
  });
});

describe('repartirPagos', () => {
  const pagos = [
    { id: 'p1', amount: 15000, concept: 'Manzana 3 Lote 13' },
    { id: 'p2', amount: 15000, concept: 'Manzana 3 Lote 26' },
    { id: 'p3', amount: 7350, concept: 'Lote 13 y 26' },
    { id: 'p4', amount: 66006, concept: 'Lote 13 y 26' },
  ];
  const total = 15000 + 15000 + 7350 + 66006; // 103,356

  it('lo repartido suma exactamente lo que había: el dinero no se crea ni se pierde', () => {
    const r = repartirPagos(pagos, 51678); // la mitad
    const alNuevo = r.reduce((s, x) => s + x.alNuevo, 0);
    const alOriginal = r.reduce((s, x) => s + x.alOriginal, 0);
    expect(alNuevo).toBeCloseTo(51678, 2);
    expect(alNuevo + alOriginal).toBeCloseTo(total, 2);
  });

  it('cada pago se parte en la misma proporción', () => {
    const r = repartirPagos(pagos, total / 2);
    expect(r[0].alNuevo).toBeCloseTo(7500, 2);
    expect(r[3].alNuevo).toBeCloseTo(33003, 2);
  });

  it('el último pago absorbe el centavo, para que la suma cierre exacto', () => {
    const r = repartirPagos([{ id: 'a', amount: 100, concept: '' }, { id: 'b', amount: 100, concept: '' }], 66.67);
    expect(r.reduce((s, x) => s + x.alNuevo, 0)).toBeCloseTo(66.67, 2);
  });

  it('si no se lleva nada, todo se queda en el original', () => {
    const r = repartirPagos(pagos, 0);
    expect(r.every(x => x.alNuevo === 0)).toBe(true);
    expect(r.reduce((s, x) => s + x.alOriginal, 0)).toBeCloseTo(total, 2);
  });

  it('si se lleva todo, no queda nada en el original', () => {
    const r = repartirPagos(pagos, total);
    expect(r.reduce((s, x) => s + x.alOriginal, 0)).toBeCloseTo(0, 2);
  });

  it('nunca parte un pago en montos negativos', () => {
    const r = repartirPagos(pagos, total / 3);
    expect(r.every(x => x.alNuevo >= 0 && x.alOriginal >= 0)).toBe(true);
  });
});
