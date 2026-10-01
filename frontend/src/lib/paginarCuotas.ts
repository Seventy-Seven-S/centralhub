// Reparto de las cuotas en hojas del estado de cuenta.
//
// El PDF se imprime en TAMAÑO CARTA, que es más corto que A4. Antes todas las
// hojas llevaban el mismo número de renglones, incluida la primera — que
// además carga el encabezado y el resumen del contrato. Por eso salía cortado
// al imprimir: el equipo lo reportó como "sale medio mocho".

/** La primera hoja comparte espacio con el encabezado y el resumen. */
export const FILAS_PRIMERA_PAGINA = 24;

/** Las hojas siguientes solo llevan la tabla. */
export const FILAS_POR_PAGINA = 34;

export function paginarCuotas<T>(cuotas: T[]): T[][] {
  if (cuotas.length === 0) return [[]];

  const paginas: T[][] = [cuotas.slice(0, FILAS_PRIMERA_PAGINA)];
  for (let i = FILAS_PRIMERA_PAGINA; i < cuotas.length; i += FILAS_POR_PAGINA) {
    paginas.push(cuotas.slice(i, i + FILAS_POR_PAGINA));
  }
  return paginas;
}
