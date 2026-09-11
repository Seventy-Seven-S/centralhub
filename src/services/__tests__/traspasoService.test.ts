import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    contract: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    contractLot: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    lot: { findMany: vi.fn(), updateMany: vi.fn() },
    payment: { aggregate: vi.fn(), create: vi.fn() },
    cuota: { deleteMany: vi.fn() },
    traspaso: { findFirst: vi.fn(), create: vi.fn() },
  };
  const prisma = {
    traspaso: { findMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  };
  return { prisma, tx };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
  ContractStatus: { ACTIVE: 'ACTIVE', IN_MORA: 'IN_MORA', CANCELED: 'CANCELED', RESCISSION: 'RESCISSION', TRASPASADO: 'TRASPASADO' },
  PaymentType: { TRASPASO_ENTRADA: 'TRASPASO_ENTRADA' },
  PaymentMethod: { CASH: 'CASH', TRANSFER: 'TRANSFER' },
  PaymentStatus: { CONFIRMED: 'CONFIRMED' },
  LotStatus: { AVAILABLE: 'AVAILABLE', SOLD: 'SOLD' },
  CuotaStatus: { PENDIENTE: 'PENDIENTE', PAGADA: 'PAGADA' },
}));

import traspasoService from '../traspaso.service';

const ORIGEN = {
  id: 'c-origen', contractNumber: 'E024', codigoLegado: 'E024', status: 'ACTIVE',
  clientId: 'cli-1', projectId: 'p-vdb', balance: 612987,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tx.contract.findUnique.mockResolvedValue(ORIGEN);
  mocks.tx.contractLot.findMany.mockResolvedValue([{ lotId: 'lote-a' }]);
  mocks.tx.lot.findMany.mockResolvedValue([{ id: 'lote-b', status: 'AVAILABLE', projectId: 'p-mon2' }]);
  mocks.tx.payment.aggregate.mockResolvedValue({ _sum: { amount: 40000 } });
  mocks.tx.traspaso.findFirst.mockResolvedValue({ numero: 6 });
  mocks.tx.traspaso.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'tr-1', ...data }));
  mocks.tx.contract.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'c-destino', ...data }));
  mocks.tx.contract.update.mockImplementation(({ data }: any) => Promise.resolve(data));
  mocks.tx.payment.create.mockImplementation(({ data }: any) => Promise.resolve(data));
});

const baseInput = {
  contratoOrigenId: 'c-origen', clienteNuevoId: 'cli-2',
  lotIdsDestino: ['lote-b'], projectIdDestino: 'p-mon2',
  montoRespetado: 10000, nota: 'Se acordó respetar solo el enganche', userId: 'u-admin',
  datosContratoDestino: {
    totalPrice: 260000, downPayment: 0, installmentAmount: 4167,
    installmentCount: 60, startDate: new Date('2026-06-01'),
  },
};

describe('crear — reubicación (otro proyecto)', () => {
  it('numera consecutivo y guarda lo abonado y lo respetado', async () => {
    const t = await traspasoService.crear(baseInput);
    expect(t).toMatchObject({ numero: 7, tipo: 'REUBICACION', montoAbonado: 40000, montoRespetado: 10000 });
  });

  it('NO toca los pagos del contrato origen: solo crea el abono en el destino', async () => {
    await traspasoService.crear(baseInput);
    const creados = mocks.tx.payment.create.mock.calls.map(c => c[0].data);
    expect(creados).toHaveLength(1);
    expect(creados[0]).toMatchObject({ contractId: 'c-destino', paymentType: 'TRASPASO_ENTRADA', amount: 10000 });
    expect(creados.every(p => p.amount > 0)).toBe(true);
    expect(creados.some(p => p.contractId === 'c-origen')).toBe(false);
  });

  it('cierra el origen como TRASPASADO con balance 0 y libera su lote', async () => {
    await traspasoService.crear(baseInput);
    const upd = mocks.tx.contract.update.mock.calls.find(c => c[0].where.id === 'c-origen');
    expect(upd![0].data).toMatchObject({ status: 'TRASPASADO', balance: 0 });
    expect(mocks.tx.lot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'AVAILABLE' } }),
    );
  });

  it('rechaza respetar más de lo abonado, sin escribir nada', async () => {
    await expect(traspasoService.crear({ ...baseInput, montoRespetado: 99999 }))
      .rejects.toThrow(/más de lo abonado/i);
    expect(mocks.tx.traspaso.create).not.toHaveBeenCalled();
  });

  it('rechaza si falta la nota cuando no se respeta todo', async () => {
    await expect(traspasoService.crear({ ...baseInput, nota: undefined }))
      .rejects.toThrow(/nota/i);
  });

  it('rechaza un contrato ya traspasado', async () => {
    mocks.tx.contract.findUnique.mockResolvedValue({ ...ORIGEN, status: 'TRASPASADO' });
    await expect(traspasoService.crear(baseInput)).rejects.toThrow(/ya fue traspasado/i);
  });

  it('rechaza si el lote destino no está disponible', async () => {
    mocks.tx.lot.findMany.mockResolvedValue([{ id: 'lote-b', status: 'SOLD', projectId: 'p-mon2' }]);
    await expect(traspasoService.crear(baseInput)).rejects.toThrow(/disponible/i);
  });
});

describe('crear — cambio de titular (mismo lote y proyecto)', () => {
  const mismoLote = {
    ...baseInput, lotIdsDestino: ['lote-a'], projectIdDestino: 'p-vdb',
    montoRespetado: 40000, nota: undefined, datosContratoDestino: undefined,
  };

  beforeEach(() => {
    mocks.tx.lot.findMany.mockResolvedValue([{ id: 'lote-a', status: 'SOLD', projectId: 'p-vdb' }]);
  });

  it('no crea contrato nuevo: el mismo cambia de dueño', async () => {
    const t = await traspasoService.crear(mismoLote);
    expect(t.tipo).toBe('CAMBIO_TITULAR');
    expect(t.contratoDestinoId).toBeNull();
    expect(mocks.tx.contract.create).not.toHaveBeenCalled();
  });

  it('no mueve un peso: el contrato conserva su historial', async () => {
    await traspasoService.crear(mismoLote);
    expect(mocks.tx.payment.create).not.toHaveBeenCalled();
  });

  it('cambia el titular del contrato y NO lo cierra', async () => {
    await traspasoService.crear(mismoLote);
    const upd = mocks.tx.contract.update.mock.calls.find(c => c[0].where.id === 'c-origen');
    expect(upd![0].data).toMatchObject({ clientId: 'cli-2' });
    expect(upd![0].data.status).toBeUndefined();
  });
});
