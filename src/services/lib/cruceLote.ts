// ¿La fila del archivo habla de este contrato?
//
// Los archivos del equipo traen el código del cliente, pero ese código a veces
// está mal tecleado o repetido: en "REVISION DE MESES" el código V292 aparecía
// en tres filas de tres clientes distintos, y al corregir por código se le
// escribió a uno el dato de otro.
//
// La manzana y el lote son el dato duro: identifican el contrato aunque el
// código esté mal. Se usa como verificación, no como búsqueda — si el archivo
// no trae lote, no hay con qué cruzar y se deja pasar.

export interface LoteDeContrato { manzana: number; lotNumber: string }

const mismoLote = (a: string | number | null, b: string | number | null) => {
  if (a === null || b === null) return false;
  const na = Number(a), nb = Number(b);
  // "05" y "5" son el mismo lote; si alguno no es numérico se comparan como texto.
  return Number.isFinite(na) && Number.isFinite(nb)
    ? na === nb
    : String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
};

export function elLoteConcuerda(
  lotesDelContrato: LoteDeContrato[],
  manzana: number | null,
  lote: string | null,
): boolean {
  if (manzana === null || lote === null || lote === '') return true;  // nada que cruzar
  if (lotesDelContrato.length === 0) return true;                      // nada con qué cruzar
  return lotesDelContrato.some(l => l.manzana === Number(manzana) && mismoLote(l.lotNumber, lote));
}
