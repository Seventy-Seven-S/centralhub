// Reparto del valor de un proyecto entre el dueño del terreno y la
// inmobiliaria, y qué tanto se ha cumplido.
//
// El valor base se GUARDA congelado, no se deriva del inventario de hoy. Un
// acuerdo es un hecho contractual de un momento dado: si mañana se corrige el
// precio de un lote, el trato que se firmó no cambia. Es lo contrario al valor
// total del proyecto, que sí se deriva porque describe el inventario actual.
import { round2 } from '../../utils/money';

export interface Acuerdo {
  valorBase: number;
  porcentajeDueno: number;
  porcentajeCentral: number;
}

export interface Entregado {
  /** Gastos del proyecto en la categoría "Dueño del terreno". */
  entregadoDueno: number;
  /** Gastos del proyecto en la categoría "Central". */
  tomadoCentral: number;
}

export interface ParteDelReparto {
  porcentaje: number;
  leToca: number;
  entregado: number;
  falta: number;
  /** Qué tanto de SU parte lleva recibida, en porcentaje. */
  avance: number;
}

export interface Reparto {
  valorBase: number;
  dueno: ParteDelReparto;
  central: ParteDelReparto;
  repartido: number;
  avanceTotal: number;
  /**
   * Cuánto se salió el reparto de la proporción pactada, en pesos. Cero
   * significa que a cada parte se le dio exactamente lo proporcional; un
   * número positivo es lo que se le adelantó a alguien de más.
   */
  desbalance: number;
}

export function calcularReparto(a: Acuerdo, e: Entregado): Reparto {
  const suma = a.porcentajeDueno + a.porcentajeCentral;
  if (Math.abs(suma - 100) > 0.01) {
    throw new Error(`Los porcentajes del acuerdo suman ${suma}, deben sumar 100`);
  }

  const parte = (porcentaje: number, entregado: number): ParteDelReparto => {
    const leToca = round2(a.valorBase * (porcentaje / 100));
    return {
      porcentaje,
      leToca,
      entregado: round2(entregado),
      falta: round2(leToca - entregado),
      avance: leToca > 0 ? round2((entregado / leToca) * 100) : 0,
    };
  };

  const dueno = parte(a.porcentajeDueno, e.entregadoDueno);
  const central = parte(a.porcentajeCentral, e.tomadoCentral);
  const repartido = round2(dueno.entregado + central.entregado);

  // Lo que a cada quien le tocaría de lo ya repartido, si se hubiera respetado
  // la proporción al pie de la letra.
  const proporcionalDueno = round2(repartido * (a.porcentajeDueno / 100));

  return {
    valorBase: a.valorBase,
    dueno,
    central,
    repartido,
    avanceTotal: a.valorBase > 0 ? round2((repartido / a.valorBase) * 100) : 0,
    desbalance: Math.abs(round2(dueno.entregado - proporcionalDueno)),
  };
}
