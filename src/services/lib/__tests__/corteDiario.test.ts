import { describe, it, expect } from 'vitest';
import { resumirDia, validarCierre, calcularRecepcion } from '../corteDiario';

const pago = (amount: number, metodo: string, proyecto = 'JSA2') => ({
  amount, paymentMethod: metodo, proyectoCode: proyecto, proyectoNombre: proyecto,
});

describe('resumirDia — el efectivo es el eje, lo demás es informativo', () => {
  const pagos = [
    pago(24500, 'CASH', 'JSA2'), pago(9000, 'CASH', 'VDR'),
    pago(5000, 'TRANSFER', 'JSA2'),
  ];

  it('separa efectivo de lo que no se entrega en mano', () => {
    const r = resumirDia(pagos);
    expect(r.totalEfectivo).toBe(33500);
    expect(r.totalOtros).toBe(5000);
  });

  it('desglosa por proyecto solo el efectivo, que es lo que se cuenta', () => {
    const r = resumirDia(pagos);
    expect(r.porProyecto).toEqual([
      { code: 'JSA2', nombre: 'JSA2', efectivo: 24500, pagos: 1 },
      { code: 'VDR', nombre: 'VDR', efectivo: 9000, pagos: 1 },
    ]);
  });

  it('un día sin cobros da ceros, no truena', () => {
    const r = resumirDia([]);
    expect(r).toMatchObject({ totalEfectivo: 0, totalOtros: 0, porProyecto: [] });
  });

  it('un día de puras transferencias tiene efectivo en cero', () => {
    expect(resumirDia([pago(5000, 'TRANSFER')]).totalEfectivo).toBe(0);
  });

  it('CHECK y CARD cuentan como "otros", no como efectivo', () => {
    const r = resumirDia([pago(100, 'CHECK'), pago(200, 'CARD'), pago(300, 'CASH')]);
    expect(r.totalEfectivo).toBe(300);
    expect(r.totalOtros).toBe(300);
  });
});

describe('validarCierre — lo que la cobradora declara entregar', () => {
  it('acepta declarar exactamente lo que el sistema dice', () => {
    expect(validarCierre({ declarado: 33500, totalEfectivo: 33500, pagos: 9 })).toBeNull();
  });

  it('acepta una diferencia: se registra, no se bloquea', () => {
    expect(validarCierre({ declarado: 33200, totalEfectivo: 33500, pagos: 9 })).toBeNull();
  });

  it('rechaza cerrar un día sin cobros', () => {
    expect(validarCierre({ declarado: 0, totalEfectivo: 0, pagos: 0 })).toMatch(/sin cobros/i);
  });

  it('rechaza un declarado negativo', () => {
    expect(validarCierre({ declarado: -1, totalEfectivo: 33500, pagos: 9 })).toMatch(/negativo/i);
  });
});

describe('calcularRecepcion — el administrador cuenta el dinero', () => {
  it('cuando cuadra no exige nota', () => {
    const r = calcularRecepcion({ declarado: 33500, recibido: 33500, notaAdmin: '' });
    expect(r.error).toBeNull();
    expect(r.diferencia).toBe(0);
  });

  it('faltante: diferencia negativa y nota OBLIGATORIA', () => {
    const sinNota = calcularRecepcion({ declarado: 33500, recibido: 33200, notaAdmin: '' });
    expect(sinNota.diferencia).toBe(-300);
    expect(sinNota.error).toMatch(/nota/i);

    const conNota = calcularRecepcion({ declarado: 33500, recibido: 33200, notaAdmin: 'Cliente pagó de menos' });
    expect(conNota.error).toBeNull();
  });

  it('sobrante: también es diferencia y también exige nota', () => {
    const r = calcularRecepcion({ declarado: 33500, recibido: 33800, notaAdmin: '' });
    expect(r.diferencia).toBe(300);
    expect(r.error).toMatch(/nota/i);
  });

  it('una nota de puros espacios no cuenta como nota', () => {
    const r = calcularRecepcion({ declarado: 33500, recibido: 33200, notaAdmin: '   ' });
    expect(r.error).toMatch(/nota/i);
  });

  it('rechaza un recibido negativo', () => {
    expect(calcularRecepcion({ declarado: 100, recibido: -1, notaAdmin: 'x' }).error).toMatch(/negativo/i);
  });

  it('los centavos no disparan una diferencia falsa', () => {
    const r = calcularRecepcion({ declarado: 33500.004, recibido: 33500, notaAdmin: '' });
    expect(r.diferencia).toBe(0);
    expect(r.error).toBeNull();
  });
});
