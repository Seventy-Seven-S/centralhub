// Matemática pura del calendario de cuotas. Sin DB, sin Excel.

import * as XLSX from 'xlsx';

export interface PlazoParsed {
  months: number | null;
  isContado: boolean;
  source: 'codigos' | 'contado' | 'inferido';
}

/** Parsea el campo "PLAZO (AÑOS)" de la hoja Códigos. Copiado 1:1 de migrate-project. */
export function parsePlazo(raw: string): PlazoParsed {
  const s = (raw || '').trim();
  if (!s) return { months: null, isContado: false, source: 'inferido' };

  const upper = s.toUpperCase();
  if (upper.includes('CONTADO')) {
    return { months: 0, isContado: true, source: 'contado' };
  }
  const ym = s.match(/(\d+)\s*a\s*-?\s*(\d+)\s*m/i);
  if (ym) {
    return { months: parseInt(ym[1]) * 12 + parseInt(ym[2]), isContado: false, source: 'codigos' };
  }
  const yOnly = s.match(/^(\d+)\s*a$/i);
  if (yOnly) {
    return { months: parseInt(yOnly[1]) * 12, isContado: false, source: 'codigos' };
  }
  const n = parseInt(s);
  if (!isNaN(n) && n > 0 && n <= 30) {
    return { months: n * 12, isContado: false, source: 'codigos' };
  }
  return { months: null, isContado: false, source: 'inferido' };
}

const CODIGOS_SHEET_ALIASES = [
  'Códigos', 'Codigos', 'Códigos de Cliente', 'Codigos de Cliente',
  'Códigos de Clientes', 'Codigo de Cliente',
];

/** Mapa códigoUpper -> PlazoParsed leyendo la hoja Códigos del Excel. */
export function readPlazosByCodigo(excelPath: string): Map<string, PlazoParsed> {
  const wb = XLSX.readFile(excelPath);
  const sheetName =
    wb.SheetNames.find(s => CODIGOS_SHEET_ALIASES.some(a => a.toLowerCase() === s.trim().toLowerCase())) ??
    wb.SheetNames.find(s => s.toLowerCase().includes('digo'));
  if (!sheetName) throw new Error(`No se encontró hoja de Códigos en ${excelPath}`);

  const grid: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false });
  let headerRow = -1;
  for (let i = 0; i <= 5; i++) {
    const joined = (grid[i] || []).join(' ').toUpperCase();
    if (joined.includes('CODIGO') && joined.includes('LOTE')) { headerRow = i; break; }
  }
  if (headerRow === -1) throw new Error(`No se detectó fila de headers en "${sheetName}"`);

  const headers = (grid[headerRow] || []).map((h: any) => (h ?? '').toString().trim().toUpperCase());
  const codIdx = headers.findIndex((h: string) => h.includes('CODIGO'));
  const plazoIdx = headers.findIndex((h: string) => h.includes('PLAZO'));

  const map = new Map<string, PlazoParsed>();
  for (let i = headerRow + 1; i < grid.length; i++) {
    const row = grid[i] || [];
    const cod = (row[codIdx] ?? '').toString().trim().toUpperCase();
    if (!/^[A-Z]+\d+$/.test(cod)) continue;
    const plazoRaw = plazoIdx !== -1 ? (row[plazoIdx] ?? '').toString() : '';
    map.set(cod, parsePlazo(plazoRaw));
  }
  return map;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Reparte `financiado` en `plazoMeses` cuotas.
 * Las primeras plazoMeses-1 son iguales (round2(financiado/plazoMeses));
 * la última absorbe el redondeo para que la suma sea exactamente round2(financiado).
 */
export function buildScheduleAmounts(financiado: number, plazoMeses: number): number[] {
  if (plazoMeses <= 0) return [];
  const base = round2(financiado / plazoMeses);
  const amounts: number[] = [];
  for (let i = 0; i < plazoMeses - 1; i++) amounts.push(base);
  const ultima = round2(round2(financiado) - base * (plazoMeses - 1));
  amounts.push(ultima);
  return amounts;
}
