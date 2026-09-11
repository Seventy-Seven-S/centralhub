/**
 * Reglas del traspaso — lógica PURA (sin Prisma), para probarlas sin base.
 *
 * La forma del traspaso NO se le pregunta a la secretaria: se deduce del
 * destino que eligió. Ella captura a dónde va el cliente; si resulta ser el
 * mismo lote en el mismo proyecto, es un cambio de titular, y si no, hay que
 * cerrar un contrato y abrir otro. Un solo flujo en pantalla, dos
 * comportamientos por debajo.
 *
 * Los literales van en vez del enum de @prisma/client a propósito: este módulo
 * es lógica pura y no debe arrastrar el cliente generado a cada test que lo
 * toque.
 */
import { round2 } from '../../utils/money';

export type TipoTraspaso = 'CAMBIO_TITULAR' | 'REUBICACION';

export interface LoteRef {
  projectId: string;
  lotIds: string[];
}

export function deducirTipo(origen: LoteRef, destino: LoteRef): TipoTraspaso {
  if (origen.projectId !== destino.projectId) return 'REUBICACION';
  const a = [...origen.lotIds].sort().join('|');
  const b = [...destino.lotIds].sort().join('|');
  return a === b ? 'CAMBIO_TITULAR' : 'REUBICACION';
}

export interface ValidarInput {
  montoAbonado: number;
  montoRespetado: number;
  nota?: string;
  estadoOrigen: string;
  estadoLoteDestino?: string;
  mismoLote: boolean;
}

/** Mensaje de error, o null si el traspaso es válido. */
export function validarTraspaso(f: ValidarInput): string | null {
  if (f.estadoOrigen === 'TRASPASADO') return 'Este contrato ya fue traspasado';
  if (f.estadoOrigen === 'CANCELED' || f.estadoOrigen === 'RESCISSION') {
    return 'Este contrato está cancelado o rescindido: no se puede traspasar';
  }

  const respetado = round2(f.montoRespetado);
  const abonado = round2(f.montoAbonado);
  if (!Number.isFinite(respetado) || respetado < 0) {
    return 'El monto que se respeta no puede ser negativo';
  }
  // Medio peso de tolerancia: los centavos de punto flotante no son una
  // diferencia real y no deben disparar la nota obligatoria.
  if (respetado > abonado + 0.5) {
    return 'No se puede respetar más de lo abonado por el cliente';
  }
  if (abonado - respetado >= 0.5 && !f.nota?.trim()) {
    return 'No se respeta todo lo abonado: explica en la nota a qué se debe';
  }

  // En un cambio de titular el lote destino ES el de origen, y está vendido
  // justamente porque este contrato lo tiene.
  if (!f.mismoLote && f.estadoLoteDestino && f.estadoLoteDestino !== 'AVAILABLE') {
    return 'El lote destino no está disponible';
  }
  return null;
}
