// Contratos cuyo enganche quedó en cero porque el sistema viejo lo capturó
// como mensualidad — solo, o junto con una mensualidad en el mismo movimiento.
//
// El enganche NO se adivina: se despeja. Si el cliente paga M al mes durante N
// meses y el precio es P, entonces su enganche es P − N×M. Después se busca el
// pago que lo respalde.
//
// Esto no puede apoyarse en el campo `installmentAmount`: al aplicar el
// archivo de revisión, los contratos que cambiaron de plazo recibieron una
// mensualidad DEDUCIDA del precio, y con el enganche en cero esa deducción
// salió inflada y tapó el problema. V223 decía $3,917 debiendo $3,667.
//
//   npx tsx src/scripts/enganches-sin-registrar.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const $ = (n: unknown) => `$${Number(n).toLocaleString('es-MX')}`;

/** Los clientes redondean: quien debe $3,667 abona $3,700. */
const TOLERANCIA_REDONDEO = 60;
/** Por debajo de esto no vale la pena: es ruido de centavos, no un enganche. */
const ENGANCHE_MINIMO = 1000;

async function main() {
  const contratos = await prisma.contract.findMany({
    where: { downPayment: 0, status: { in: ['ACTIVE', 'IN_MORA', 'SIGNED', 'COMPLETED'] } },
    select: {
      id: true, codigoLegado: true, totalPrice: true, installmentAmount: true,
      installmentCount: true, contractDate: true,
      client: { select: { firstName: true, lastName: true } },
      project: { select: { code: true } },
    },
  });

  console.log(`Contratos vivos con enganche en CERO: ${contratos.length}\n`);

  const enteros: string[] = [];
  const partidos: string[] = [];
  const sinExplicar: string[] = [];

  for (const c of contratos) {
    const plazo = c.installmentCount ?? 0;
    if (plazo <= 0) continue;

    const pagos = await prisma.payment.findMany({
      where: { contractId: c.id, status: 'CONFIRMED' },
      orderBy: { paymentDate: 'asc' },
      select: { amount: true, paymentDate: true, paymentType: true },
    });
    if (pagos.length < 3) continue;

    // Lo que el cliente paga de verdad: el monto que más repite, sin contar el primero.
    const cuenta = new Map<number, number>();
    for (const p of pagos.slice(1)) {
      const m = Math.round(Number(p.amount));
      cuenta.set(m, (cuenta.get(m) ?? 0) + 1);
    }
    const [mensualidadReal, veces] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
    if (veces < 2 || mensualidadReal <= 0) continue;

    // El enganche que explica su mensualidad.
    const engancheImplicito = Number(c.totalPrice) - plazo * mensualidadReal;
    if (engancheImplicito < ENGANCHE_MINIMO) continue;

    const primero = Number(pagos[0].amount);
    const dias = Math.round((pagos[0].paymentDate.getTime() - c.contractDate.getTime()) / 86_400_000);
    const etiqueta =
      `${(c.codigoLegado ?? '?').padEnd(6)} ${c.project.code.padEnd(5)} ` +
      `${`${c.client.firstName} ${c.client.lastName}`.slice(0, 24).padEnd(26)} ` +
      `enganche ${$(engancheImplicito).padStart(11)} | paga ${$(mensualidadReal).padStart(9)} ×${veces} ` +
      `| 1er pago ${$(primero).padStart(11)} a los ${String(dias).padStart(3)} días`;

    if (Math.abs(primero - engancheImplicito) <= TOLERANCIA_REDONDEO) {
      enteros.push(etiqueta);                                     // el pago ES el enganche
    } else if (Math.abs(primero - engancheImplicito - mensualidadReal) <= TOLERANCIA_REDONDEO) {
      partidos.push(etiqueta);                                    // trae enganche + una mensualidad
    } else {
      sinExplicar.push(etiqueta);                                 // la cuenta cierra, el pago no cuadra
    }
  }

  console.log(`A) El primer pago ES el enganche — se reclasifica (${enteros.length})`);
  enteros.forEach(s => console.log('   ' + s));
  console.log(`\nB) El primer pago trae el enganche MÁS una mensualidad — se parte (${partidos.length})`);
  partidos.forEach(s => console.log('   ' + s));
  console.log(`\nC) La cuenta pide un enganche, pero ningún pago lo respalda — a revisar (${sinExplicar.length})`);
  sinExplicar.forEach(s => console.log('   ' + s));

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
