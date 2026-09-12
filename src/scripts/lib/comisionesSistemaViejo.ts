/**
 * comisionesSistemaViejo.ts — lector de la hoja "Comisiones" del sistema viejo.
 *
 * Una fila por LOTE vendido, con lo que se le calculó al asesor (COMISION) y lo
 * que efectivamente se le pagó (RECIBO). Se toma RECIBO: es la cifra que el
 * arquitecto usa en su tabla de egresos y es el dinero que realmente salió.
 *
 * La hoja NO tiene fecha. Quien la carga debe fecharla desde afuera —
 * típicamente con la fecha del enganche del contrato dueño del lote, que es
 * cuando la comisión se gana y se paga.
 */

export interface ComisionLeida {
  manzana: number;
  lote: string;
  asesor: string;
  estatus: string;
  /** Lo efectivamente pagado (columna RECIBO). */
  monto: number;
  /** Lo calculado (columna COMISION), solo para referencia. */
  comisionCalculada: number | null;
}

export interface LecturaComisiones {
  comisiones: ComisionLeida[];
  /** Lotes cuya comisión es 0: no hubo egreso que registrar. */
  enCero: Array<{ manzana: number; lote: string; asesor: string }>;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Recibe la matriz cruda de la hoja completa, con sus filas de resumen. */
export function leerComisionesDeMatriz(rows: unknown[][]): LecturaComisiones {
  const iH = rows.findIndex(r => r.some(c => typeof c === 'string' && /^\s*MANZANA\s*$/i.test(c)));
  if (iH < 0) throw new Error('La hoja no tiene columna MANZANA');
  const H = rows[iH].map(c => (typeof c === 'string' ? c.trim().toUpperCase() : ''));
  const col = (n: string) => H.indexOf(n);
  const cMz = col('MANZANA'), cLt = col('LOTE'), cCom = col('COMISION'), cRec = col('RECIBO');
  // Asesor y estatus no tienen encabezado; van fijos a la derecha del enganche.
  const cAse = cRec - 2, cEst = cRec - 1;

  const out: LecturaComisiones = { comisiones: [], enCero: [] };
  for (const r of rows.slice(iH + 1)) {
    // Solo las filas de datos traen manzana Y lote numéricos; las de resumen no.
    if (typeof r[cMz] !== 'number' || typeof r[cLt] !== 'number') continue;
    const manzana = r[cMz] as number;
    const lote = String(r[cLt]).trim();
    const asesor = typeof r[cAse] === 'string' ? r[cAse].trim() : '';
    const estatus = typeof r[cEst] === 'string' ? r[cEst].trim() : '';
    const monto = num(r[cRec]) ?? 0;
    if (monto === 0) { out.enCero.push({ manzana, lote, asesor }); continue; }
    out.comisiones.push({ manzana, lote, asesor, estatus, monto, comisionCalculada: num(r[cCom]) });
  }
  return out;
}
