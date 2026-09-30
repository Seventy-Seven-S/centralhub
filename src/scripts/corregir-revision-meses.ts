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

const prisma = new PrismaClient();
const ARCHIVO = 'backups/REVISION DE MESES .xlsx';

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const pesos = (n: number) => `$${n.toLocaleString('es-MX')}`;

interface Correccion {
  hoja: string; codigo: string; cliente: string;
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
      out.push({ hoja: hoja.trim(), codigo, cliente: String(f[3] ?? '').trim(), mes, mensualidad, plazo });
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

  let aplicados = 0, sinCambio = 0, noExiste = 0, fallidos = 0;
  const problemas: string[] = [];
  let moraBaja = 0, moraSube = 0;

  for (const c of todas) {
    const contrato = await prisma.contract.findFirst({
      where: { codigoLegado: c.codigo },
      select: { id: true, contractDate: true, status: true },
    });
    if (!contrato) { noExiste++; problemas.push(`${c.codigo}: no existe en la base`); continue; }

    const mesInicio = c.mes ? mesDesdeNombre(c.mes, contrato.contractDate) : undefined;
    if (c.mes && !mesInicio) { fallidos++; problemas.push(`${c.codigo}: no se entiende el mes "${c.mes}"`); continue; }

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
