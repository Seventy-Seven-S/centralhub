/**
 * censo-traspasos.ts — SOLO LECTURA
 *
 * Barre el consolidado buscando toda evidencia de que un lote cambió de manos:
 * la columna de cliente anterior, las anotaciones de TRASPASO / RESCISION /
 * CANCELACION, y los cambios de proyecto.
 *
 * Sirve para dimensionar el módulo de traspasos antes de diseñarlo: cuántos
 * son, de qué formas, y cuáles ya están reflejados en la app.
 */
import { PrismaClient } from '@prisma/client';
import { leerArchivoMaestro, FilaLote } from './lib/archivoMaestro';

const prisma = new PrismaClient();
const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

type Tipo = 'TRASPASO' | 'RESCISION' | 'CAMBIO_PROYECTO' | 'CLIENTE_ANTERIOR' | 'OTRO';

function clasificar(f: FilaLote & { codigoAnterior?: string | null; clienteAnterior?: string | null }): Tipo | null {
  const obs = norm(f.observaciones);
  const tieneAnterior = !!(f.clienteAnterior?.trim() || f.codigoAnterior?.trim());
  if (/CAMBIO DE|SE CAMBIO/.test(obs)) return 'CAMBIO_PROYECTO';
  if (/TRASPAS/.test(obs)) return 'TRASPASO';
  if (/RESCISION|RESCINDID|CANCELA/.test(obs)) return 'RESCISION';
  if (tieneAnterior) return 'CLIENTE_ANTERIOR';
  if (obs) return 'OTRO';
  return null;
}

async function main() {
  const filas = leerArchivoMaestro() as Array<FilaLote & { codigoAnterior?: string | null; clienteAnterior?: string | null }>;

  const porTipo = new Map<Tipo, typeof filas>();
  for (const f of filas) {
    const t = clasificar(f);
    if (!t) continue;
    (porTipo.get(t) ?? porTipo.set(t, []).get(t)!).push(f);
  }

  console.log(`\nFilas del archivo con señal de cambio de manos:\n`);
  for (const [t, fs] of [...porTipo].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${t.padEnd(18)} ${String(fs.length).padStart(4)}`);
  }

  // ¿Cuáles de esos contratos siguen ACTIVOS en la app? Un traspaso o una
  // rescisión que la app no refleja es un cobro que se le está haciendo a
  // quien ya no es dueño.
  const codigos = [...new Set(filas.filter(f => clasificar(f)).map(f => f.codigo))];
  const ctrs = await prisma.contract.findMany({
    where: { codigoLegado: { in: codigos } },
    select: {
      codigoLegado: true, status: true, balance: true,
      project: { select: { code: true } },
      client: { select: { firstName: true, lastName: true } },
    },
  });
  const porCodigo = new Map(ctrs.map(c => [c.codigoLegado ?? '', c]));

  for (const [t, fs] of [...porTipo].sort((a, b) => b[1].length - a[1].length)) {
    if (t === 'OTRO') continue;
    const unicos = [...new Map(fs.map(f => [f.codigo, f])).values()];
    console.log(`\n${'═'.repeat(88)}\n${t}  (${unicos.length} contratos)\n${'═'.repeat(88)}`);
    for (const f of unicos.slice(0, 30)) {
      const c = porCodigo.get(f.codigo);
      const estado = c ? `${c.status.padEnd(9)} saldo ${String(c.balance ?? 0).padStart(10)}` : 'NO EXISTE EN LA APP';
      const cliApp = c ? `${c.client.firstName} ${c.client.lastName}`.slice(0, 22) : '—';
      console.log(
        `  ${f.proyecto.padEnd(5)} ${f.codigo.padEnd(6)} M${String(f.manzana ?? '?').padStart(2)}-L${(f.lote ?? '?').padEnd(6)} ` +
        `${estado.padEnd(28)} app: ${cliApp.padEnd(24)} archivo: ${(f.cliente ?? '').slice(0, 26)}`,
      );
      if (f.observaciones) console.log(`         ⚑ ${f.observaciones.slice(0, 80)}`);
    }
    if (unicos.length > 30) console.log(`  … y ${unicos.length - 30} más`);
  }
  console.log();
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
