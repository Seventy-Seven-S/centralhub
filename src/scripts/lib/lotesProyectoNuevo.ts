// Lector de la hoja de lotes de un proyecto nuevo: manzana, lote, superficie y
// precio, sin clientes ni ventas.
//
// Comparte con lotesTotales.ts la normalización y la lectura de números, pero
// la forma es distinta: ahí cada hoja es un proyecto ya vendido y el estatus
// manda; aquí todo el inventario está libre y lo que importa es el precio.
import { norm, aNumero } from './lotesTotales';

export interface LoteNuevo {
  manzana: number;
  lote: string;
  ubicacion: string | null;
  superficie: number | null;
  precioM2: number | null;
  precio: number | null;
}

export interface LecturaLotes {
  lotes: LoteNuevo[];
  /** Filas que no eran lotes: totales, encabezados repetidos, renglones vacíos. */
  descartadas: number;
  /** Manzana y lote que aparecen más de una vez. Duplicar inventario infla el
   *  valor del proyecto — pasó con 12 filas de Puerta del Sol. */
  repetidos: string[];
}

const indiceDe = (head: string[], ...alternativas: string[]) => {
  for (const a of alternativas) {
    const i = head.findIndex(h => h === a);
    if (i >= 0) return i;
  }
  return -1;
};

export function leerLotesDeHoja(filas: unknown[][]): LecturaLotes {
  const head = (filas[0] ?? []).map(norm);

  const iM = indiceDe(head, 'MANZANA', 'MZA');
  if (iM === -1) throw new Error('La hoja no tiene una columna de MANZANA');
  const iL = indiceDe(head, 'LOTE');
  if (iL === -1) throw new Error('La hoja no tiene una columna de LOTE');

  // "UNICACION" es como viene escrito en el archivo de Los Cisnes.
  const iU = indiceDe(head, 'UBICACION', 'UNICACION');
  const iS = indiceDe(head, 'SUPERFICIE', 'SUPERFICIE M2', 'M2');
  const iPM = indiceDe(head, 'PRECIO M2', 'PRECIO/M2');
  const iP = indiceDe(head, 'PRECIO', 'PRECIO INICIAL', 'PRECIO/VENTA');

  const lotes: LoteNuevo[] = [];
  const vistos = new Map<string, number>();
  let descartadas = 0;

  for (const fila of filas.slice(1)) {
    const manzana = aNumero(fila?.[iM]);
    const lote = aNumero(fila?.[iL]);
    if (manzana === null || lote === null) { descartadas++; continue; }

    const clave = `M${manzana}-L${lote}`;
    vistos.set(clave, (vistos.get(clave) ?? 0) + 1);

    lotes.push({
      manzana,
      // lotNumber es texto en la app.
      lote: String(lote),
      ubicacion: iU >= 0 && norm(fila[iU]) ? String(fila[iU]).trim() : null,
      superficie: iS >= 0 ? aNumero(fila[iS]) : null,
      precioM2: iPM >= 0 ? aNumero(fila[iPM]) : null,
      precio: iP >= 0 ? aNumero(fila[iP]) : null,
    });
  }

  return {
    lotes,
    descartadas,
    repetidos: [...vistos.entries()].filter(([, n]) => n > 1).map(([k]) => k),
  };
}
