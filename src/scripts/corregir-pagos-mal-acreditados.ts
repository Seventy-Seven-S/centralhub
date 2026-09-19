// Corrige pagos que se capturaron en el contrato equivocado o que no debían
// existir. El servicio de pagos prohíbe editar o cancelar un pago ya
// registrado, justamente porque dejaría cuotas y balance sin recalcular; este
// script es la salida manual: mueve o borra el pago Y vuelve a componer el
// calendario de los contratos afectados, todo en una sola transacción.
//
//   npx tsx src/scripts/corregir-pagos-mal-acreditados.ts              (dry-run)
//   npx tsx src/scripts/corregir-pagos-mal-acreditados.ts --aplicar
//
// El dry-run simula el cambio en memoria, así que los números que imprime son
// los que quedarán en la base.
//
// Casos del documento "Casos por aclarar" de las secretarias.
import { PrismaClient, CuotaStatus, ContractStatus, Prisma } from '@prisma/client';
import { recomponerCuotas, estadoDelContrato, CuotaEnCalendario, PagoAplicable } from '../services/lib/recomponerCuotas';
import { round2 } from '../utils/money';

const prisma = new PrismaClient();

type Correccion =
  | { tipo: 'mover'; pagoId: string; haciaContrato: string; porque: string }
  | { tipo: 'borrar'; pagoId: string; porque: string };

const CORRECCIONES: Correccion[] = [
  {
    tipo: 'mover',
    pagoId: 'f6137793-399b-4879-b738-1b84ab3f9224',        // $11,001 del 13-ago-2026
    haciaContrato: 'ff183042-a098-44b8-b95c-67459acea39c',  // VDR-V108 Guillermo Mireles Vite
    porque: 'Se acreditó a V018; el concepto del propio pago dice "Manzana 2 Lote 29", que es el lote de V108',
  },
  {
    tipo: 'borrar',
    pagoId: 'e03c47b8-ef6b-4689-b8cf-f59d949976bb',        // $4,000 del 31-ago-2026
    porque: 'V005 Teresa Loredo: el pago no existió; su balance correcto es $181,600',
  },
];

// Los tipos que alimentan el calendario. El enganche queda fuera: las cuotas
// solo cubren la parte financiada.
const TIPOS_QUE_CUBREN_CUOTAS: Prisma.EnumPaymentTypeFilter['in'] = ['INSTALLMENT', 'EXTRA_PAYMENT'];

const pesos = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Qué hay que escribirle a un contrato para que su calendario y su balance
 *  reflejen el juego de pagos resultante. Se calcula antes de tocar nada. */
interface PlanContrato {
  contractId: string;
  etiqueta: string;
  numero: string;
  balanceAntes: number | null;
  balanceDespues: number;
  cambios: CuotaEnCalendario[];
  statusDespues: ContractStatus | null;
  moraDespues: number;
}

async function planearContrato(
  contractId: string,
  etiqueta: string,
  quitar: Set<string>,
  agregar: PagoAplicable[],
): Promise<PlanContrato | null> {
  const contrato = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    select: { contractNumber: true, financingAmount: true, balance: true, status: true, moraMonthsCount: true },
  });
  const filas = await prisma.cuota.findMany({
    where: { contractId },
    orderBy: { numeroCuota: 'asc' },
    select: { id: true, numeroCuota: true, montoEsperado: true, montoPagado: true, status: true, fechaPago: true, fechaVencimiento: true },
  });
  const cuotas = filas as CuotaEnCalendario[];
  const vencimientos = new Map(filas.map(c => [c.id, c.fechaVencimiento]));

  if (cuotas.length === 0) {
    console.log(`  ${etiqueta} ${contrato.contractNumber} — sin calendario de cuotas, no hay nada que recomponer`);
    return null;
  }

  const enBase = await prisma.payment.findMany({
    where: { contractId, status: 'CONFIRMED', paymentType: { in: TIPOS_QUE_CUBREN_CUOTAS } },
    orderBy: { paymentDate: 'asc' },
    select: { id: true, amount: true, paymentDate: true },
  });
  const pagos = [...enBase.filter(p => !quitar.has(p.id)), ...agregar];

  const r = recomponerCuotas(pagos, cuotas);
  const balanceDespues = round2((contrato.financingAmount ?? 0) - r.totalPagado);

  console.log(`  ${etiqueta} ${contrato.contractNumber}`);
  console.log(`      pagos que alimentan cuotas: ${enBase.length} -> ${pagos.length}  |  aplicado al calendario: ${pesos(r.totalPagado)}`);
  console.log(`      balance: ${pesos(contrato.balance ?? 0)} -> ${pesos(balanceDespues)}`);
  console.log(`      cuotas que cambian: ${r.cambios.length}${r.cambios.length ? ` (#${r.cambios.map(c => c.numeroCuota).join(', #')})` : ''}`);
  if (r.sobrante > 0) console.log(`      ⚠️  sobran ${pesos(r.sobrante)} que no caben en el calendario`);
  if (balanceDespues < -0.01) throw new Error(`${contrato.contractNumber}: el balance quedaría negativo (${pesos(balanceDespues)}), no se escribe nada`);

  // Un contrato rescindido o cancelado no se reactiva por recalcular cuotas.
  const reevaluable = contrato.status === ContractStatus.ACTIVE
    || contrato.status === ContractStatus.IN_MORA
    || contrato.status === ContractStatus.COMPLETED;
  let statusDespues: ContractStatus | null = null;
  let moraDespues = contrato.moraMonthsCount;
  if (reevaluable) {
    const e = estadoDelContrato(
      balanceDespues,
      r.cuotas.map(c => ({ status: c.status, fechaVencimiento: vencimientos.get(c.id)! })),
    );
    statusDespues = ContractStatus[e.status];
    moraDespues = e.moraMonthsCount;
    console.log(`      estatus: ${contrato.status} (${contrato.moraMonthsCount} meses de mora) -> ${statusDespues} (${moraDespues})`);
  } else {
    console.log(`      estatus: ${contrato.status} — no se reevalúa`);
  }

  return {
    contractId, etiqueta, numero: contrato.contractNumber,
    balanceAntes: contrato.balance, balanceDespues, cambios: r.cambios,
    statusDespues, moraDespues,
  };
}

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  console.log(aplicar ? '=== APLICANDO ===' : '=== DRY-RUN (nada se escribe; los números son los que quedarán) ===');

  for (const c of CORRECCIONES) {
    const pago = await prisma.payment.findUnique({
      where: { id: c.pagoId },
      include: { contract: { select: { contractNumber: true } }, client: { select: { firstName: true, lastName: true } } },
    });
    if (!pago) { console.log(`\n! pago ${c.pagoId} no existe — ya se corrigió o es otra base`); continue; }

    console.log(`\n${c.tipo.toUpperCase()} ${pago.paymentNumber} — ${pesos(pago.amount)} del ${pago.paymentDate.toISOString().slice(0, 10)}`);
    console.log(`  origen: ${pago.contract.contractNumber} (${pago.client.firstName} ${pago.client.lastName})`);
    console.log(`  motivo: ${c.porque}`);

    const planes: PlanContrato[] = [];
    const quitar = new Set([pago.id]);
    const origen = await planearContrato(pago.contractId, 'origen ', quitar, []);
    if (origen) planes.push(origen);

    let cambioDePago: Prisma.PaymentUpdateArgs | null = null;
    if (c.tipo === 'mover') {
      const destino = await prisma.contract.findUniqueOrThrow({
        where: { id: c.haciaContrato },
        select: { contractNumber: true, clientId: true, client: { select: { firstName: true, lastName: true } } },
      });
      console.log(`  destino: ${destino.contractNumber} (${destino.client.firstName} ${destino.client.lastName})`);

      const plan = await planearContrato(
        c.haciaContrato, 'destino',
        new Set(),
        [{ amount: pago.amount, paymentDate: pago.paymentDate }],
      );
      if (plan) planes.push(plan);

      cambioDePago = {
        where: { id: pago.id },
        data: {
          contractId: c.haciaContrato,
          clientId: destino.clientId,
          // El número lleva el código del contrato: dejarlo con V018 haría que
          // el recibo y los listados mintieran sobre a quién pertenece.
          paymentNumber: pago.paymentNumber.replace(
            pago.contract.contractNumber.split('-')[1],
            destino.contractNumber.split('-')[1],
          ),
          notes: [pago.notes, `Reacreditado de ${pago.contract.contractNumber} a ${destino.contractNumber}: ${c.porque}`]
            .filter(Boolean).join(' | '),
        },
      };
    }

    if (!aplicar) continue;

    await prisma.$transaction(async (tx) => {
      if (cambioDePago) await tx.payment.update(cambioDePago);
      else await tx.payment.delete({ where: { id: pago.id } });

      for (const plan of planes) {
        for (const cu of plan.cambios) {
          await tx.cuota.update({
            where: { id: cu.id },
            data: {
              montoPagado: cu.montoPagado,
              fechaPago: cu.fechaPago,
              status: cu.status === 'PAGADA' ? CuotaStatus.PAGADA : CuotaStatus.PENDIENTE,
            },
          });
        }
        await tx.contract.update({
          where: { id: plan.contractId },
          data: {
            balance: plan.balanceDespues,
            ...(plan.statusDespues ? { status: plan.statusDespues, moraMonthsCount: plan.moraDespues } : {}),
          },
        });
      }
    });
    console.log('  ✓ escrito');
  }

  console.log(aplicar ? '\n✓ Aplicado.' : '\n(dry-run: vuelve a correr con --aplicar para escribir)');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
