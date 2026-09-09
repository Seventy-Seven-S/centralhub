/**
 * diagnostico-42.ts — SOLO LECTURA
 *
 * Clasifica los contratos cuya mensualidad difiere del archivo por más de $1.
 * La hipótesis a descartar es que el archivo traiga MENOS filas de lote que
 * lotes tiene el contrato en la app: como la mensualidad del archivo es por
 * lote y se suma, una fila faltante deja la suma corta y hace parecer que la
 * base está mal cuando en realidad falta un renglón en el Excel.
 */
import { PrismaClient } from '@prisma/client';
import { leerArchivoMaestro, agruparPorCodigo, alPesoMayor } from './lib/archivoMaestro';

const prisma = new PrismaClient();
const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

async function main() {
  const archivo = agruparPorCodigo(leerArchivoMaestro());

  const contratos = await prisma.contract.findMany({
    where: { status: { in: ['ACTIVE', 'IN_MORA'] } },
    select: {
      codigoLegado: true, installmentAmount: true, financingAmount: true, balance: true,
      project: { select: { code: true } },
      client: { select: { firstName: true, lastName: true } },
      _count: { select: { lots: true } },
    },
  });

  type Fila = {
    code: string; codigo: string; cliente: string;
    bd: number; archivoSuma: number; lotesBd: number; lotesArchivo: number;
    porLote: number; diag: string;
  };
  const filas: Fila[] = [];

  for (const c of contratos) {
    const a = archivo.get(`${c.project.code}|${(c.codigoLegado ?? '').toUpperCase()}`);
    if (!a || a.mensualidad === null) continue;
    const bd = c.installmentAmount ?? 0;
    if (Math.abs(bd - a.mensualidad) < 1) continue;

    const porLote = a.lotes > 0 ? a.mensualidad / a.lotes : 0;
    let diag: string;

    // ¿Cuadra si el archivo tuviera tantas filas como lotes tiene el contrato?
    if (a.lotes < c._count.lots && Math.abs(porLote * c._count.lots - bd) < 1.5) {
      diag = `FALTAN ${c._count.lots - a.lotes} FILAS EN EL ARCHIVO (la BD tiene razón)`;
    } else if (a.lotes > c._count.lots && Math.abs(porLote * c._count.lots - bd) < 1.5) {
      diag = `FALTAN ${a.lotes - c._count.lots} LOTES EN LA APP (el archivo tiene razón)`;
    } else if (a.lotesSinMensualidad > 0) {
      diag = `${a.lotesSinMensualidad} fila(s) del archivo sin mensualidad`;
    } else if (bd > a.mensualidad) {
      diag = 'BD cobra MÁS que el archivo';
    } else {
      diag = 'BD cobra MENOS que el archivo';
    }

    filas.push({
      code: c.project.code, codigo: c.codigoLegado ?? '',
      cliente: `${c.client.firstName} ${c.client.lastName}`,
      bd, archivoSuma: a.mensualidad, lotesBd: c._count.lots, lotesArchivo: a.lotes,
      porLote, diag,
    });
  }

  const porDiag = new Map<string, Fila[]>();
  for (const f of filas) {
    const clave = f.diag.replace(/\d+/g, 'N');
    (porDiag.get(clave) ?? porDiag.set(clave, []).get(clave)!).push(f);
  }

  console.log(`\nContratos que difieren más de $1: ${filas.length}\n`);
  for (const [clave, fs] of [...porDiag].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n━━━ ${clave}  (${fs.length}) ━━━`);
    for (const f of fs.sort((a, b) => Math.abs(b.bd - b.archivoSuma) - Math.abs(a.bd - a.archivoSuma))) {
      console.log(
        `  ${f.code.padEnd(5)} ${f.codigo.padEnd(6)} ${f.cliente.slice(0, 24).padEnd(26)} ` +
        `BD ${money(f.bd).padStart(12)}  archivo ${money(f.archivoSuma).padStart(12)}  ` +
        `lotes BD/arch ${f.lotesBd}/${f.lotesArchivo}  por lote ${money(f.porLote).padStart(11)}`,
      );
    }
  }
  console.log();
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
