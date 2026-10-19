// Repone el enganche de los contratos donde quedó en cero porque el pago se
// capturó como mensualidad en el sistema viejo.
//
// Los detecta `enganches-sin-registrar.ts`: el primer pago destaca contra lo
// que el cliente paga cada mes, llegó a los pocos días de firmar, y al
// tratarlo como enganche la cuenta cierra — precio menos ese pago, entre el
// plazo, da su mensualidad real.
//
// La mensualidad NO se captura aquí: se deriva sola al corregir el enganche.
// En los tres casos el campo traía una mensualidad inflada, porque al aplicar
// el archivo de revisión se dedujo contra un financiado que incluía el
// enganche no registrado.
//
// Se le pasan los códigos ya confirmados con el equipo, uno por uno: el
// detector los propone, pero cada caso merece su revisión antes de escribir.
//
//   npx tsx src/scripts/tools/reponer-enganches.ts F158            (dry-run)
//   npx tsx src/scripts/tools/reponer-enganches.ts F158 --aplicar
import { PrismaClient, PaymentType } from '@prisma/client';
import { editarDatosDelContrato } from '../../services/contratoEdicion.service';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const $ = (n: unknown) => `$${Number(n).toLocaleString('es-MX')}`;

const CASOS = process.argv.slice(2).filter(a => !a.startsWith('--'));

if (CASOS.length === 0) {
  console.error('Uso: npx tsx src/scripts/tools/reponer-enganches.ts <CODIGO> [<CODIGO>...] [--aplicar]');
  console.error('Para encontrar candidatos: npx tsx src/scripts/tools/enganches-sin-registrar.ts');
  process.exit(1);
}

async function main() {
  console.log(aplicar ? '=== APLICANDO ===\n' : '=== DRY-RUN (nada se escribe) ===\n');
  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true } });

  for (const codigo of CASOS) {
    const c = await prisma.contract.findFirstOrThrow({
      where: { codigoLegado: codigo },
      select: {
        id: true, totalPrice: true, downPayment: true, installmentAmount: true,
        installmentCount: true, client: { select: { firstName: true, lastName: true } },
      },
    });

    if (Number(c.downPayment) > 0) {
      console.log(`${codigo}: ya tiene enganche de ${$(c.downPayment)} — se salta\n`);
      continue;
    }

    const primero = await prisma.payment.findFirstOrThrow({
      where: { contractId: c.id, status: 'CONFIRMED' },
      orderBy: { paymentDate: 'asc' },
      select: { id: true, amount: true, paymentDate: true, paymentType: true },
    });
    const enganche = Number(primero.amount);

    console.log(`${codigo} ${c.client.firstName} ${c.client.lastName}`);
    console.log(`   pago del ${primero.paymentDate.toISOString().slice(0, 10)} por ${$(enganche)}: ${primero.paymentType} -> DOWN_PAYMENT`);

    if (aplicar) {
      await prisma.payment.update({
        where: { id: primero.id },
        data: {
          paymentType: PaymentType.DOWN_PAYMENT,
          notes: 'Reclasificado: venía del sistema viejo como mensualidad, pero es el enganche del contrato.',
        },
      });
    }

    const r = await editarDatosDelContrato(c.id, {
      downPayment: enganche,
      motivo: `Su enganche de ${$(enganche)} estaba capturado como mensualidad desde el sistema viejo, así que el contrato quedaba con enganche en cero y la mensualidad salía inflada.`,
    }, admin.id, { dryRun: !aplicar });

    r.cambios
      .filter(x => !['balance', 'moraMonthsCount'].includes(x.campo))
      .forEach(x => console.log(`   ${x.campo}: ${x.valorAnterior} -> ${x.valorNuevo}`));

    // El saldo NO debe moverse: no entra ni sale dinero, solo cambia de qué
    // tipo es un pago. En seco el servicio lo calcula sin la reclasificación
    // (que solo ocurre al aplicar), así que su cifra sale baja por el monto
    // del enganche — se muestra la real para no leer un número engañoso.
    const { _sum } = await prisma.payment.aggregate({
      where: { contractId: c.id, status: 'CONFIRMED' }, _sum: { amount: true },
    });
    const saldoReal = Number(c.totalPrice) - Number(_sum.amount ?? 0);
    console.log(`   mora ${r.moraAntes} -> ${r.moraDespues} | saldo ${$(saldoReal)} (no se mueve: no entra ni sale dinero)`);

    if (aplicar) {
      const act = await prisma.contract.findUniqueOrThrow({ where: { id: c.id }, select: { totalPrice: true, balance: true, installmentAmount: true } });
      const ok = Math.abs(saldoReal - Number(act.balance)) < 0.01;
      console.log(`   mensualidad quedó en ${$(act.installmentAmount ?? 0)}`);
      console.log(`   invariante: saldo ${$(act.balance)} ${ok ? 'OK' : `<-- DESCUADRE, se esperaba ${$(saldoReal)}`}`);
    }
    console.log('');
  }

  if (!aplicar) console.log('(dry-run: vuelve a correr con --aplicar para escribir)');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
