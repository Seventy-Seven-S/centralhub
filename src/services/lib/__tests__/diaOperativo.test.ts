import { describe, it, expect } from 'vitest';
import { rangoDelDiaOperativo, fechaOperativa } from '../diaOperativo';

describe('día operativo — el del negocio, no el del servidor', () => {
  it('a las 9pm de Matamoros sigue siendo el MISMO día, aunque en UTC ya sea el siguiente', () => {
    // 2026-09-11 02:12 UTC = 2026-09-10 21:12 en Matamoros.
    // El servidor de Railway corre en UTC: sin esto, los cobros de la tarde
    // caían en el corte del día siguiente y "Mi corte" salía vacío.
    const d = new Date('2026-09-11T02:12:00Z');
    expect(fechaOperativa(d)).toBe('2026-09-10');
  });

  it('a las 7am de Matamoros es ese día', () => {
    expect(fechaOperativa(new Date('2026-09-10T13:00:00Z'))).toBe('2026-09-10');
  });

  it('justo antes de medianoche local sigue siendo el día que termina', () => {
    // En septiembre Matamoros está en horario de verano (UTC−5), porque es
    // municipio fronterizo y sigue el cambio de horario de EE.UU. aunque el
    // resto de México ya no lo haga. 04:59 UTC = 23:59 local.
    expect(fechaOperativa(new Date('2026-09-11T04:59:00Z'))).toBe('2026-09-10');
  });

  it('pasada la medianoche local ya es el día nuevo', () => {
    expect(fechaOperativa(new Date('2026-09-11T05:01:00Z'))).toBe('2026-09-11');
  });

  it('en INVIERNO el corte es una hora después, porque vuelve a UTC−6', () => {
    // 2026-01-15 05:59 UTC = 2026-01-14 23:59 local (UTC−6).
    // Hardcodear el desfase habría movido el corte de todos los días de
    // invierno; por eso se usa la zona horaria y no una resta fija.
    expect(fechaOperativa(new Date('2026-01-15T05:59:00Z'))).toBe('2026-01-14');
    expect(fechaOperativa(new Date('2026-01-15T06:01:00Z'))).toBe('2026-01-15');
  });

  it('el rango cubre el día completo tal como se guardan los pagos (fecha a medianoche UTC)', () => {
    const { desde, hasta } = rangoDelDiaOperativo(new Date('2026-09-11T02:12:00Z'));
    // paymentDate se guarda como 2026-09-10 00:00:00 UTC
    const pago = new Date('2026-09-10T00:00:00Z');
    expect(pago >= desde && pago <= hasta).toBe(true);
  });

  it('un pago del día anterior NO entra en el rango', () => {
    const { desde } = rangoDelDiaOperativo(new Date('2026-09-11T02:12:00Z'));
    expect(new Date('2026-09-09T00:00:00Z') < desde).toBe(true);
  });

  it('un pago del día siguiente tampoco', () => {
    const { hasta } = rangoDelDiaOperativo(new Date('2026-09-11T02:12:00Z'));
    expect(new Date('2026-09-11T00:00:00Z') > hasta).toBe(true);
  });
});
