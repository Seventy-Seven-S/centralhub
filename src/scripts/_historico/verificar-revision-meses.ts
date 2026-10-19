// Verifica, contrato por contrato, que el sistema ya diga lo que el equipo
// anotó en "REVISION DE MESES". Es una comprobación INDEPENDIENTE del
// corrector: no pregunta qué hizo el script, compara contra la base.
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { mesDesdeNombre } from '../../services/lib/mesDesdeNombre';

const prisma = new PrismaClient();

const plazoDe = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 ? v : null;
  const m = String(v ?? '').match(/\d+/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};

const comoMes = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

async function main() {
  const wb = XLSX.readFile('backups/REVISION DE MESES .xlsx');

  interface Pide { codigo: string; hoja: string; mes: string | null; mensualidad: number | null; plazo: number | null }
  const pide: Pide[] = [];
  for (const hoja of wb.SheetNames) {
    const f = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true }) as unknown[][];
    const iH = f.findIndex(r => String(r?.[0] ?? '').trim().toUpperCase() === 'CODIGO');
    if (iH < 0) continue;
    for (const r of f.slice(iH + 1)) {
      const codigo = String(r?.[0] ?? '').trim().toUpperCase();
      if (!codigo) continue;
      const mes = r[4] ? String(r[4]).trim() : null;
      const mensualidad = typeof r[5] === 'number' && r[5] > 0 ? r[5] : null;
      const plazo = plazoDe(r[6]);
      if (!mes && !mensualidad && !plazo) continue;
      pide.push({ codigo, hoja: hoja.trim(), mes, mensualidad, plazo });
    }
  }

  // Todo de una vez y en memoria: una consulta por contrato tumbaba el proceso.
  const codigos = pide.map(p => p.codigo);
  const contratos = await prisma.contract.findMany({
    where: { codigoLegado: { in: codigos } },
    select: {
      id: true, codigoLegado: true, contractDate: true,
      installmentAmount: true, installmentCount: true, status: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });
  const porCodigo = new Map(contratos.map(c => [c.codigoLegado!, c]));
  const ids = contratos.map(c => c.id);

  const cuotas1 = await prisma.cuota.findMany({
    where: { contractId: { in: ids }, numeroCuota: 1 },
    select: { contractId: true, fechaVencimiento: true, mes: true },
  });
  const primeraCuota = new Map(cuotas1.map(c => [c.contractId, c]));

  const pagos = await prisma.payment.findMany({
    where: { contractId: { in: ids }, status: 'CONFIRMED', paymentType: { in: ['INSTALLMENT', 'EXTRA_PAYMENT'] } },
    orderBy: { paymentDate: 'asc' },
    select: { contractId: true, paymentDate: true },
  });
  const primerPago = new Map<string, Date>();
  for (const p of pagos) if (!primerPago.has(p.contractId)) primerPago.set(p.contractId, p.paymentDate);

  let coinciden = 0;
  const malos: Array<{ codigo: string; hoja: string; cliente: string; status: string; difs: string[] }> = [];
  const noExisten: string[] = [];

  for (const p of pide) {
    const c = porCodigo.get(p.codigo);
    if (!c) { noExisten.push(p.codigo); continue; }

    const difs: string[] = [];
    if (p.mes) {
      const quiere = mesDesdeNombre(p.mes, primerPago.get(c.id) ?? c.contractDate);
      const cu = primeraCuota.get(c.id);
      if (quiere && cu && comoMes(cu.fechaVencimiento) !== quiere) {
        difs.push(`1er mes: pide ${p.mes} (${quiere}), tiene ${cu.mes}`);
      }
    }
    if (p.mensualidad && Math.round(Number(c.installmentAmount ?? 0)) !== Math.round(p.mensualidad)) {
      difs.push(`mensualidad: pide ${p.mensualidad}, tiene ${c.installmentAmount}`);
    }
    if (p.plazo && c.installmentCount !== p.plazo) {
      difs.push(`plazo: pide ${p.plazo}, tiene ${c.installmentCount}`);
    }

    if (difs.length) {
      malos.push({ codigo: p.codigo, hoja: p.hoja, cliente: `${c.client.firstName} ${c.client.lastName}`, status: c.status, difs });
    } else coinciden++;
  }

  console.log('VERIFICACIÓN contra el archivo del equipo\n');
  console.log(`  contratos en el archivo:  ${pide.length}`);
  console.log(`  YA COINCIDEN:             ${coinciden}`);
  console.log(`  siguen sin coincidir:     ${malos.length}`);
  console.log(`  no existen en la base:    ${noExisten.length}${noExisten.length ? ` (${noExisten.join(', ')})` : ''}`);

  if (malos.length) {
    console.log('\nLos que faltan:');
    for (const m of malos) {
      console.log(`   ${m.codigo.padEnd(6)} ${m.hoja.padEnd(16)} ${m.cliente.slice(0, 28).padEnd(30)} ${m.status}`);
      m.difs.forEach(d => console.log(`          ${d}`));
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
