/**
 * apartar-lotes-dueno.ts
 *
 * Un contrato que en realidad son lotes que el DUEÑO del terreno separó para sí
 * mismo no es una venta: no hay nada que cobrar. Cargado como contrato normal
 * infla tres cosas a la vez — la cartera por cobrar, la morosidad, y las cuotas
 * vencidas del tablero.
 *
 * Lo que hace:
 *   1. El contrato pasa a CANCELED, con saldo y meses de mora en cero.
 *   2. Se borra su calendario de cuotas. Es necesario, no cosmético: el tablero
 *      cuenta cuotas PENDIENTE vencidas SIN mirar el estatus del contrato
 *      (dashboard.service.ts), así que cancelarlo sin quitarlas no limpia nada.
 *   3. Sus lotes pasan a UNAVAILABLE — ni disponibles para vender ni vendidos.
 *
 * Se conserva el contrato y su vínculo con los lotes como historial de por qué
 * esos lotes están fuera del inventario.
 *
 * Uso:
 *   npx tsx src/scripts/apartar-lotes-dueno.ts SAN H026 "Pepe Caballero"
 *   npx tsx src/scripts/apartar-lotes-dueno.ts SAN H026 "Pepe Caballero" --confirm
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const [PROYECTO, CODIGO, DUENO] = process.argv.slice(2);
const CONFIRM = process.argv.includes('--confirm');
const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

async function main() {
  if (!PROYECTO || !CODIGO || !DUENO) throw new Error('Uso: apartar-lotes-dueno.ts <PROYECTO> <CODIGO> "<Dueño>" [--confirm]');

  const c = await prisma.contract.findFirst({
    where: { project: { code: PROYECTO }, codigoLegado: CODIGO },
    select: {
      id: true, status: true, balance: true, totalPrice: true, moraMonthsCount: true, notes: true,
      client: { select: { firstName: true, lastName: true } },
      lots: { select: { lot: { select: { id: true, manzana: true, lotNumber: true, status: true } } } },
      payments: { where: { status: 'CONFIRMED' }, select: { amount: true } },
      cuotas: { select: { id: true, montoEsperado: true } },
    },
  });
  if (!c) throw new Error(`No existe ${CODIGO} en ${PROYECTO}`);

  const pagado = c.payments.reduce((s, p) => s + p.amount, 0);
  // Si alguien le pagó, no es un apartado del dueño: es una venta y ese dinero
  // necesita un destino explícito. Mejor parar que decidirlo solo.
  if (pagado !== 0) throw new Error(`${CODIGO} tiene ${money(pagado)} en pagos — no es un apartado del dueño, revísalo a mano`);

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN'} · ${PROYECTO} ${CODIGO}\n`);
  console.log(`   titular:  ${c.client.firstName} ${c.client.lastName}  →  apartado por ${DUENO}`);
  console.log(`   estatus:  ${c.status} → CANCELED`);
  console.log(`   precio:   ${money(c.totalPrice ?? 0)} sale de la cartera por cobrar`);
  console.log(`   saldo:    ${money(c.balance ?? 0)} → $0.00`);
  console.log(`   mora:     ${c.moraMonthsCount} meses → 0`);
  console.log(`   cuotas:   ${c.cuotas.length} se eliminan (suman ${money(c.cuotas.reduce((s, q) => s + q.montoEsperado, 0))})`);
  console.log(`   lotes:    ${c.lots.map(l => `M${l.lot.manzana}-L${l.lot.lotNumber} (${l.lot.status}→UNAVAILABLE)`).join(', ')}`);

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }

  await prisma.$transaction(async tx => {
    await tx.cuota.deleteMany({ where: { contractId: c.id } });
    await tx.contract.update({
      where: { id: c.id },
      data: {
        status: 'CANCELED', balance: 0, moraMonthsCount: 0,
        notes: [c.notes, `Lotes apartados por el dueño del terreno (${DUENO}). No es una venta: no hay nada que cobrar.`]
          .filter(Boolean).join(' · '),
      },
    });
    await tx.lot.updateMany({
      where: { id: { in: c.lots.map(l => l.lot.id) } },
      data: { status: 'UNAVAILABLE' },
    });
  });
  console.log(`\n✅ ${CODIGO} marcado como apartado del dueño\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
