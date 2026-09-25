// Plazo del contrato, en meses.
//
// Era un menú cerrado con 60, 72 y 84. La realidad del negocio no cabe ahí:
// JSA 1 tiene 62 contratos a 48 meses, uno a 47, y ventas nuevas a 2 años. El
// menú venía forzando capturas equivocadas, así que ahora se escribe el plazo
// y los valores comunes quedan a un clic.

export const PLAZOS_COMUNES = [24, 36, 48, 60, 72, 84];

/** Más de 20 años no es un plazo, es un dedazo. */
const MAXIMO_MESES = 240;

export function validarPlazo(valor: string): string | null {
  const limpio = (valor ?? '').trim();
  if (!limpio) return 'Captura el plazo en meses';

  const n = Number(limpio);
  if (!Number.isFinite(n)) return 'El plazo debe ser un número de meses';
  if (!Number.isInteger(n)) return 'El plazo debe ser un número entero de meses';
  if (n <= 0) return 'El plazo debe ser mayor a cero';
  if (n > MAXIMO_MESES) return `El plazo es demasiado largo (máximo ${MAXIMO_MESES} meses)`;
  return null;
}

export function etiquetaPlazo(meses: number): string {
  if (meses > 0 && meses % 12 === 0) {
    const años = meses / 12;
    return `${meses} meses (${años} ${años === 1 ? 'año' : 'años'})`;
  }
  return `${meses} meses`;
}
