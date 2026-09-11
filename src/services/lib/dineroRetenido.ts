/**
 * Dinero retenido: lo que el cliente pagó y que ya no respalda ninguna
 * obligación, porque su contrato se canceló o se traspasó sin devolvérselo.
 *
 * Es una VISTA DERIVADA, no un saldo guardado. Un contador que se actualiza a
 * mano se desincroniza con la primera cancelación hecha por SQL o el primer
 * reembolso capturado después; calculado desde los pagos y las actas, no puede
 * mentir.
 *
 * OJO: no es dinero nuevo. Ya está contado como ingreso desde que el cliente
 * pagó. Esto solo lo etiqueta. Sumarlo aparte lo contaría dos veces.
 */
import { round2 } from '../../utils/money';

export type OrigenRetenido = 'CANCELACION' | 'TRASPASO';

export interface CasoRetenido {
  contratoId: string;
  codigo: string;
  proyecto: string;
  cliente: string;
  origen: OrigenRetenido;
  pagado: number;
  devuelto: number;
  respetadoEnTraspaso: number;
  fecha: Date | null;
}

export interface CasoConRetenido extends CasoRetenido {
  retenido: number;
}

export interface ResumenRetenido {
  total: number;
  porOrigen: Array<{ origen: OrigenRetenido; casos: number; monto: number }>;
  porProyecto: Array<{ proyecto: string; casos: number; monto: number }>;
  casos: CasoConRetenido[];
}

export function construirResumenRetenido(casos: CasoRetenido[]): ResumenRetenido {
  const conRetenido: CasoConRetenido[] = casos
    // Nunca negativo: si se devolvió de más, eso es otro problema, no una
    // retención en contra.
    .map(c => ({ ...c, retenido: Math.max(0, round2(c.pagado - c.devuelto - c.respetadoEnTraspaso)) }))
    .filter(c => c.retenido > 0)
    .sort((a, b) => b.retenido - a.retenido);

  const agrupar = <K extends string>(clave: (c: CasoConRetenido) => K) => {
    const m = new Map<K, { casos: number; monto: number }>();
    for (const c of conRetenido) {
      const k = clave(c);
      const e = m.get(k) ?? { casos: 0, monto: 0 };
      e.casos += 1;
      e.monto = round2(e.monto + c.retenido);
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => b[1].monto - a[1].monto);
  };

  return {
    total: round2(conRetenido.reduce((s, c) => s + c.retenido, 0)),
    porOrigen: agrupar(c => c.origen).map(([origen, v]) => ({ origen, ...v })),
    porProyecto: agrupar(c => c.proyecto).map(([proyecto, v]) => ({ proyecto, ...v })),
    casos: conRetenido,
  };
}
