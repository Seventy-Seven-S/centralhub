// Corrige contratos cuyo calendario de cuotas arranca en el mes equivocado.
//
// El calendario ancla en `contract.startDate` y la cuota i vence en
// `startDate + i meses`. Si la migración dejó mal esa fecha, TODAS las
// etiquetas de mes se corren, los pagos caen en el mes que no es y el contrato
// aparece en mora falsa. Al 2026-09-19 son 88 contratos con 2+ meses de
// desfase, concentrados en Valle del Roble (33) y Monarca II (20).
//
//   npx tsx src/scripts/_historico/corregir-calendarios-desfasados.ts                 (dry-run, todos)
//   npx tsx src/scripts/_historico/corregir-calendarios-desfasados.ts --proyecto "Valle del Roble"
//   npx tsx src/scripts/_historico/corregir-calendarios-desfasados.ts --proyecto "Valle del Roble" --aplicar
//
// Usa el MISMO servicio que la edición manual del ADMIN, así que rehace el
// calendario, reaplica los pagos, recalcula balance y mora y deja bitácora.
import { PrismaClient, ContractStatus } from '@prisma/client';
import { editarDatosDelContrato } from '../../services/contratoEdicion.service';

const prisma = new PrismaClient();

// Un desfase de un mes es ruido normal de fechas de cobro: el cliente paga el
// 2 o el 28. Solo es defecto a partir de dos.
const DESFASE_MINIMO = 2;

const mesesEntre = (a: Date, b: Date) =>
  (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());

const comoMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

async function main() {
  const args = process.argv.slice(2);
  const aplicar = args.includes('--aplicar');
  const i = args.indexOf('--proyecto');
  const proyecto = i >= 0 ? args[i + 1] : undefined;

  const usuario = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true } });
  if (!usuario) throw new Error('No hay ningún usuario ADMIN al cual atribuir los cambios');

  console.log(aplicar ? '=== APLICANDO ===' : '=== DRY-RUN (nada se escribe) ===');
  console.log(`Atribuido a: ${usuario.email}${proyecto ? ` | proyecto: ${proyecto}` : ' | todos los proyectos'}\n`);

  const contratos = await prisma.contract.findMany({
    where: {
      status: { in: [ContractStatus.ACTIVE, ContractStatus.IN_MORA, ContractStatus.COMPLETED] },
      ...(proyecto ? { project: { name: proyecto } } : {}),
    },
    select: { id: true, contractNumber: true, project: { select: { name: true } } },
  });

  let revisados = 0, corregidos = 0, fallidos = 0;

  for (const c of contratos) {
    const [cuota1, primerPago] = await Promise.all([
      prisma.cuota.findFirst({ where: { contractId: c.id }, orderBy: { numeroCuota: 'asc' }, select: { fechaVencimiento: true, mes: true } }),
      prisma.payment.findFirst({
        where: { contractId: c.id, status: 'CONFIRMED', paymentType: { in: ['INSTALLMENT', 'EXTRA_PAYMENT'] } },
        orderBy: { paymentDate: 'asc' }, select: { paymentDate: true },
      }),
    ]);
    if (!cuota1 || !primerPago) continue;
    revisados++;

    const desfase = mesesEntre(cuota1.fechaVencimiento, primerPago.paymentDate);
    if (Math.abs(desfase) < DESFASE_MINIMO) continue;

    // El calendario debe arrancar en el mes del primer pago real del cliente.
    const mesInicio = comoMes(primerPago.paymentDate);

    try {
      const r = await editarDatosDelContrato(
        c.id,
        {
          mesInicioCalendario: mesInicio,
          motivo: `Calendario desfasado ${desfase} meses: la cuota 1 vencía en ${cuota1.mes} pero el cliente empezó a pagar en ${mesInicio}`,
        },
        usuario.id,
        { dryRun: !aplicar },
      );
      corregidos++;
      console.log(
        `${aplicar ? '✓' : '·'} ${c.contractNumber} (${c.project.name}) — ${desfase > 0 ? '+' : ''}${desfase} meses | ` +
        `${cuota1.mes} -> ${mesInicio} | mora ${r.moraAntes} -> ${r.moraDespues} | saldo $${r.balanceAntes?.toLocaleString('es-MX')} -> $${r.balanceDespues.toLocaleString('es-MX')}`,
      );
    } catch (e: any) {
      fallidos++;
      console.log(`✗ ${c.contractNumber} (${c.project.name}) — ${e.message}`);
    }
  }

  console.log(`\nRevisados ${revisados} | ${aplicar ? 'corregidos' : 'a corregir'} ${corregidos} | no se pudieron ${fallidos}`);
  if (!aplicar) console.log('(dry-run: vuelve a correr con --aplicar para escribir)');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
