/**
 * cortes-historicos-sistema-viejo.ts
 *
 * Registra TODAS las liquidaciones que un proyecto hizo en el sistema viejo
 * (SISTEMA MONARCA, SISTEMA Valle de Bugambilias…), una por hoja, ligando los
 * pagos exactos de cada hoja. Sin esto, el "pendiente por entregar" del
 * proyecto suma todo lo cobrado desde el primer día.
 *
 * Las hojas de corte se reconocen por su nombre ("17 Mayo 2025"). En algunas
 * (8 Agosto 2026) el renglón trae DOS bloques lado a lado, y el de la derecha
 * es una copia desfasada de la hoja Ingresos: solo se lee el bloque izquierdo.
 *
 * Emparejamiento: código + monto, el pago de la app más cercano en fecha que
 * no sea posterior al corte (con 2 días de holgura por captura tardía). Los pagos de la app anteriores al último
 * corte que no encuentran renglón (enganches partidos por una división de
 * cuentas, p. ej. F070/F141) van al primer corte que cerró después de su
 * fecha. Las devoluciones no entran (regla de cortePendiente).
 *
 * Los cortes no mueven dinero (egresos y entrega en 0): lo que se le dio al
 * dueño ya está en Gastos. También deja registrado el dueño del proyecto.
 *
 *   npx tsx src/scripts/cortes-historicos-sistema-viejo.ts "<archivo.xlsx>" <PROYECTO> "<Dueño>"
 *   ... --confirm
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { wherePendienteDeCorte } from '../services/lib/cortePendiente';

const prisma = new PrismaClient();
const [ARCHIVO, PROYECTO, DUENO] = process.argv.slice(2);
const CONFIRM = process.argv.includes('--confirm');
const $ = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const DIA = 86_400_000;

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function fechaDeHoja(nombre: string): Date | null {
  const m = nombre.trim().toLowerCase().match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  return m && MESES[m[2]] ? new Date(Date.UTC(+m[3], MESES[m[2]] - 1, +m[1])) : null;
}

interface Renglon { fecha: Date; cod: string; monto: number }

/** Bloque izquierdo: fecha, código y el primer monto después del código. */
function renglonIzquierdo(r: unknown[]): Renglon | null {
  if (!(r[0] instanceof Date)) return null;
  const cod = typeof r[1] === 'string' ? r[1].trim().toUpperCase() : '';
  if (!/^[A-Z]\d{3}$/.test(cod)) return null;
  for (let i = 2; i < Math.min(r.length, 7); i++) {
    const v = r[i];
    const n = typeof v === 'number' ? v
      : typeof v === 'string' && /^\$?-?[\d,]+(\.\d+)?$/.test(v.trim()) ? Number(v.replace(/[$,]/g, '')) : NaN;
    if (Number.isFinite(n) && n !== 0) return { fecha: r[0], cod, monto: n };
  }
  return null;
}

async function main() {
  if (!ARCHIVO || !PROYECTO || !DUENO) throw new Error('Uso: cortes-historicos-sistema-viejo.ts "<archivo.xlsx>" <PROYECTO> "<Dueño>" [--confirm]');

  const proyecto = await prisma.project.findFirst({ where: { code: PROYECTO }, select: { id: true, name: true, duenoTerreno: true, sinCortes: true } });
  if (!proyecto) throw new Error(`No existe el proyecto ${PROYECTO}`);
  if (proyecto.sinCortes) throw new Error(`${PROYECTO} está marcado sin cortes`);
  const yaHay = await prisma.corte.count({ where: { projectId: proyecto.id } });
  if (yaHay) throw new Error(`${PROYECTO} ya tiene ${yaHay} corte(s); esto solo se corre sobre un proyecto sin cortes`);

  const wb = XLSX.readFile(ARCHIVO, { cellDates: true });
  const hojas = wb.SheetNames
    .map(nombre => ({ nombre, fecha: fechaDeHoja(nombre)! }))
    .filter(h => h.fecha)
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    .map(h => ({
      ...h,
      renglones: (XLSX.utils.sheet_to_json(wb.Sheets[h.nombre], { header: 1, raw: true, defval: null }) as unknown[][])
        .map(renglonIzquierdo).filter((x): x is Renglon => !!x),
    }));
  if (!hojas.length) throw new Error('El archivo no trae hojas de corte');

  const libres = await prisma.payment.findMany({
    where: wherePendienteDeCorte(proyecto.id),
    select: { id: true, amount: true, paymentDate: true, contract: { select: { codigoLegado: true } } },
    orderBy: { paymentDate: 'asc' },
  });

  const cortes = hojas.map(h => ({ ...h, ligar: [] as typeof libres, sinPar: [] as Renglon[] }));
  for (const c of cortes) {
    // Todo el día del corte y un par de días de holgura: hay pagos que la hoja
    // liquidó pero en la app quedaron con la fecha en que se capturaron
    // (E019 de VDB: en el corte del 18-jun, capturado el 19).
    const cierre = c.fecha.getTime() + 3 * DIA;
    for (const r of c.renglones) {
      let mejor = -1;
      for (let i = 0; i < libres.length; i++) {
        const p = libres[i];
        if ((p.contract.codigoLegado ?? '').toUpperCase() !== r.cod || Math.abs(p.amount - r.monto) >= 0.5) continue;
        if (p.paymentDate.getTime() > cierre) continue;
        if (mejor < 0 || Math.abs(p.paymentDate.getTime() - r.fecha.getTime()) < Math.abs(libres[mejor].paymentDate.getTime() - r.fecha.getTime())) mejor = i;
      }
      if (mejor >= 0) c.ligar.push(libres.splice(mejor, 1)[0]); else c.sinPar.push(r);
    }
  }

  // Pagos de la app anteriores al último pago liquidado que no tuvieron renglón.
  const ultimoLiquidado = Math.max(...cortes.flatMap(c => c.renglones.map(r => r.fecha.getTime())));
  const huerfanos = libres.filter(p => p.paymentDate.getTime() <= ultimoLiquidado);
  for (const p of huerfanos) {
    const c = cortes.find(c => c.fecha.getTime() + DIA >= p.paymentDate.getTime()) ?? cortes.at(-1)!;
    c.ligar.push(p);
    libres.splice(libres.indexOf(p), 1);
  }

  console.log(`\n${CONFIRM ? '🔴 MODO ESCRITURA' : '🔍 DRY-RUN'} · cortes históricos de ${PROYECTO} (${proyecto.name}) · dueño ${DUENO}\n`);
  cortes.forEach((c, i) => {
    const hoja = c.renglones.reduce((s, r) => s + r.monto, 0);
    const lig = c.ligar.reduce((s, p) => s + p.amount, 0);
    console.log(`  #${String(i + 1).padStart(2)} ${iso(c.fecha)}  hoja ${$(hoja).padStart(16)}  liga ${String(c.ligar.length).padStart(3)} pagos ${$(lig).padStart(16)}` +
      (c.sinPar.length ? `  · sin pago en la app: ${c.sinPar.map(r => `${r.cod} ${$(r.monto)}`).join(', ')}` : ''));
  });
  if (huerfanos.length) console.log(`\n  Pagos de la app sin renglón, asignados por fecha: ${huerfanos.map(p => `${p.contract.codigoLegado} ${$(p.amount)} ${iso(p.paymentDate)}`).join(', ')}`);
  const total = cortes.reduce((s, c) => s + c.ligar.reduce((t, p) => t + p.amount, 0), 0);
  console.log(`\n  Total liquidado: ${$(total)}`);
  console.log(`  Queda pendiente para el primer corte en la app: ${libres.length} pagos · ${$(libres.reduce((s, p) => s + p.amount, 0))}`);
  if (libres.length) console.log(`     desde ${iso(libres[0].paymentDate)}`);
  if (proyecto.duenoTerreno !== DUENO) console.log(`  Dueño del proyecto: ${proyecto.duenoTerreno ?? '(vacío)'} → ${DUENO}`);

  if (!CONFIRM) { console.log('\nNada escrito. Repite con --confirm.\n'); return; }

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!admin) throw new Error('No hay usuario ADMIN');

  await prisma.$transaction(async tx => {
    let numero = 0;
    for (const c of cortes) {
      if (!c.ligar.length) continue;
      const totalIngresos = Math.round(c.ligar.reduce((s, p) => s + p.amount, 0) * 100) / 100;
      const corte = await tx.corte.create({
        data: {
          projectId: proyecto.id, numero: ++numero, fecha: c.fecha,
          periodoInicio: new Date(Math.min(...c.ligar.map(p => p.paymentDate.getTime()))), periodoFin: c.fecha,
          totalIngresos, totalEgresos: 0, entregadoDueno: 0, dueno: DUENO, createdById: admin.id,
          notas: `Liquidación hecha en el sistema anterior (hoja "${c.nombre.trim()}"). Liga los ${c.ligar.length} pagos ` +
                 `que ese corte incluyó. Lo entregado al dueño está registrado en Gastos.`,
        },
      });
      await tx.payment.updateMany({ where: { id: { in: c.ligar.map(p => p.id) }, corteId: null }, data: { corteId: corte.id } });
    }
    await tx.project.update({ where: { id: proyecto.id }, data: { duenoTerreno: DUENO } });
    console.log(`\n✅ ${numero} cortes de ${PROYECTO} registrados · ${$(total)}\n`);
  }, { timeout: 120000 });
}

main().catch(e => { console.error('❌', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
