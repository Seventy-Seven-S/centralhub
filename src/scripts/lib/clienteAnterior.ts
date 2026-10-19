// Columnas "CODIGO" + "CLIENTE ANTERIOR" de "LOTES TOTALES .xlsx": quién tuvo
// el lote antes de una rescisión o traspaso.
//
// Sirven para recuperar el lote de los contratos rescindidos que lo perdieron:
// hasta el 2026-09-25 la rescisión borraba la fila contract_lots, y con ella el
// único dato de qué lote había comprado el cliente.
//
// Las hojas traen DOS columnas "CODIGO" en Valle del Roble (la del cliente
// actual y la del anterior). La del anterior es siempre la que va después de
// ESTATUS, así que se busca a partir de ahí.
import * as XLSX from 'xlsx';
import { norm, aNumero } from './lotesTotales';

export interface LoteDeClienteAnterior {
  hoja: string;
  manzana: number;
  lote: string;
  codigo: string;
  clienteAnterior: string;
  precio: number | null;
  nota: string | null;
}

/** Índice de la primera columna llamada `nombre` a partir de `desde`. */
function columnaDesde(head: string[], nombre: string, desde: number): number {
  for (let i = Math.max(0, desde); i < head.length; i++) if (head[i] === nombre) return i;
  return -1;
}

/**
 * Las filas con código de cliente anterior. Un "-" o vacío en el código (pasa
 * en los traspasos) no sirve para ligar nada y se descarta.
 */
export function filasConClienteAnterior(hoja: string, filas: unknown[][]): LoteDeClienteAnterior[] {
  const iHead = filas.findIndex(f => Array.from(f ?? []).some(c => norm(c) === 'ESTATUS'));
  if (iHead === -1) return [];
  const head = Array.from(filas[iHead] ?? []).map(norm);

  const iE = head.indexOf('ESTATUS');
  const iAnt = head.indexOf('CLIENTE ANTERIOR');
  const iCod = columnaDesde(head, 'CODIGO', iE + 1);
  if (iAnt === -1 || iCod === -1) return [];

  const iM = head.indexOf('MZA') >= 0 ? head.indexOf('MZA') : head.indexOf('MANZANA');
  const iL = head.indexOf('LOTE');
  const iP = head.indexOf('PRECIO INICIAL') >= 0 ? head.indexOf('PRECIO INICIAL')
    : head.indexOf('PRECIO') >= 0 ? head.indexOf('PRECIO') : head.indexOf('PRECIO/VENTA');
  const iObs = head.indexOf('OBSERVACIONES') >= 0 ? head.indexOf('OBSERVACIONES') : head.indexOf('COMENTARIOS');

  const out: LoteDeClienteAnterior[] = [];
  for (const fila of filas.slice(iHead + 1)) {
    const codigo = norm(fila?.[iCod]);
    const nombre = String(fila?.[iAnt] ?? '').trim();
    const manzana = aNumero(fila?.[iM]);
    const lote = aNumero(fila?.[iL]);
    if (!/^[A-Z]\d+$/.test(codigo) || !nombre || manzana === null || lote === null) continue;
    out.push({
      hoja, manzana, lote: String(lote), codigo, clienteAnterior: nombre,
      precio: iP >= 0 ? aNumero(fila[iP]) : null,
      nota: iObs >= 0 && fila[iObs] ? String(fila[iObs]).trim() : null,
    });
  }
  return out;
}

export function leerClientesAnteriores(ruta: string): LoteDeClienteAnterior[] {
  const wb = XLSX.readFile(ruta);
  return wb.SheetNames.flatMap(hoja =>
    filasConClienteAnterior(hoja, XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true }) as unknown[][]));
}

const PALABRAS_VACIAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'MA', 'MA.']);

/** Palabras significativas de un nombre, sin acentos ni mayúsculas/minúsculas. */
export function palabrasDeNombre(nombre: string): Set<string> {
  return new Set(
    nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      .split(/[^A-Z]+/).filter(p => p.length > 1 && !PALABRAS_VACIAS.has(p)),
  );
}

/**
 * ¿El "CLIENTE ANTERIOR" del archivo es el cliente del contrato? Se exige que
 * compartan al menos dos palabras (nombre + apellido): el archivo tiene erratas
 * ("Deni Sakay  Gutierrez") y acentos distintos, pero un código bien puesto
 * con otro nombre es señal de que la fila está mal y no se debe usar.
 */
export function mismoCliente(delArchivo: string, delContrato: string): boolean {
  const a = palabrasDeNombre(delArchivo);
  const b = palabrasDeNombre(delContrato);
  let comunes = 0;
  for (const p of a) if (b.has(p)) comunes++;
  return comunes >= 2;
}
