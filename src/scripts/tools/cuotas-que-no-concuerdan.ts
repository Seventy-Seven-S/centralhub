// Contratos cuyo CALENDARIO no concuerda con su propia mensualidad.
//
// Pasó con H119 y H100: el cliente debe $4,167 pero algunas cuotas quedaron en
// $4,200, el monto que él abona redondeando. Mientras la cuota valga de más,
// el sobrepago se lo come el propio calendario en vez de acumularse, y el
// cliente aparece en mora por centavos.
//
// Se arreglan rearmando el calendario desde los datos del contrato, que están
// bien: `forzarRecalculo`. El saldo no se mueve.
//
//   npx tsx src/scripts/tools/cuotas-que-no-concuerdan.ts            (dry-run)
//   npx tsx src/scripts/tools/cuotas-que-no-concuerdan.ts --aplicar
import { PrismaClient } from '@prisma/client';
import { editarDatosDelContrato } from '../../services/contratoEdicion.service';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const $ = (n: unknown) => `$${Number(n).toLocaleString('es-MX')}`;

/** La última cuota absorbe el residuo, así que siempre difiere: no cuenta. */
const esLaUltima = (numeroCuota: number, plazo: number) => numeroCuota === plazo;

/** Diferencias de uno o dos pesos son ruido del redondeo con que se arma el
 *  calendario, no un error que afecte al cliente. Rearmar decenas de contratos
 *  por un peso mueve más de lo que arregla. */
const DIFERENCIA_QUE_IMPORTA = 5;

/** Holgura al comprobar que la mensualidad del contrato cuadre con su propio
 *  financiado entre su plazo. Si NO cuadra, el dato sospechoso es el campo y
 *  no el calendario: rearmarlo escribiría cuotas por un monto equivocado.
 *  Pasó con C030 (el campo dice $16,035 y la cuenta da $10,000) y A013. */
const HOLGURA_COHERENCIA = 2;

async function main() {
  console.log(aplicar ? '=== APLICANDO ===\n' : '=== DRY-RUN (nada se escribe) ===\n');

  const contratos = await prisma.contract.findMany({
    where: { status: { in: ['ACTIVE', 'IN_MORA', 'SIGNED', 'COMPLETED'] } },
    select: {
      id: true, codigoLegado: true, installmentAmount: true, installmentCount: true,
      totalPrice: true, downPayment: true,
      moraMonthsCount: true, project: { select: { code: true } },
      client: { select: { firstName: true, lastName: true } },
    },
  });

  const afectados: Array<{ id: string; etiqueta: string }> = [];
  const sospechosos: string[] = [];

  for (const c of contratos) {
    const mensualidad = Math.round(Number(c.installmentAmount ?? 0));
    const plazo = c.installmentCount ?? 0;
    if (mensualidad <= 0 || plazo <= 0) continue;

    const cuotas = await prisma.cuota.findMany({
      where: { contractId: c.id },
      select: { numeroCuota: true, montoEsperado: true },
    });
    const discordantes = cuotas.filter(q =>
      !esLaUltima(q.numeroCuota, plazo)
      && Math.abs(Math.round(Number(q.montoEsperado)) - mensualidad) > DIFERENCIA_QUE_IMPORTA);
    if (discordantes.length === 0) continue;

    const montos = [...new Set(discordantes.map(q => Math.round(Number(q.montoEsperado))))];

    // ¿La mensualidad del contrato cuadra consigo misma? Si no, el problema
    // está en el campo y hay que mirarlo a mano, no rearmar el calendario.
    const financiado = Number(c.totalPrice) - Number(c.downPayment);
    const coherente = Math.abs(Math.round(financiado / plazo) - mensualidad) <= HOLGURA_COHERENCIA;
    if (!coherente) {
      sospechosos.push(
        `${(c.codigoLegado ?? '?').padEnd(6)} ${c.project.code.padEnd(5)} ` +
        `${`${c.client.firstName} ${c.client.lastName}`.slice(0, 24).padEnd(26)} ` +
        `el campo dice ${$(mensualidad)} pero ${$(financiado)} / ${plazo} = ${$(Math.round(financiado / plazo))}`);
      continue;
    }

    afectados.push({
      id: c.id,
      etiqueta: `${(c.codigoLegado ?? '?').padEnd(6)} ${c.project.code.padEnd(5)} ` +
        `${`${c.client.firstName} ${c.client.lastName}`.slice(0, 24).padEnd(26)} ` +
        `debe ${$(mensualidad)} pero ${discordantes.length} cuota(s) valen ${montos.map(m => $(m)).join(' / ')} | mora ${c.moraMonthsCount}`,
    });
  }

  console.log(`contratos vivos revisados: ${contratos.length}`);
  console.log(`con el calendario por rearmar: ${afectados.length}`);
  console.log(`con el CAMPO sospechoso, a revisar a mano: ${sospechosos.length}\n`);
  afectados.forEach(a => console.log('  ' + a.etiqueta));
  if (sospechosos.length) {
    console.log('\nEstos NO se tocan — su mensualidad no cuadra con su propio financiado:');
    sospechosos.forEach(s => console.log('  ' + s));
  }

  if (!aplicar) {
    console.log('\n(dry-run: vuelve a correr con --aplicar para escribir)');
    await prisma.$disconnect();
    return;
  }

  console.log('\nrearmando calendarios:');
  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true } });
  for (const a of afectados) {
    const r = await editarDatosDelContrato(a.id, {
      motivo: 'Su calendario tenía cuotas por un monto distinto al de su mensualidad, así que el sobrepago se lo comía el propio calendario en vez de acumularse.',
    }, admin.id, { forzarRecalculo: true });
    console.log(`  ${a.etiqueta.slice(0, 40)} mora ${r.moraAntes} -> ${r.moraDespues} | saldo ${$(r.balanceDespues)}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
