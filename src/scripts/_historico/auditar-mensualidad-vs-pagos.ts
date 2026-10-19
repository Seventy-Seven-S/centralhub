/**
 * auditar-mensualidad-vs-pagos.ts
 *
 * Busca contratos donde el cliente paga consistentemente una cantidad distinta
 * a la mensualidad que tiene registrada.
 *
 * Doce pagos idénticos seguidos son mejor evidencia del trato real que una
 * columna de un archivo: el caso H038 llegó porque el recibo cobraba $4,167 a
 * alguien que llevaba un año pagando $3,473.
 *
 * Uso: npx tsx src/scripts/_historico/auditar-mensualidad-vs-pagos.ts [PROYECTO] [--min 3]
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PROYECTO = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const MIN = process.argv.includes('--min') ? Number(process.argv[process.argv.indexOf('--min') + 1]) : 3;
const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

async function main() {
  const contratos = await prisma.contract.findMany({
    where: {
      status: { in: ['ACTIVE', 'IN_MORA'] },
      ...(PROYECTO ? { project: { code: PROYECTO } } : {}),
      installmentAmount: { gt: 0 },
    },
    select: {
      codigoLegado: true, installmentAmount: true, installmentCount: true,
      financingAmount: true, totalPrice: true,
      project: { select: { code: true } },
      client: { select: { firstName: true, lastName: true } },
      payments: { where: { status: 'CONFIRMED', paymentType: 'INSTALLMENT' }, select: { amount: true } },
    },
  });

  const casos: Array<{ code: string; cod: string; cliente: string; registrada: number; real: number; veces: number; plazoReal: number | null }> = [];
  for (const c of contratos) {
    if (c.payments.length < MIN) continue;
    // Monto que más se repite: si el cliente paga siempre lo mismo, ese es el
    // trato real, aunque el contrato diga otra cosa.
    const conteo = new Map<number, number>();
    for (const p of c.payments) {
      const k = Math.round(p.amount);
      conteo.set(k, (conteo.get(k) ?? 0) + 1);
    }
    const [monto, veces] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0];
    if (veces < MIN) continue;
    const registrada = c.installmentAmount ?? 0;
    // Un peso de diferencia es redondeo, no un trato distinto.
    if (Math.abs(monto - registrada) <= 1) continue;
    casos.push({
      code: c.project.code, cod: c.codigoLegado ?? '?',
      cliente: `${c.client.firstName} ${c.client.lastName}`,
      registrada, real: monto, veces,
      plazoReal: c.financingAmount ? Math.round(c.financingAmount / monto) : null,
    });
  }

  casos.sort((a, b) => b.veces - a.veces);
  console.log(`\n🔍 Contratos donde el cliente paga distinto a su mensualidad registrada`);
  console.log(`   (al menos ${MIN} pagos iguales${PROYECTO ? ` · solo ${PROYECTO}` : ' · todos los proyectos'})\n`);
  console.log(`   ${casos.length} de ${contratos.length} contratos vivos revisados\n`);
  console.log(`   PROY  CÓDIGO  CLIENTE                       REGISTRADA        PAGA REAL   VECES  PLAZO REAL`);
  for (const c of casos.slice(0, 40))
    console.log(`   ${c.code.padEnd(5)} ${c.cod.padEnd(7)} ${c.cliente.slice(0, 28).padEnd(29)} ${money(c.registrada).padStart(13)} ${money(c.real).padStart(16)} ${String(c.veces).padStart(6)}  ${c.plazoReal ?? '—'} meses`);
  if (casos.length > 40) console.log(`   … y ${casos.length - 40} más`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
