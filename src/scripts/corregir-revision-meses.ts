// Aplica el archivo "REVISION DE MESES": el equipo revisó contrato por contrato
// y anotó el mes de la primera mensualidad, la mensualidad y el plazo correctos.
// Una celda vacía significa que ese dato ya está bien en el sistema.
//
// El hallazgo de fondo: la migración puso la fecha de inicio igual a la del
// contrato, así que la cuota 1 cae un mes después de firmar. La regla real del
// negocio es que quien firma después del día 20 empieza a pagar un mes más
// tarde — 516 de 596 contratos quedaron exactamente un mes atrasados.
//
//   npx tsx src/scripts/corregir-revision-meses.ts                    (dry-run)
//   npx tsx src/scripts/corregir-revision-meses.ts --hoja "MONARCA"
//   npx tsx src/scripts/corregir-revision-meses.ts --hoja "MONARCA" --aplicar
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { editarDatosDelContrato } from '../services/contratoEdicion.service';
import { mesDesdeNombre } from '../services/lib/mesDesdeNombre';
import { elLoteConcuerda } from '../services/lib/cruceLote';

const prisma = new PrismaClient();
const ARCHIVO = 'backups/REVISION DE MESES .xlsx';

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const pesos = (n: number) => `$${n.toLocaleString('es-MX')}`;

/** Qué tan lejos del PRIMER PAGO puede quedar la primera mensualidad deducida.
 *  Un cliente puede pagar varios meses juntos o adelantar uno o dos, pero no
 *  medio año: más que esto y lo más probable es que el año esté mal deducido. */
const MESES_DE_SALTO_ACEPTABLE = 6;

interface Correccion {
  hoja: string; codigo: string; cliente: string;
  // Manzana y lote: el dato duro con el que se verifica que la fila sea de
  // este contrato. El código a veces viene mal tecleado o repetido.
  manzana: number | null; lote: string | null;
  mes: string | null; mensualidad: number | null; plazo: number | null;
}

/** El plazo viene a veces como "60 MESES" o con basura. Solo cuenta el número. */
function plazoDe(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 ? v : null;
  const m = String(v ?? '').match(/\d+/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function leer(): Correccion[] {
  const wb = XLSX.readFile(ARCHIVO);
  const out: Correccion[] = [];
  for (const hoja of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true }) as unknown[][];
    const iH = filas.findIndex(f => String(f?.[0] ?? '').trim().toUpperCase() === 'CODIGO');
    if (iH < 0) continue;

    for (const f of filas.slice(iH + 1)) {
      const codigo = String(f?.[0] ?? '').trim().toUpperCase();
      if (!codigo) continue;
      const mes = f[4] ? String(f[4]).trim() : null;
      const mensualidad = typeof f[5] === 'number' && f[5] > 0 ? f[5] : null;
      const plazo = plazoDe(f[6]);
      if (!mes && !mensualidad && !plazo) continue;   // vacío = ya está bien
      const manzana = Number(f[1]);
      out.push({
        hoja: hoja.trim(), codigo, cliente: String(f[3] ?? '').trim(),
        manzana: Number.isFinite(manzana) ? manzana : null,
        lote: f[2] !== null && f[2] !== undefined && String(f[2]).trim() !== '' ? String(f[2]).trim() : null,
        mes, mensualidad, plazo,
      });
    }
  }
  return out;
}

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const soloHoja = arg('hoja')?.trim().toUpperCase();

  const usuario = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true } });
  if (!usuario) throw new Error('No hay ningún ADMIN al cual atribuir los cambios');

  console.log(aplicar ? '=== APLICANDO ===' : '=== DRY-RUN (nada se escribe) ===');
  console.log(`Atribuido a: ${usuario.email}${soloHoja ? ` | solo la hoja "${soloHoja}"` : ' | todas las hojas'}\n`);

  const todas = leer().filter(c => !soloHoja || c.hoja.toUpperCase() === soloHoja);

  let aplicados = 0, sinCambio = 0, noExiste = 0, fallidos = 0, dudosos = 0, descuadrados = 0;
  const problemas: string[] = [];
  let moraBaja = 0, moraSube = 0;

  for (const c of todas) {
    const contrato = await prisma.contract.findFirst({
      where: { codigoLegado: c.codigo },
      select: {
        id: true, contractDate: true, status: true,
        lots: { select: { lot: { select: { manzana: true, lotNumber: true } } } },
      },
    });
    if (!contrato) { noExiste++; problemas.push(`${c.codigo}: no existe en la base`); continue; }

    // El código no basta: en este mismo archivo V292 venía en tres filas de
    // tres clientes distintos, y corregir por código le escribió a uno el dato
    // de otro. Si la manzana y el lote no concuerdan, no se toca.
    const lotesDelContrato = contrato.lots.map(l => l.lot);
    if (!elLoteConcuerda(lotesDelContrato, c.manzana, c.lote)) {
      descuadrados++;
      const tiene = lotesDelContrato.map(l => `M${l.manzana}-L${l.lotNumber}`).join(', ') || 'ninguno';
      problemas.push(
        `${c.codigo}: la fila dice M${c.manzana}-L${c.lote} (${c.cliente}) pero ese contrato tiene ${tiene} ` +
        `— el código no corresponde a ese lote`,
      );
      continue;
    }

    // El año del mes se deduce contra el PRIMER PAGO del cliente, no contra la
    // fecha del contrato: esa fecha es cuándo se registró en el sistema y en
    // varios proyectos el cliente ya venía pagando desde antes.
    const primerPago = await prisma.payment.findFirst({
      where: { contractId: contrato.id, status: 'CONFIRMED', paymentType: { in: ['INSTALLMENT', 'EXTRA_PAYMENT'] } },
      orderBy: { paymentDate: 'asc' }, select: { paymentDate: true },
    });
    const ancla = primerPago?.paymentDate ?? contrato.contractDate;

    const mesInicio = c.mes ? mesDesdeNombre(c.mes, ancla) : undefined;
    if (c.mes && !mesInicio) { fallidos++; problemas.push(`${c.codigo}: no se entiende el mes "${c.mes}"`); continue; }

    // El mes viene sin año y aquí se deduce. Se compara contra el PRIMER PAGO,
    // que es la referencia real de cuándo empezó a pagar: si la deducción cae
    // lejos de ahí, el año probablemente está mal y lo revisa una persona en
    // vez de moverle el calendario a ciegas.
    if (mesInicio && primerPago) {
      const [aN, mN] = mesInicio.split('-').map(Number);
      const distancia = Math.abs(
        (aN - primerPago.paymentDate.getUTCFullYear()) * 12 +
        (mN - 1 - primerPago.paymentDate.getUTCMonth()),
      );
      if (distancia > MESES_DE_SALTO_ACEPTABLE) {
        dudosos++;
        problemas.push(
          `${c.codigo}: el mes deducido (${mesInicio}) queda a ${distancia} meses de su primer pago ` +
          `(${primerPago.paymentDate.toISOString().slice(0, 10)}) — confirmar el año con el equipo`,
        );
        continue;
      }
    }

    try {
      const r = await editarDatosDelContrato(contrato.id, {
        ...(mesInicio ? { mesInicioCalendario: mesInicio } : {}),
        ...(c.mensualidad ? { installmentAmount: c.mensualidad } : {}),
        ...(c.plazo ? { installmentCount: c.plazo } : {}),
        motivo: `Revisión del equipo: ${[
          c.mes ? `primera mensualidad en ${c.mes}` : '',
          c.mensualidad ? `mensualidad ${pesos(c.mensualidad)}` : '',
          c.plazo ? `plazo ${c.plazo} meses` : '',
        ].filter(Boolean).join(', ')}`,
      }, usuario.id, { dryRun: !aplicar });

      aplicados++;
      if (r.moraDespues < r.moraAntes) moraBaja++;
      if (r.moraDespues > r.moraAntes) moraSube++;

      const campos = r.cambios.filter(x => !['balance', 'moraMonthsCount'].includes(x.campo));
      console.log(`${aplicar ? '✓' : '·'} ${c.codigo.padEnd(6)} ${c.cliente.slice(0, 26).padEnd(28)} ` +
        `${campos.map(x => `${x.campo} ${x.valorAnterior}→${x.valorNuevo}`).join(', ').padEnd(46)} ` +
        `| mora ${r.moraAntes}→${r.moraDespues} | saldo ${pesos(r.balanceAntes ?? 0)}→${pesos(r.balanceDespues)}`);
    } catch (e: any) {
      if (/ning[úu]n cambio/i.test(e.message)) { sinCambio++; continue; }
      fallidos++;
      problemas.push(`${c.codigo}: ${e.message}`);
    }
  }

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`En el archivo: ${todas.length}`);
  console.log(`  ${aplicar ? 'corregidos' : 'por corregir'}: ${aplicados}`);
  console.log(`  ya estaban bien:          ${sinCambio}`);
  console.log(`  no existen en la base:    ${noExiste}`);
  console.log(`  no se pudieron:           ${fallidos}`);
  console.log(`  salto de año dudoso:      ${dudosos}`);
  console.log(`  el lote no concuerda:     ${descuadrados}`);
  console.log(`\n  contratos que SALEN de mora: ${moraBaja} | que ENTRAN en mora: ${moraSube}`);

  if (problemas.length) {
    console.log(`\nCasos que necesitan revisión a mano (${problemas.length}):`);
    problemas.slice(0, 25).forEach(p => console.log(`   ${p}`));
    if (problemas.length > 25) console.log(`   … y ${problemas.length - 25} más`);
  }
  if (!aplicar) console.log('\n(dry-run: vuelve a correr con --aplicar para escribir)');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
