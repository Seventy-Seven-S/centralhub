// Calendario para un contrato financiado que no tiene cuotas (migraciones
// incompletas). Vive AQUÍ y no dentro de payment.service para que el flujo de
// cobro y los scripts de reparación generen el MISMO calendario: si cada uno
// tuviera su copia, un contrato reparado por script podría no coincidir con lo
// que la app habría generado al cobrar.
import { PaymentPlanType } from '@prisma/client';
import { computeInstallmentSchedule } from './installmentSchedule';
import { buildCuotaRows, CuotaRow } from './cuotaSchedule';
import { aplicarPagoACuotas } from './pagoCuotas';
import { round2 } from '../../utils/money';

export interface ContratoParaCalendario {
  id: string;
  paymentPlanType: PaymentPlanType;
  financingAmount: number;
  installmentCount: number | null;
  interestRate: number | null;
  startDate: Date | null;
  balance: number | null;
}

/** Por qué un contrato NO se puede reparar solo, o null si sí se puede. */
export function motivoNoGenerable(c: ContratoParaCalendario): string | null {
  if (c.paymentPlanType !== PaymentPlanType.INSTALLMENTS) return 'no es a plazos';
  if (!(c.financingAmount > 0)) return 'sin monto financiado';
  if (!((c.installmentCount ?? 0) > 0)) return 'sin plazo';
  if (!(c.startDate instanceof Date)) return 'sin fecha de inicio';
  return null;
}

export function generarCalendarioFaltante(contract: ContratoParaCalendario): CuotaRow[] {
  const motivo = motivoNoGenerable(contract);
  if (motivo) {
    throw new Error(
      'El contrato no tiene calendario de cuotas y no se puede generar automáticamente: ' +
      `${motivo}. Corrige el contrato antes de registrar pagos.`,
    );
  }

  const schedule = computeInstallmentSchedule(
    contract.financingAmount, contract.installmentCount!, contract.interestRate ?? 0,
  );
  const rows = buildCuotaRows({
    contractId: contract.id, startDate: contract.startDate!, cuotaAmounts: schedule.cuotaAmounts,
  });

  // Lo ya abonado al financiamiento (según el balance del contrato) se
  // pre-aplica en cascada, para que el calendario nazca cuadrado con el
  // balance y el pago nuevo continúe desde la cuota que realmente sigue.
  const historico = round2(contract.financingAmount - (contract.balance ?? contract.financingAmount));
  if (historico > 0) {
    const { updates } = aplicarPagoACuotas(historico, contract.startDate!, rows);
    for (const u of updates) {
      const row = rows.find(r => r.id === u.id)!;
      row.montoPagado = round2(u.montoPagado);
      row.status = u.status;
    }
  }
  return rows;
}
