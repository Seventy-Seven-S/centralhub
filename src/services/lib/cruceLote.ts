// ¿La fila del archivo habla de este contrato?
//
// Los archivos del equipo traen el código del cliente, pero ese código se
// teclea a mano y a veces se repite: en "REVISION DE MESES" el código V292
// aparecía en tres filas de tres clientes distintos, y corregir por código le
// escribió a uno el dato de otro.
//
// La manzana y el lote son el dato duro. Se usan como VERIFICACIÓN, no como
// búsqueda: si el archivo no trae lote, no hay con qué cruzar y se deja pasar.

export interface LoteDeContrato { manzana: number; lotNumber: string }

/**
 * Los lotes que menciona una celda. El equipo escribe varios en una sola:
 * "1 Y 2", "18,19", "1,2,3,8,9,10,11,12". Se toman todos los números.
 */
export function lotesDeLaCelda(celda: string | number | null | undefined): string[] {
  if (celda === null || celda === undefined) return [];
  return String(celda).match(/\d+/g) ?? [];
}

export function elLoteConcuerda(
  lotesDelContrato: LoteDeContrato[],
  manzana: number | null,
  celdaLote: string | number | null,
): boolean {
  const pedidos = lotesDeLaCelda(celdaLote);
  if (manzana === null || pedidos.length === 0) return true;   // nada que cruzar
  if (lotesDelContrato.length === 0) return true;              // nada con qué cruzar

  const delContrato = new Set(
    lotesDelContrato
      .filter(l => l.manzana === Number(manzana))
      .map(l => String(Number(l.lotNumber))),   // "05" y "5" son el mismo lote
  );

  // Basta que UNO coincida: la celda puede mencionar lotes que ya se separaron
  // a otro contrato, y aun así la fila habla de este cliente.
  return pedidos.some(n => delContrato.has(String(Number(n))));
}
