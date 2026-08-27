import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma = {
    contract: { findUnique: vi.fn(), update: vi.fn() },
    cuota: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    payment: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    project: { findUnique: vi.fn() },
    reciboLog: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  const crearReciboLog = vi.fn();
  return { prisma, crearReciboLog };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
  PaymentStatus: { PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', CANCELED: 'CANCELED' },
  PaymentType: { DOWN_PAYMENT: 'DOWN_PAYMENT', INSTALLMENT: 'INSTALLMENT', EXTRA_PAYMENT: 'EXTRA_PAYMENT', ADJUSTMENT: 'ADJUSTMENT', RESCISSION_REFUND: 'RESCISSION_REFUND', RESERVATION_DEPOSIT: 'RESERVATION_DEPOSIT' },
  CuotaStatus: { PENDIENTE: 'PENDIENTE', PAGADA: 'PAGADA', MORA: 'MORA' },
  ContractStatus: { DRAFT: 'DRAFT', SIGNED: 'SIGNED', ACTIVE: 'ACTIVE', IN_MORA: 'IN_MORA', COMPLETED: 'COMPLETED', CANCELED: 'CANCELED', RESCISSION: 'RESCISSION' },
}));
vi.mock('../notification.service', () => ({ default: { createNotification: vi.fn() } }));
// crearReciboLog se mockea aparte del prisma de arriba porque vive en
// reciboLog.service.ts, que importa su propio prisma desde
// config/database (a propósito — ver el comentario en ese archivo). No
// queremos que este test unitario de payment.service dependa de esa
// otra ruta de mocking.
vi.mock('../reciboLog.service', () => ({ crearReciboLog: mocks.crearReciboLog }));

import paymentService from '../payment.service';

const CONTRACT = {
  id: 'contract-1',
  clientId: 'client-1',
  projectId: 'project-1',
  status: 'ACTIVE',
  balance: 16000,
  client: { firstName: 'Ana', lastName: 'Pérez' },
  project: { id: 'project-1' },
};

function cuota(over: Partial<any> = {}) {
  return {
    id: 'cuota-1', numeroCuota: 1, mes: 'Agosto 2026',
    montoEsperado: 8000, montoPagado: 0, status: 'PENDIENTE',
    ...over,
  };
}

function baseInput(over: Partial<any> = {}) {
  return {
    contractId: 'contract-1',
    amount: 8000,
    paymentDate: new Date('2026-08-16'),
    paymentMethod: 'TRANSFER',
    idempotencyKey: 'key-abc-123',
    ...over,
  } as any;
}

beforeEach(() => {
  // resetAllMocks (no solo clearAllMocks): también vacía cualquier
  // mockImplementationOnce encolado por un test anterior (ej. la carrera
  // P2002), que si no, se filtra al siguiente test.
  vi.resetAllMocks();

  mocks.prisma.payment.findUnique.mockResolvedValue(null); // sin duplicado por default
  mocks.prisma.contract.findUnique.mockResolvedValue(CONTRACT);
  mocks.prisma.cuota.findMany.mockResolvedValue([
    cuota({ id: 'cuota-1', numeroCuota: 1 }),
    cuota({ id: 'cuota-2', numeroCuota: 2 }),
  ]);
  mocks.prisma.project.findUnique.mockResolvedValue({ id: 'project-1', code: 'MON1' });
  mocks.prisma.payment.findFirst.mockResolvedValue(null); // sin folios previos

  mocks.prisma.$transaction.mockImplementation(async (cb: any) => {
    const tx = {
      contract: {
        findUnique: vi.fn().mockResolvedValue({ balance: CONTRACT.balance }),
        update: vi.fn().mockResolvedValue({}),
      },
      payment: {
        create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'payment-1', ...data })),
      },
      cuota: {
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    return cb(tx);
  });

  // getPaymentById (llamado al final del flujo feliz)
  mocks.prisma.payment.findUnique.mockImplementation(({ where }: any) => {
    if (where.idempotencyKey) return Promise.resolve(null);
    if (where.id) return Promise.resolve({ id: where.id, amount: 8000, contract: CONTRACT });
    return Promise.resolve(null);
  });

  mocks.crearReciboLog.mockResolvedValue('recibo-new-1');
  mocks.prisma.reciboLog.findUnique.mockResolvedValue(null);
});

describe('registrarPagoMensualidad — idempotencia', () => {
  it('idempotencyKey requerida — sin ella, rechaza antes de tocar BD', async () => {
    await expect(paymentService.registrarPagoMensualidad(baseInput({ idempotencyKey: undefined })))
      .rejects.toThrow(/idempotencyKey/i);
    expect(mocks.prisma.contract.findUnique).not.toHaveBeenCalled();
  });

  it('replay idempotente: mismo idempotencyKey ya existe → devuelve el pago existente, SIN nueva cascada', async () => {
    mocks.prisma.payment.findUnique.mockImplementation(({ where }: any) => {
      if (where.idempotencyKey === 'key-abc-123') {
        return Promise.resolve({ id: 'payment-existing', amount: 8000, contract: CONTRACT });
      }
      if (where.id === 'payment-existing') {
        return Promise.resolve({ id: 'payment-existing', amount: 8000, contract: CONTRACT });
      }
      return Promise.resolve(null);
    });

    const result = await paymentService.registrarPagoMensualidad(baseInput());

    expect(result.payment.id).toBe('payment-existing');
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.cuota.findMany).not.toHaveBeenCalled();
  });

  it('carrera real: create() falla con P2002 (unique violation) → recupera y devuelve el pago que sí se creó, no revienta', async () => {
    mocks.prisma.$transaction.mockImplementationOnce(async () => {
      const err: any = new Error('Unique constraint failed on idempotency_key');
      err.code = 'P2002';
      throw err;
    });
    mocks.prisma.payment.findUnique.mockImplementation(({ where }: any) => {
      if (where.idempotencyKey === 'key-abc-123') return Promise.resolve({ id: 'payment-race-winner', amount: 8000, contract: CONTRACT });
      if (where.id === 'payment-race-winner') return Promise.resolve({ id: 'payment-race-winner', amount: 8000, contract: CONTRACT });
      return Promise.resolve(null);
    });

    const result = await paymentService.registrarPagoMensualidad(baseInput());
    expect(result.payment.id).toBe('payment-race-winner');
  });
});

describe('registrarPagoMensualidad — sobrepago extremo', () => {
  it('monto excede el total pendiente del contrato → rechaza con error claro, NUNCA abre transacción', async () => {
    await expect(paymentService.registrarPagoMensualidad(baseInput({ amount: 50000 })))
      .rejects.toThrow(/excede|pendiente/i);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('monto que liquida exacto el total pendiente → SÍ procede (no falso positivo)', async () => {
    const result = await paymentService.registrarPagoMensualidad(baseInput({ amount: 16000 }));
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(result.payment).toBeDefined();
  });

  it('sobrepago que adelanta una cuota futura (dentro del total pendiente) → procede normal', async () => {
    // 10000 sobre una cuota de 8000: cierra la 1 y abona 2000 a la 2 (futura).
    const result = await paymentService.registrarPagoMensualidad(baseInput({ amount: 10000 }));
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(result.cuotasAfectadas).toEqual([1, 2]);
  });
});

describe('registrarPagoMensualidad — balance', () => {
  it('decrementa el balance por el monto APLICADO, no el crudo (en el camino feliz son iguales)', async () => {
    await paymentService.registrarPagoMensualidad(baseInput({ amount: 8000 }));

    const txCall = mocks.prisma.$transaction.mock.calls[0][0];
    const tx = {
      contract: { findUnique: vi.fn().mockResolvedValue({ balance: 16000 }), update: vi.fn().mockResolvedValue({}) },
      payment: { create: vi.fn().mockResolvedValue({ id: 'p1' }) },
      cuota: { update: vi.fn().mockResolvedValue({}), count: vi.fn().mockResolvedValue(0) },
    };
    await txCall(tx);

    const balanceUpdateCall = tx.contract.update.mock.calls.find((c: any) => 'balance' in (c[0].data ?? {}) || 'balance' in (c[0].data ?? {}));
    expect(balanceUpdateCall).toBeDefined();
  });

  it('si el balance resultante daría negativo (inconsistencia de datos), revienta la transacción en vez de persistir un negativo', async () => {
    // Balance en BD ya inconsistente con las cuotas (mucho menor de lo esperado).
    mocks.prisma.$transaction.mockImplementationOnce(async (cb: any) => {
      const tx = {
        contract: {
          findUnique: vi.fn().mockResolvedValue({ balance: 100 }), // insuficiente para cubrir 8000
          update: vi.fn().mockResolvedValue({}),
        },
        payment: { create: vi.fn().mockResolvedValue({ id: 'p1' }) },
        cuota: { update: vi.fn().mockResolvedValue({}), count: vi.fn().mockResolvedValue(0) },
      };
      return cb(tx);
    });

    await expect(paymentService.registrarPagoMensualidad(baseInput({ amount: 8000 })))
      .rejects.toThrow(/balance|negativ/i);
  });
});

describe('registrarPagoMensualidad — ReciboLog (QR de validación)', () => {
  it('camino feliz: crea el pago Y el ReciboLog, devuelve reciboId en el resultado', async () => {
    const result = await paymentService.registrarPagoMensualidad(baseInput({ amount: 8000 }));

    expect(mocks.crearReciboLog).toHaveBeenCalledOnce();
    expect(result.reciboId).toBe('recibo-new-1');
  });

  it('si crearReciboLog devuelve null (falló, no lanzó), el pago igual se completa con reciboId: null', async () => {
    mocks.crearReciboLog.mockResolvedValue(null);

    const result = await paymentService.registrarPagoMensualidad(baseInput({ amount: 8000 }));

    expect(result.payment).toBeDefined();
    expect(result.reciboId).toBeNull();
  });

  it('replay idempotente: devuelve el reciboId ya existente para ese pago, sin llamar crearReciboLog de nuevo', async () => {
    mocks.prisma.payment.findUnique.mockImplementation(({ where }: any) => {
      if (where.idempotencyKey === 'key-abc-123') return Promise.resolve({ id: 'payment-existing', amount: 8000, contract: CONTRACT });
      if (where.id === 'payment-existing') return Promise.resolve({ id: 'payment-existing', amount: 8000, contract: CONTRACT });
      return Promise.resolve(null);
    });
    mocks.prisma.reciboLog.findUnique.mockResolvedValue({ id: 'recibo-ya-existia' });

    const result = await paymentService.registrarPagoMensualidad(baseInput());

    expect(result.reciboId).toBe('recibo-ya-existia');
    expect(mocks.crearReciboLog).not.toHaveBeenCalled();
  });
});

describe('registrarPagoMensualidad — otros guardas existentes (no deben romperse)', () => {
  it('monto <= 0 sigue rechazado', async () => {
    await expect(paymentService.registrarPagoMensualidad(baseInput({ amount: 0 }))).rejects.toThrow();
  });

  it('contrato cancelado sigue rechazado', async () => {
    mocks.prisma.contract.findUnique.mockResolvedValue({ ...CONTRACT, status: 'CANCELED' });
    await expect(paymentService.registrarPagoMensualidad(baseInput())).rejects.toThrow(/cancelado/i);
  });
});
