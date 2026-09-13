/**
 * crear-corte-desde-hoja.ts
 *
 * Registra una liquidación que se hizo en el sistema viejo, ligando EXACTAMENTE
 * los pagos que esa hoja de corte incluyó.
 *
 * No basta con "todos los pagos hasta tal fecha": un corte se cierra a una hora
 * del día y los cobros capturados después, aunque sean del mismo día, entran al
 * siguiente. Caso real en JSA4: el corte del 31-ago liquidó 22 pagos, pero ese
 * mismo día se capturaron 9 más (empezando por los de Cirila) que no se
 * entregaron ahí. Ligarlos por rango de fecha habría inflado el corte $41,876.
 *
 * Uso:
 *   npx tsx src/scripts/crear-corte-desde-hoja.ts "<archivo.xlsx>" "<hoja>" JSA4 2026-08-31 "<Dueño>"
 *   ... --confirm
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { extraerPagosDeFila } from './lib/pagosMultiHoja';

const prisma = new PrismaClient();
const [ARCHIVO, HOJA, PROYECTO, FECHA, DUENO] = process.argv.slice(2);
const CONFIRM = process.argv.includes('--confirm');
const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  if (!ARCHIVO || !HOJA || !PROYECTO || !FECHA || !DUENO)
    throw new Error('Uso: crear-corte-desde-hoja.ts <archivo.xlsx> "<hoja>" <PROYECTO> <YYYY-MM-DD> "<Dueño>" [--confirm]');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(FECHA)) throw new Error('La fecha va como YYYY-MM-DD');

  const ws = XLSX.readFile(ARCHIVO).Sheets[HOJA];
  if (!ws) throw new Error(`No existe la hoja "${HOJA}"`);
  const filas = (XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][])
    .map(extraerPagosDeFila)
    .filter((p): p is NonNullable<typeof p> => !!p && Math.abs(p.monto) < 5_000_000);

  const proyecto = await prisma.project.findFirst({ where: { code: PROYECTO }, select: { id: true, name: true } });
  if (!proyecto) throw new Error(`No existe el proyecto ${PROYECTO}`);

  // Sin esto, correrlo dos veces crea un corte duplicado: el emparejamiento es
  // por código + monto, y siempre hay algún pago suelto que vuelve a coincidir.
  const yaExiste = await prisma.corte.findFirst({
    where: { projectId: proyecto.id, fecha: new Date(`${FECHA}T00:00:00.000Z`) },
    select: { numero: true, totalIngresos: true },
  });
  if (yaExiste) {
    throw new Error(
      `${PROYECTO} ya tiene el corte #${yaExiste.numero} con fecha ${FECHA} ` +
      `(${money(yaExiste.totalIngresos)}). Si hay que rehacerlo, bórralo primero.`);
  }

  // Solo pagos SIN corte: uno ya liquidado no puede entrar a otro.
  const candidatos = await prisma.payment.findMany({
    where: { status: 'CONFIRMED', corteId: null, contract: { projectId: proyecto.id } },
    select: { id: true, amount: true, paymentDate: true, contract: { select: { codigoLegado: true } } },
    orderBy: { paymentDate: 'asc' },
  });

  const libres = [...candidatos];
  const ligar: typeof candidatos = [];
  const sinPar: typeof filas = [];
  for (const f of filas) {
    // Se empareja por código + monto y se consume: dos cobros iguales del mismo
    // cliente no pueden emparejarse ambos con un solo pago de la app.
    const i = libres.findIndex(p =>
      (p.contract.codigoLegado ?? '').toUpperCase() === f.cod &&
      Math.abs(p.amount - f.monto) < 0.5);
    if (i >= 0) ligar.push(libres.splice(i, 1)[0]); else sinPar.push(f);
  }

  const total = ligar.reduce((s, p) => s + p.amount, 0);
  const totalHoja = filas.reduce((s, f) => s + f.monto, 0);
  const fechas = ligar.map(p => p.paymentDate).sort((a, b) => a.getTime() - b.getTime());

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN'} · corte de ${PROYECTO} desde "${HOJA}"\n`);
  console.log(`   la hoja lista:   ${String(filas.length).padStart(4)} pagos · ${money(totalHoja)}`);
  console.log(`   se ligarían:     ${String(ligar.length).padStart(4)} pagos · ${money(total)}`);
  if (sinPar.length) {
    console.log(`\n   ⚠ ${sinPar.length} de la hoja SIN pago disponible en la app · ${money(sinPar.reduce((s, f) => s + f.monto, 0))}`);
    console.log('      (o no están migrados, o ya pertenecen a otro corte)');
    for (const f of sinPar.slice(0, 10)) console.log(`      ${iso(f.fecha)}  ${f.cod.padEnd(6)} ${money(f.monto).padStart(13)}`);
  }
  if (!ligar.length) { console.log('\nNo hay nada que ligar.\n'); return; }
  console.log(`\n   fecha del corte: ${FECHA} · dueño: ${DUENO}`);
  console.log(`   periodo de los pagos: ${iso(fechas[0])} → ${iso(fechas.at(-1)!)}`);

  const quedan = libres.length;
  console.log(`   quedarían sin corte: ${quedan} pagos · ${money(libres.reduce((s, p) => s + p.amount, 0))}`);

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!admin) throw new Error('No hay usuario ADMIN');
  const ultimo = await prisma.corte.findFirst({
    where: { projectId: proyecto.id }, orderBy: { numero: 'desc' }, select: { numero: true },
  });

  await prisma.$transaction(async tx => {
    const corte = await tx.corte.create({
      data: {
        projectId: proyecto.id, numero: (ultimo?.numero ?? 0) + 1,
        fecha: new Date(`${FECHA}T00:00:00.000Z`),
        periodoInicio: fechas[0], periodoFin: new Date(`${FECHA}T00:00:00.000Z`),
        totalIngresos: total, totalEgresos: 0, entregadoDueno: 0,
        dueno: DUENO, createdById: admin.id,
        notas: `Liquidación hecha en el sistema anterior (hoja "${HOJA}"). Liga los ${ligar.length} ` +
               `pagos que ese corte incluyó; los capturados después del cierre quedan para el siguiente.`,
      },
    });
    await tx.payment.updateMany({ where: { id: { in: ligar.map(p => p.id) } }, data: { corteId: corte.id } });
    console.log(`\n✅ Corte #${corte.numero} de ${PROYECTO} creado · ${ligar.length} pagos ligados · ${money(total)}\n`);
  });
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
