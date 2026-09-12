/**
 * revisar-casos.ts — contrasta códigos puntuales contra el archivo consolidado
 * (la fuente de verdad) y contra lo que tiene la app.
 *
 * Uso: npx tsx src/scripts/revisar-casos.ts SAN H026 H158 H159
 */
import { PrismaClient } from '@prisma/client';
import { leerArchivoMaestro, agruparPorCodigo } from './lib/archivoMaestro';

const prisma = new PrismaClient();
const PROYECTO = process.argv[2];
const CODIGOS = process.argv.slice(3).map(c => c.toUpperCase());
const money = (n: number | null) => n === null ? '—' : `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

async function main() {
  const filas = leerArchivoMaestro();
  const delProyecto = filas.filter(f => f.proyecto === PROYECTO);
  const porCodigo = agruparPorCodigo(delProyecto);

  const contratos = await prisma.contract.findMany({
    where: { project: { code: PROYECTO }, codigoLegado: { in: CODIGOS } },
    select: {
      codigoLegado: true, totalPrice: true, installmentAmount: true, balance: true, status: true,
      client: { select: { firstName: true, lastName: true } },
      lots: { select: { lot: { select: { manzana: true, lotNumber: true, areaM2: true } } } },
      payments: { where: { status: 'CONFIRMED' }, select: { amount: true } },
    },
  });
  const appPorCodigo = new Map(contratos.map(c => [c.codigoLegado ?? '', c]));

  for (const cod of CODIGOS) {
    // agruparPorCodigo indexa por PROYECTO|CODIGO, no solo por el codigo.
    const arch = porCodigo.get(`${PROYECTO}|${cod}`) ?? porCodigo.get(cod);
    const app = appPorCodigo.get(cod);
    console.log(`\n${'='.repeat(72)}\n${cod}`);

    if (!arch) console.log('  ARCHIVO: no aparece en la hoja del proyecto');
    else {
      console.log(`  ARCHIVO  cliente: ${arch.clientes.join(' / ') || '—'}`);
      console.log(`           lotes: ${[...arch.lotesRef].join(', ')}  (${arch.lotes})`);
      console.log(`           precio: ${money(arch.precioTotal)}   mensualidad: ${money(arch.mensualidad)}   m2: ${arch.m2Total ?? '—'}`);
      if (arch.deContado) console.log('           *** DE CONTADO ***');
      if (arch.precioSospechoso) console.log('           *** precio acumulado sospechoso ***');
      if (arch.lotesSinMensualidad) console.log(`           *** ${arch.lotesSinMensualidad} lote(s) sin mensualidad en el archivo ***`);
      // Las anotaciones de traspaso/rescisión viven en las filas, no en el grupo.
      for (const f of delProyecto.filter(f => f.codigo === cod)) {
        if (f.clienteAnterior || f.codigoAnterior) console.log(`           antes: ${f.codigoAnterior ?? '?'} ${f.clienteAnterior ?? ''}`);
        if (f.observaciones) console.log(`           nota: ${f.observaciones}`);
        if (f.estatus) console.log(`           estatus: ${f.estatus}`);
      }
    }

    if (!app) console.log('  APP: no existe el contrato');
    else {
      const pagado = app.payments.reduce((s, p) => s + p.amount, 0);
      console.log(`  APP      cliente: ${app.client.firstName} ${app.client.lastName}  [${app.status}]`);
      console.log(`           lotes: ${app.lots.map(l => `M${l.lot.manzana}-L${l.lot.lotNumber}`).join(', ') || '(ninguno)'}`);
      console.log(`           precio: ${money(app.totalPrice)}   mensualidad: ${money(app.installmentAmount)}   pagado: ${money(pagado)} en ${app.payments.length} pagos`);
    }
  }
  console.log('');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
