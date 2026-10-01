// Da de alta el lote M1-L31 de Santander y su contrato.
//
// El lote está vendido desde el 9 de septiembre de 2026 pero nunca se creó en
// este sistema: el archivo del equipo lo marca "FALTA DARLO DE ALTA NUEVO
// SISTEMA". Venía señalado desde la revisión de septiembre.
//
//   npx tsx src/scripts/alta-santander-m1l31.ts            (dry-run)
//   npx tsx src/scripts/alta-santander-m1l31.ts --aplicar
import { PrismaClient, LotStatus, ContractStatus, PaymentPlanType } from '@prisma/client';
import contractService from '../services/contract.service';
import { round2 } from '../utils/money';
import { siguienteGlobalCode } from '../utils/clientCode';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const $ = (n: unknown) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Fila 32 de "PRECIO, SUPERFICIE, MENSUALIDAD", tal como la entregó el equipo.
const DATOS = {
  manzana: 1, lote: '31', m2: 200, precioM2: 1400, precio: 280000,
  titular:    { firstName: 'Jacqueline', lastName: 'Urbano Salamihua' },
  coTitular:  { firstName: 'Jesus Olegario', lastName: 'Acosta Rodriguez' },
  plazo: 60, enganche: 15000, mensualidad: 4416.66,
  fechaContrato: new Date('2026-09-09T12:00:00Z'),
  // "octubre/26": la cuota 1 cae en octubre, así que el calendario ancla en
  // septiembre — la cuota i vence en startDate + i meses.
  mesPrimeraMensualidad: '2026-10',
};

async function main() {
  console.log(aplicar ? '=== APLICANDO ===\n' : '=== DRY-RUN (nada se escribe) ===\n');

  const proyecto = await prisma.project.findFirstOrThrow({ where: { code: 'SAN' }, select: { id: true, name: true } });

  const financiado = round2(DATOS.precio - DATOS.enganche);
  console.log(`Santander M${DATOS.manzana}-L${DATOS.lote} · ${DATOS.m2} m² × ${$(DATOS.precioM2)} = ${$(DATOS.precio)}`);
  console.log(`   ${DATOS.titular.firstName} ${DATOS.titular.lastName}`);
  console.log(`   y ${DATOS.coTitular.firstName} ${DATOS.coTitular.lastName}`);
  console.log(`   enganche ${$(DATOS.enganche)} | financiado ${$(financiado)} a ${DATOS.plazo} meses`);
  console.log(`   ${$(financiado)} / ${DATOS.plazo} = ${$(financiado / DATOS.plazo)} (el archivo dice ${$(DATOS.mensualidad)})`);
  console.log(`   primera mensualidad en ${DATOS.mesPrimeraMensualidad}\n`);

  const yaLote = await prisma.lot.findFirst({
    where: { projectId: proyecto.id, manzana: DATOS.manzana, lotNumber: DATOS.lote },
  });
  if (yaLote) { console.log('El lote ya existe — no se hace nada.'); await prisma.$disconnect(); return; }

  if (!aplicar) {
    console.log('Se crearía: el lote, la clienta, el contrato (con su cotitular) y su calendario.');
    console.log('\n(dry-run: vuelve a correr con --aplicar para escribir)');
    await prisma.$disconnect();
    return;
  }

  const lote = await prisma.lot.create({
    data: {
      projectId: proyecto.id, manzana: DATOS.manzana, lotNumber: DATOS.lote,
      areaM2: DATOS.m2, basePrice: DATOS.precio,
      currentPrice: DATOS.precio, status: LotStatus.AVAILABLE,
    },
  });
  console.log(`lote creado: M${lote.manzana}-L${lote.lotNumber}`);

  const codigos = await prisma.client.findMany({ select: { globalCode: true } });
  const cliente = await prisma.client.create({
    data: {
      ...DATOS.titular,
      globalCode: siguienteGlobalCode(codigos.map(c => c.globalCode)),
      // El equipo no entregó teléfono ni correo; se capturan después.
      phone: '', email: null,
    },
  });
  console.log(`clienta creada: ${cliente.firstName} ${cliente.lastName}`);

  const contrato = await contractService.createContract({
    clientId: cliente.id, projectId: proyecto.id, lotIds: [lote.id],
    totalPrice: DATOS.precio, downPayment: DATOS.enganche,
    financedAmount: financiado, interestRate: 0, termMonths: DATOS.plazo,
    // La cuota 1 vence un mes después del ancla.
    startDate: new Date('2026-09-01T12:00:00Z'),
    notes: 'Alta tardía: el lote estaba vendido desde el 9 de septiembre de 2026 y nunca se creó en este sistema.',
  } as never);
  console.log(`contrato creado: ${contrato.contractNumber}`);

  await contractService.addCoOwner(contrato.id, {
    ...DATOS.coTitular, ine: '', isPrimary: false,
  } as never);
  console.log(`cotitular agregado: ${DATOS.coTitular.firstName} ${DATOS.coTitular.lastName}`);

  const cu = await prisma.cuota.findFirst({
    where: { contractId: contrato.id }, orderBy: { numeroCuota: 'asc' },
    select: { mes: true, montoEsperado: true },
  });
  const total = await prisma.cuota.count({ where: { contractId: contrato.id } });
  console.log(`\ncalendario: ${total} cuotas, la primera en ${cu?.mes} por ${$(cu?.montoEsperado ?? 0)}`);
  console.log(`saldo: ${$(contrato.balance)} (precio ${$(DATOS.precio)}, aún sin pagos registrados)`);
  console.log('\nFALTA capturarle el enganche de ' + $(DATOS.enganche) + ' y las mensualidades que haya pagado.');

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
