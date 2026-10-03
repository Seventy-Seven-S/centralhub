// Reescribe el nombre del mes de las cuotas cuyo texto no concuerda con su
// fecha de vencimiento.
//
// El texto salía de `toLocaleDateString` en hora local: una fecha guardada a
// medianoche UTC retrocede un día en México y cae en el mes anterior, así que
// una cuota que vence el 1 de junio se leía "mayo". Es el dato que lee el
// equipo, y parte de lo que reportaron como meses equivocados.
//
// Solo toca el TEXTO. Las fechas de vencimiento están bien y no se mueven, así
// que no hay que rearmar calendarios ni reaplicar pagos.
//
//   npx tsx src/scripts/corregir-etiquetas-de-mes.ts            (dry-run)
//   npx tsx src/scripts/corregir-etiquetas-de-mes.ts --aplicar
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** El nombre que le toca a una fecha, leída en UTC — igual que buildCuotaRows. */
const nombreDelMes = (d: Date) =>
  d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });

async function main() {
  console.log(aplicar ? '=== APLICANDO ===\n' : '=== DRY-RUN (nada se escribe) ===\n');

  const cuotas = await prisma.cuota.findMany({
    select: { id: true, mes: true, numeroCuota: true, fechaVencimiento: true, contractId: true },
  });

  const malas = cuotas.filter(c =>
    !c.mes.toLowerCase().includes(MESES[c.fechaVencimiento.getUTCMonth()]));

  const porContrato = new Map<string, typeof malas>();
  for (const c of malas) {
    if (!porContrato.has(c.contractId)) porContrato.set(c.contractId, []);
    porContrato.get(c.contractId)!.push(c);
  }

  console.log(`cuotas revisadas: ${cuotas.length}`);
  console.log(`con el texto equivocado: ${malas.length} en ${porContrato.size} contratos\n`);

  for (const [contractId, lista] of porContrato) {
    const ct = await prisma.contract.findUniqueOrThrow({
      where: { id: contractId },
      select: { codigoLegado: true, project: { select: { code: true } }, client: { select: { firstName: true, lastName: true } } },
    });
    const ejemplo = lista[0];
    console.log(`${(ct.codigoLegado ?? '?').padEnd(6)} ${ct.project.code.padEnd(5)} ` +
      `${`${ct.client.firstName} ${ct.client.lastName}`.slice(0, 24).padEnd(26)} ${lista.length} cuota(s)`);
    console.log(`   ejemplo: la #${ejemplo.numeroCuota} vence el ${ejemplo.fechaVencimiento.toISOString().slice(0, 10)}, ` +
      `decía "${ejemplo.mes}" y dirá "${nombreDelMes(ejemplo.fechaVencimiento)}"`);

    if (aplicar) {
      for (const c of lista) {
        await prisma.cuota.update({ where: { id: c.id }, data: { mes: nombreDelMes(c.fechaVencimiento) } });
      }
    }
  }

  if (aplicar) {
    const quedan = (await prisma.cuota.findMany({ select: { mes: true, fechaVencimiento: true } }))
      .filter(c => !c.mes.toLowerCase().includes(MESES[c.fechaVencimiento.getUTCMonth()]));
    console.log(`\ncorregidas ${malas.length}; quedan con el texto equivocado: ${quedan.length}`);
  } else {
    console.log('\n(dry-run: vuelve a correr con --aplicar para escribir)');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
