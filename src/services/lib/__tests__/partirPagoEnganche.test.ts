import { describe, it, expect } from 'vitest';
import { partirPagoEnganche } from '../partirPagoEnganche';

describe('partirPagoEnganche', () => {
  it('parte el pago en enganche y mensualidad', () => {
    // V433: pagó $14,000 el día que firmó — $10,000 de enganche y $4,000 de
    // su primera mensualidad, capturados como un solo movimiento.
    expect(partirPagoEnganche(14000, 10000)).toEqual({ enganche: 10000, resto: 4000 });
  });

  it('las dos partes suman exactamente el pago original', () => {
    const r = partirPagoEnganche(14000, 10000);
    expect(r.enganche + r.resto).toBe(14000);
  });

  it('respeta los centavos sin perderlos', () => {
    const r = partirPagoEnganche(14000.55, 10000.25);
    expect(r.enganche + r.resto).toBeCloseTo(14000.55, 2);
    expect(r.resto).toBeCloseTo(4000.30, 2);
  });

  it('rechaza un enganche mayor que el pago', () => {
    expect(() => partirPagoEnganche(10000, 14000)).toThrow(/mayor/i);
  });

  it('rechaza un enganche igual al pago: eso no es partir, es reclasificar', () => {
    expect(() => partirPagoEnganche(10000, 10000)).toThrow(/reclasific/i);
  });

  it('rechaza un enganche de cero o negativo', () => {
    expect(() => partirPagoEnganche(14000, 0)).toThrow(/mayor a cero/i);
    expect(() => partirPagoEnganche(14000, -1)).toThrow(/mayor a cero/i);
  });
});
