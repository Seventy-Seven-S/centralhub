import { describe, it, expect } from 'vitest';
import { calcularReparto } from '../repartoProyecto';

describe('calcularReparto', () => {
  const santander = { valorBase: 62751781.50, porcentajeDueno: 70, porcentajeCentral: 30 };

  it('reparte el valor base según los porcentajes pactados', () => {
    const r = calcularReparto(santander, { entregadoDueno: 0, tomadoCentral: 0 });
    expect(r.dueno.leToca).toBeCloseTo(43926247.05, 2);
    expect(r.central.leToca).toBeCloseTo(18825534.45, 2);
  });

  it('mide el avance de cada parte contra lo que le toca, no contra el total', () => {
    const r = calcularReparto(santander, { entregadoDueno: 4504393.43, tomadoCentral: 1930432.90 });
    expect(r.dueno.avance).toBeCloseTo(10.25, 2);
    expect(r.central.avance).toBeCloseTo(10.25, 2);
    expect(r.avanceTotal).toBeCloseTo(10.25, 2);
  });

  it('reporta lo que falta por entregar a cada parte', () => {
    const r = calcularReparto(santander, { entregadoDueno: 4504393.43, tomadoCentral: 1930432.90 });
    expect(r.dueno.falta).toBeCloseTo(39421853.62, 2);
    expect(r.central.falta).toBeCloseTo(16895101.55, 2);
  });

  it('avisa cuando el reparto se sale de la proporción pactada', () => {
    // Si a una parte se le dio de más respecto a la otra, hay que verlo.
    const parejo = calcularReparto(santander, { entregadoDueno: 700, tomadoCentral: 300 });
    expect(parejo.desbalance).toBe(0);
    const chueco = calcularReparto(santander, { entregadoDueno: 1000, tomadoCentral: 0 });
    expect(chueco.desbalance).toBeCloseTo(300, 2);
  });

  it('un valor base en cero no divide entre cero', () => {
    const r = calcularReparto({ valorBase: 0, porcentajeDueno: 70, porcentajeCentral: 30 }, { entregadoDueno: 0, tomadoCentral: 0 });
    expect(r.dueno.avance).toBe(0);
    expect(r.avanceTotal).toBe(0);
  });

  it('no deja pasar porcentajes que no suman cien', () => {
    expect(() => calcularReparto({ valorBase: 100, porcentajeDueno: 70, porcentajeCentral: 25 }, { entregadoDueno: 0, tomadoCentral: 0 }))
      .toThrow(/100/);
  });
});
