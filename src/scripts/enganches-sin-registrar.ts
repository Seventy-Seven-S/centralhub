// Contratos cuyo enganche quedó en cero, pero cuyo primer pago parece ser el
// enganche capturado como mensualidad.
//
// Caso que lo destapó: V223 (Brenda Corona). Pagó $15,000 nueve días después
// de firmar y al día siguiente $3,667 con el concepto "(MARZO)". El sistema
// viejo lo registró como "Mensualidad" y así se migró, de modo que el contrato
// quedó con enganche $0 y sus 60 cuotas no cerraban contra lo financiado.
//
// La señal NO puede ser el campo `installmentAmount`: al aplicar el archivo de
// revisión, los contratos que cambiaron de plazo recibieron una mensualidad
// DEDUCIDA del precio, y si el precio o el enganche estaban mal, esa deducción
// tapó el problema. V223 es justo eso: su mensualidad decía $3,667, quedó en
// $3,917, y la de verdad son $3,667 con $15,000 de enganche.
//
// La señal buena es lo que el cliente PAGA cada mes: el monto que más repite.
//
//   npx tsx src/scripts/enganches-sin-registrar.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const $ = (n: unknown) => `$${Number(n).toLocaleString('es-MX')}`;

// Los clientes redondean: V223 debe $3,667 y paga $3,700. Comparar al peso
// exacto la dejaba fuera, que es justo el caso que destapó todo esto.
const TOLERANCIA_PESOS = 2;
/** Holgura al comparar contra lo que el cliente paga de verdad. */
const TOLERANCIA_REDONDEO = 60;

async function main() {
  const contratos = await prisma.contract.findMany({
    where: {
      downPayment: 0,
      status: { in: ['ACTIVE', 'IN_MORA', 'SIGNED', 'COMPLETED'] },
    },
    select: {
      id: true, codigoLegado: true, totalPrice: true, installmentAmount: true,
      installmentCount: true, contractDate: true,
      client: { select: { firstName: true, lastName: true } },
      project: { select: { code: true } },
    },
  });

  console.log(`Contratos vivos con enganche en CERO: ${contratos.length}\n`);

  const sospechosos: string[] = [];

  for (const c of contratos) {
    const plazo = c.installmentCount ?? 0;
    if (plazo <= 0) continue;

    const pagos = await prisma.payment.findMany({
      where: { contractId: c.id, status: 'CONFIRMED' },
      orderBy: { paymentDate: 'asc' },
      select: { amount: true, paymentDate: true, paymentType: true, concept: true },
    });
    if (pagos.length < 3) continue;

    const primero = pagos[0];
    const monto = Number(primero.amount);

    // Lo que el cliente paga de mensualidad: el monto que más se repite entre
    // los pagos que NO son el primero.
    const cuenta = new Map<number, number>();
    for (const p of pagos.slice(1)) {
      const m = Math.round(Number(p.amount));
      cuenta.set(m, (cuenta.get(m) ?? 0) + 1);
    }
    const [mensualidadReal, veces] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
    if (veces < 2 || mensualidadReal <= 0) continue;

    // El primer pago tiene que destacar contra esa mensualidad.
    if (Math.abs(monto - mensualidadReal) <= TOLERANCIA_REDONDEO) continue;

    // Y al tratarlo como enganche, la cuenta tiene que cerrar.
    const cuotaImplicita = (Number(c.totalPrice) - monto) / plazo;
    if (Math.abs(cuotaImplicita - mensualidadReal) > TOLERANCIA_REDONDEO) continue;

    const dias = Math.round(
      (primero.paymentDate.getTime() - c.contractDate.getTime()) / 86_400_000,
    );
    sospechosos.push(
      `${(c.codigoLegado ?? '?').padEnd(6)} ${c.project.code.padEnd(5)} ` +
      `${`${c.client.firstName} ${c.client.lastName}`.slice(0, 26).padEnd(28)} ` +
      `enganche ${$(monto).padStart(11)} a los ${String(dias).padStart(3)} días ` +
      `| paga ${$(mensualidadReal)} ×${veces} | el campo dice ${$(c.installmentAmount ?? 0)}`,
    );
  }

  console.log(`Con un primer pago que parece enganche: ${sospechosos.length}\n`);
  sospechosos.forEach(s => console.log('  ' + s));
  console.log('\nLa cuenta cierra en todos: precio − primer pago, entre el plazo, da su mensualidad.');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
