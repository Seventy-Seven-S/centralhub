// Separa un pago que trae el enganche junto con la primera mensualidad.
//
// El sistema viejo los capturaba como un solo movimiento: V433 pagó $14,000 el
// día que firmó, que son $10,000 de enganche y $4,000 de mensualidad. Mientras
// siga junto, el contrato queda con enganche en cero y su mensualidad sale
// contra un financiado más grande del real — decía $4,167 cuando ella paga
// $4,000 puntuales.
//
// El enganche NO se adivina: `enganches-sin-registrar.ts` lo despeja de lo que
// el cliente paga al mes. Aquí se pasa ya confirmado, caso por caso, porque
// cada uno merece su revisión con el equipo.
//
// La mensualidad es opcional: si no se da, se deriva de lo financiado entre el
// plazo. Se pasa cuando el equipo tiene la cifra pactada y difiere por el
// redondeo, como A101/A102 ($4,066 contra los $4,067 que saldrían solos).
//
//   npx tsx src/scripts/tools/partir-enganche.ts V434 10000                  (dry-run)
//   npx tsx src/scripts/tools/partir-enganche.ts A101 48800 4066 --aplicar
import { PrismaClient, PaymentType, PaymentStatus } from '@prisma/client';
import { editarDatosDelContrato } from '../../services/contratoEdicion.service';
import { partirPagoEnganche } from '../../services/lib/partirPagoEnganche';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const $ = (n: unknown) => `$${Number(n).toLocaleString('es-MX')}`;

const [CODIGO, MONTO, MENSUALIDAD] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const ENGANCHE = Number(MONTO);
const MENSUALIDAD_PACTADA = MENSUALIDAD ? Number(MENSUALIDAD) : undefined;

if (!CODIGO || !Number.isFinite(ENGANCHE) || ENGANCHE <= 0) {
  console.error('Uso: npx tsx src/scripts/tools/partir-enganche.ts <CODIGO> <ENGANCHE> [<MENSUALIDAD>] [--aplicar]');
  process.exit(1);
}
if (MENSUALIDAD_PACTADA !== undefined && (!Number.isFinite(MENSUALIDAD_PACTADA) || MENSUALIDAD_PACTADA <= 0)) {
  console.error('La mensualidad, si se da, debe ser un número mayor a cero');
  process.exit(1);
}

async function main() {
  console.log(aplicar ? '=== APLICANDO ===\n' : '=== DRY-RUN (nada se escribe) ===\n');

  const c = await prisma.contract.findFirstOrThrow({
    where: { codigoLegado: CODIGO },
    select: {
      id: true, clientId: true, contractNumber: true, totalPrice: true,
      downPayment: true, installmentAmount: true, installmentCount: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });

  if (Number(c.downPayment) > 0) {
    console.log(`${CODIGO} ya tiene enganche de ${$(c.downPayment)} — no se hace nada.`);
    await prisma.$disconnect();
    return;
  }

  const pago = await prisma.payment.findFirstOrThrow({
    where: { contractId: c.id, status: PaymentStatus.CONFIRMED },
    orderBy: { paymentDate: 'asc' },
    select: { id: true, paymentNumber: true, amount: true, paymentDate: true, paymentType: true, paymentMethod: true, concept: true, corteId: true },
  });

  const { enganche, resto } = partirPagoEnganche(Number(pago.amount), ENGANCHE);

  console.log(`${CODIGO} ${c.client.firstName} ${c.client.lastName}`);
  console.log(`   pago del ${pago.paymentDate.toISOString().slice(0, 10)} por ${$(pago.amount)} (${pago.paymentType}) se parte en:`);
  console.log(`      ${$(enganche)} como enganche`);
  console.log(`      ${$(resto)} como mensualidad`);

  // El saldo no se mueve: el dinero es el mismo, solo cambia de qué tipo es.
  const { _sum } = await prisma.payment.aggregate({
    where: { contractId: c.id, status: PaymentStatus.CONFIRMED }, _sum: { amount: true },
  });
  const saldoReal = Number(c.totalPrice) - Number(_sum.amount ?? 0);

  if (aplicar) {
    await prisma.$transaction(async tx => {
      // El original se queda con el enganche; el resto sale como pago aparte.
      await tx.payment.update({
        where: { id: pago.id },
        data: {
          amount: enganche,
          paymentType: PaymentType.DOWN_PAYMENT,
          notes: `Venía junto con su primera mensualidad en un solo movimiento de ${$(pago.amount)}; se separó el ${new Date().toISOString().slice(0, 10)}.`,
        },
      });
      await tx.payment.create({
        data: {
          paymentNumber: `${pago.paymentNumber}-M`,
          contractId: c.id, clientId: c.clientId,
          // Hereda el corte del pago del que salió. Sin esto el pedazo nuevo
          // aparecía como pendiente de entregar, aunque ese dinero YA se había
          // reportado: pasó con A101 y A102, cuyo original estaba en el corte
          // #1 de JSA 2 y los pedazos volvieron a salir en la liquidación.
          corteId: pago.corteId,
          paymentType: PaymentType.INSTALLMENT,
          paymentMethod: pago.paymentMethod,
          amount: resto,
          paymentDate: pago.paymentDate,
          concept: pago.concept,
          status: PaymentStatus.CONFIRMED,
          notes: `Separado del movimiento de ${$(pago.amount)}, que traía el enganche junto con esta mensualidad.`,
        },
      });
    });
  }

  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true } });
  const r = await editarDatosDelContrato(c.id, {
    downPayment: enganche,
    ...(MENSUALIDAD_PACTADA !== undefined ? { installmentAmount: MENSUALIDAD_PACTADA } : {}),
    motivo: `Su enganche de ${$(enganche)} venía junto con la primera mensualidad en un solo pago de ${$(pago.amount)}, así que el contrato quedaba con enganche en cero y la mensualidad salía inflada.`,
  }, admin.id, { dryRun: !aplicar });

  r.cambios
    .filter(x => !['balance', 'moraMonthsCount'].includes(x.campo))
    .forEach(x => console.log(`   ${x.campo}: ${x.valorAnterior} -> ${x.valorNuevo}`));
  console.log(`   mora ${r.moraAntes} -> ${r.moraDespues} | saldo ${$(saldoReal)} (no se mueve: el dinero es el mismo)`);

  if (aplicar) {
    const act = await prisma.contract.findUniqueOrThrow({ where: { id: c.id }, select: { balance: true, installmentAmount: true } });
    const despues = await prisma.payment.aggregate({
      where: { contractId: c.id, status: PaymentStatus.CONFIRMED }, _sum: { amount: true },
    });
    const pagadoDespues = Number(despues._sum.amount ?? 0);
    const esperado = Number(c.totalPrice) - pagadoDespues;
    const ok = Math.abs(esperado - Number(act.balance)) < 0.01;
    console.log(`   mensualidad quedó en ${$(act.installmentAmount ?? 0)}`);
    console.log(`   invariante: ${$(c.totalPrice)} - ${$(pagadoDespues)} = ${$(esperado)} | saldo ${$(act.balance)} ${ok ? 'OK' : '<-- DESCUADRE'}`);
  }

  if (!aplicar) console.log('\n(dry-run: vuelve a correr con --aplicar para escribir)');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
