// Jose Luis Torres Pineda compró DOS lotes con dos códigos, pero la migración
// los dejó en una sola cuenta: H112 quedó con M4-L8 y M4-L23 y el doble de
// todo, mientras H113 quedó cancelado y vacío.
//
// Lo correcto, según el equipo (Miriam, 2026-10-05), es un contrato por lote:
//   H112 M4-L8  — $270,000, enganche $15,000, mensualidad $3,542, 1er mes feb 2026
//   H113 M4-L23 — lo mismo
//
// La separación es limpia porque los pagos vienen EN PARES: cada fecha tiene
// uno etiquetado "Lote 8" y otro "Lote 23". Los dos del 7 de septiembre
// perdieron esa etiqueta al renumerarse, pero son idénticos, así que uno va a
// cada contrato.
//
//   npx tsx src/scripts/_historico/separar-h112-h113.ts            (dry-run)
//   npx tsx src/scripts/_historico/separar-h112-h113.ts --aplicar
import { PrismaClient, ContractStatus, PaymentStatus } from '@prisma/client';
import { editarDatosDelContrato } from '../../services/contratoEdicion.service';
import * as fs from 'fs';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const $ = (n: unknown) => `$${Number(n).toLocaleString('es-MX')}`;

const ACUERDO = {
  precio: 270000, enganche: 15000, mensualidad: 3542, plazo: 72, primerMes: '2026-02',
};

/** A qué lote apunta el concepto de un pago. */
function loteDelConcepto(concepto: string): 'L8' | 'L23' | null {
  if (/lote\s*23/i.test(concepto)) return 'L23';
  if (/lote\s*8/i.test(concepto)) return 'L8';
  return null;
}

async function main() {
  console.log(aplicar ? '=== APLICANDO ===\n' : '=== DRY-RUN (nada se escribe) ===\n');

  const h112 = await prisma.contract.findFirstOrThrow({
    where: { codigoLegado: 'H112' },
    select: { id: true, clientId: true, totalPrice: true, lots: { select: { id: true, lotId: true, lot: { select: { manzana: true, lotNumber: true } } } } },
  });
  const h113 = await prisma.contract.findFirstOrThrow({
    where: { codigoLegado: 'H113' },
    select: { id: true, clientId: true, status: true, lots: { select: { id: true } } },
  });

  const pagos = await prisma.payment.findMany({
    where: { contractId: h112.id, status: PaymentStatus.CONFIRMED },
    orderBy: [{ paymentDate: 'asc' }, { paymentNumber: 'asc' }],
  });

  // Reparto: los etiquetados por su lote, y los ambiguos alternando — vienen en
  // pares idénticos, así que uno a cada contrato.
  const seQuedan: typeof pagos = [];
  const seVan: typeof pagos = [];
  let ambiguos = 0;
  for (const p of pagos) {
    const lote = loteDelConcepto(p.concept);
    if (lote === 'L8') seQuedan.push(p);
    else if (lote === 'L23') seVan.push(p);
    else { (ambiguos++ % 2 === 0 ? seQuedan : seVan).push(p); }
  }

  const suma = (l: typeof pagos) => l.reduce((s, p) => s + Number(p.amount), 0);
  console.log(`H112 se queda con M4-L8:  ${seQuedan.length} pagos, ${$(suma(seQuedan))}`);
  console.log(`H113 recibe M4-L23:      ${seVan.length} pagos, ${$(suma(seVan))}`);
  console.log(`   (${ambiguos} pagos sin etiqueta de lote, repartidos uno y uno)`);
  console.log(`   suman ${$(suma(pagos))}, que es todo lo que tenía H112\n`);

  if (seQuedan.length !== seVan.length) {
    throw new Error(`El reparto quedó disparejo: ${seQuedan.length} contra ${seVan.length}. No se toca nada.`);
  }

  const loteL23 = h112.lots.find(l => l.lot.manzana === 4 && l.lot.lotNumber === '23');
  if (!loteL23) throw new Error('H112 ya no tiene el lote M4-L23');

  console.log(`cada contrato queda en: precio ${$(ACUERDO.precio)}, enganche ${$(ACUERDO.enganche)}, ` +
    `mensualidad ${$(ACUERDO.mensualidad)} × ${ACUERDO.plazo}, 1er mes ${ACUERDO.primerMes}`);
  console.log(`   saldo esperado de cada uno: ${$(ACUERDO.precio - suma(seQuedan))} y ${$(ACUERDO.precio - suma(seVan))}\n`);

  if (!aplicar) {
    console.log('(dry-run: vuelve a correr con --aplicar para escribir)');
    await prisma.$disconnect();
    return;
  }

  // Respaldo: esta operación mueve pagos entre contratos y no se deshace sola.
  fs.writeFileSync(`backups/separacion-H112-${Date.now()}.json`,
    JSON.stringify({ h112, h113, pagos, seQuedan: seQuedan.map(p => p.id), seVan: seVan.map(p => p.id) }, null, 2));
  console.log('respaldo guardado en backups/\n');

  await prisma.$transaction(async tx => {
    // El lote 23 pasa a H113.
    await tx.contractLot.update({ where: { id: loteL23.id }, data: { contractId: h113.id } });
    // Sus pagos también, con el cliente que le corresponde a ese contrato.
    for (const p of seVan) {
      await tx.payment.update({
        where: { id: p.id },
        data: {
          contractId: h113.id, clientId: h113.clientId,
          // El corte NO se toca: los dos contratos son del mismo proyecto, así
          // que el dinero ya reportado sigue reportado.
          notes: `${p.notes ? `${p.notes} — ` : ''}Separado a H113 el ${new Date().toISOString().slice(0, 10)}: era el pago del lote 23, que vivía junto con el del lote 8.`,
        },
      });
    }
    await tx.contract.update({ where: { id: h113.id }, data: { status: ContractStatus.ACTIVE } });
  });
  console.log('lote y pagos movidos; H113 reactivado\n');

  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true } });
  const motivo = 'Eran dos lotes con dos códigos y la migración los dejó en una sola cuenta. Se separan en un contrato por lote, con las cifras que confirmó el equipo.';

  for (const [codigo, esperado] of [['H112', suma(seQuedan)], ['H113', suma(seVan)]] as [string, number][]) {
    const c = await prisma.contract.findFirstOrThrow({ where: { codigoLegado: codigo }, select: { id: true } });
    const r = await editarDatosDelContrato(c.id, {
      totalPrice: ACUERDO.precio, downPayment: ACUERDO.enganche,
      installmentAmount: ACUERDO.mensualidad, installmentCount: ACUERDO.plazo,
      mesInicioCalendario: ACUERDO.primerMes, motivo,
    }, admin.id);

    const act = await prisma.contract.findUniqueOrThrow({
      where: { id: c.id },
      select: { balance: true, installmentAmount: true, installmentCount: true, status: true, lots: { select: { lot: { select: { manzana: true, lotNumber: true } } } } },
    });
    const pagadas = await prisma.cuota.count({ where: { contractId: c.id, status: 'PAGADA' } });
    const cu1 = await prisma.cuota.findFirst({ where: { contractId: c.id }, orderBy: { numeroCuota: 'asc' }, select: { mes: true } });
    const saldoEsperado = ACUERDO.precio - esperado;

    console.log(`${codigo}: ${act.status} | lote ${act.lots.map(l => `M${l.lot.manzana}-L${l.lot.lotNumber}`).join(',')} | ` +
      `mensualidad ${$(act.installmentAmount ?? 0)} × ${act.installmentCount}`);
    console.log(`   cuota 1 ${cu1?.mes} | ${pagadas} mensualidades pagadas | mora ${r.moraDespues}`);
    console.log(`   invariante: saldo ${$(act.balance)} ${Math.abs(saldoEsperado - Number(act.balance)) < 0.01 ? 'OK' : `<-- se esperaba ${$(saldoEsperado)}`}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
