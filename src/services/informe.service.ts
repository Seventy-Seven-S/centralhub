// Informe por proyecto: ingresos y egresos por mes, en pantalla y en Excel.
// Los ingresos se definen igual que en la tarjeta del proyecto y el tablero
// (pagos de ingreso real + otros ingresos); los egresos son todos los gastos.
import * as XLSX from 'xlsx';
import { prisma } from '../config/database';
import { ApiError } from '../middlewares/errorHandler';
import { whereIngresoReal } from './lib/ingresoReal';
import { construirInformeMensual, InformeMensual } from './lib/informeMensual';

export interface InformeProyecto extends InformeMensual {
  proyecto: { id: string; code: string; name: string };
}

export async function informeDelProyecto(projectId: string, hasta = new Date()): Promise<InformeProyecto> {
  const proyecto = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true } });
  if (!proyecto) throw new ApiError(404, 'Proyecto no encontrado');

  const [pagos, otros, gastos] = await Promise.all([
    prisma.payment.findMany({
      where: { status: 'CONFIRMED', contract: { projectId }, ...whereIngresoReal() },
      select: { paymentDate: true, amount: true },
    }),
    prisma.otroIngreso.findMany({ where: { projectId }, select: { fecha: true, monto: true } }),
    prisma.expense.findMany({ where: { projectId }, select: { date: true, amount: true } }),
  ]);

  const informe = construirInformeMensual(
    [
      ...pagos.map(p => ({ fecha: p.paymentDate, monto: p.amount })),
      ...otros.map(o => ({ fecha: o.fecha, monto: o.monto })),
    ],
    gastos.map(g => ({ fecha: g.date, monto: g.amount.toString() })),
    hasta,
  );
  return { proyecto, ...informe };
}

/** El mismo informe como hoja de Excel (.xlsx), con montos numéricos para que se puedan sumar. */
export function excelDelInforme(informe: InformeProyecto): Buffer {
  const encabezado = [
    [`Informe de ${informe.proyecto.name} (${informe.proyecto.code})`],
    [],
    ['Mes', 'Ingresos', 'Egresos'],
  ];
  const filas = informe.filas.map(f => [f.mes, f.ingresos, f.egresos]);
  const total = [['Total', informe.totales.ingresos, informe.totales.egresos]];

  const hoja = XLSX.utils.aoa_to_sheet([...encabezado, ...filas, ...total]);
  hoja['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 16 }];
  // Formato de moneda en las dos columnas de montos (filas de datos y total).
  for (let r = encabezado.length; r < encabezado.length + filas.length + 1; r++) {
    for (const c of [1, 2]) {
      const celda = hoja[XLSX.utils.encode_cell({ r, c })];
      if (celda) celda.z = '$#,##0.00';
    }
  }

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, informe.proyecto.code.slice(0, 31));
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
