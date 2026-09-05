import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma = { reciboLog: { create: vi.fn(), findUnique: vi.fn() } };
  return { prisma };
});

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));

import { crearReciboLog, verificarRecibo } from '../reciboLog.service';

const SNAPSHOT = {
  paymentId: 'pay-1',
  folio: 'REC-V148-19de60',
  clienteNombre: 'Juan Pérez López',
  codigoLegado: 'V148',
  proyecto: 'Valle del Roble',
  loteLabel: 'M3 L-12',
  numeroCuota: 19,
  mes: 'Agosto 2026',
  plazoTotal: 60,
  montoPagado: 3667,
  fechaPago: new Date('2026-08-10'),
  concepto: 'Pago mensual',
  balanceDespues: 196333.5,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('crearReciboLog — nunca debe propagar un error (el pago ya se guardó, es sagrado)', () => {
  it('caso normal: crea el ReciboLog y devuelve su id', async () => {
    mocks.prisma.reciboLog.create.mockResolvedValue({ id: 'recibo-uuid-1', ...SNAPSHOT });

    const result = await crearReciboLog(SNAPSHOT);

    expect(result).toBe('recibo-uuid-1');
    expect(mocks.prisma.reciboLog.create).toHaveBeenCalledWith({ data: SNAPSHOT });
  });

  it('si prisma.reciboLog.create lanza un error, crearReciboLog NO lo propaga — devuelve null', async () => {
    mocks.prisma.reciboLog.create.mockRejectedValue(new Error('boom: columna inventada, bug real'));

    await expect(crearReciboLog(SNAPSHOT)).resolves.toBeNull();
  });

  it('un error de restricción única (paymentId duplicado — replay) tampoco se propaga', async () => {
    const err: any = new Error('Unique constraint failed');
    err.code = 'P2002';
    mocks.prisma.reciboLog.create.mockRejectedValue(err);

    await expect(crearReciboLog(SNAPSHOT)).resolves.toBeNull();
  });
});

describe('verificarRecibo — lectura pública por id', () => {
  it('recibo existente: devuelve el snapshot', async () => {
    mocks.prisma.reciboLog.findUnique.mockResolvedValue({ id: 'recibo-uuid-1', ...SNAPSHOT });

    const result = await verificarRecibo('recibo-uuid-1');

    expect(result).toEqual({ id: 'recibo-uuid-1', ...SNAPSHOT });
    expect(mocks.prisma.reciboLog.findUnique).toHaveBeenCalledWith({ where: { id: 'recibo-uuid-1' } });
  });

  it('recibo inexistente: devuelve null', async () => {
    mocks.prisma.reciboLog.findUnique.mockResolvedValue(null);

    await expect(verificarRecibo('no-existe')).resolves.toBeNull();
  });
});

describe('obtenerReciboPorPago (reimpresión)', () => {
  it('devuelve el snapshot inmutable del recibo emitido para ese pago', async () => {
    const { obtenerReciboPorPago } = await import('../reciboLog.service');
    mocks.prisma.reciboLog.findUnique.mockResolvedValue({ id: 'rec-1', ...SNAPSHOT });
    const r = await obtenerReciboPorPago('pay-1');
    expect(mocks.prisma.reciboLog.findUnique).toHaveBeenCalledWith({ where: { paymentId: 'pay-1' } });
    expect(r).toMatchObject({ id: 'rec-1', folio: 'REC-V148-19de60', paymentId: 'pay-1' });
  });

  it('pago sin recibo emitido → null (el caller decide el fallback)', async () => {
    const { obtenerReciboPorPago } = await import('../reciboLog.service');
    mocks.prisma.reciboLog.findUnique.mockResolvedValue(null);
    expect(await obtenerReciboPorPago('pay-x')).toBeNull();
  });
});
