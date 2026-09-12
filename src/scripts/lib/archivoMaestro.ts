/**
 * Lector del archivo maestro de las secretarias:
 *   backups/PRECIO,  SUPERFICIE, MENSUALIDAD.xlsx
 *
 * Es el archivo que ellas armaron a partir de los contratos firmados, y la
 * fuente de verdad de la MENSUALIDAD, el PRECIO y la SUPERFICIE. Una hoja por
 * proyecto, una fila por LOTE — un contrato con varios lotes aparece repetido
 * bajo el mismo código de cliente.
 *
 * Las hojas no comparten formato: el encabezado está en la fila 0, 1 o 2 según
 * la hoja, y las columnas cambian de nombre y de posición. Por eso el
 * encabezado se localiza buscando la celda "CODIGO DE CLIENTE" y las columnas
 * se resuelven por nombre, nunca por índice fijo.
 */
import * as XLSX from 'xlsx';

// Consolidado entregado por las secretarias el 2026-09-09: los 12 proyectos
// en un solo archivo, con la columna "1er PAGO". Es LA fuente de verdad —
// decisión del usuario: no se reconcilia contra la BD, se asume.
export const ARCHIVO_MAESTRO = 'backups/CONSOLIDADO-FUENTE-DE-VERDAD-2026-09-09.xlsx';

/** Nombre de hoja → código de proyecto en la app. */
export const HOJA_A_PROYECTO: Record<string, string> = {
  'V.ROBLE': 'VDR',
  'MONARCA': 'MON1',
  'MONARCA 2': 'MON2',
  'V. BUGAMBILIAS': 'VDB',
  'BETANIA': 'BET',
  'MAGNOLIA': 'MDS',
  'JSA-1': 'JSA1',
  'JSA-2': 'JSA2',
  'JSA-3': 'JSA3',
  'JSA-4': 'JSA4',
  // Añadidas en el consolidado del 2026-09-09: antes SAN y PDS vivían en un
  // archivo aparte y sus 252 contratos quedaban fuera de toda comparación.
  'SANTANDER': 'SAN',
  'PUERTA DEL SOL': 'PDS',
};

export interface FilaLote {
  codigo: string;
  proyecto: string;
  hoja: string;
  manzana: string | null;
  lote: string | null;
  cliente: string | null;
  /** null cuando la celda dice "DE CONTADO", trae guion o viene vacía. */
  mensualidad: number | null;
  precio: number | null;
  /** Columna COMISION: lo que se le pagó al asesor por ese lote. Solo algunas
   *  hojas la traen; en las demás es null. */
  comision: number | null;
  /** Columna DOBLE COMISION: un segundo pago al vendedor por ese mismo lote.
   *  Es dinero que salió igual, aparte de la comisión normal. */
  comisionDoble: number | null;
  m2: number | null;
  /** Texto crudo del plazo: puede ser un número de años o "DE CONTADO". */
  plazoTexto: string | null;
  /** Texto crudo del mes del primer pago: "MAYO" o "Octubre/25". */
  primerPagoTexto: string | null;
  /** Año de la fecha de venta (serial de Excel), para completar "MAYO" sin año. */
  anioVenta: number | null;
  /** Columna ESTATUS de las hojas estilo SANTANDER ("Vendido"). */
  estatus: string | null;
  /** Lotes de la fila. Casi siempre uno, pero el archivo combina los que se
   *  vendieron juntos en una sola celda ("19 Y 20", "18,19"). */
  lotes: string[];
  /** La fila cubre varios lotes vendidos como uno solo. */
  vendidoJunto: boolean;
  /**
   * A quién pertenecía el lote antes. En casi todas las hojas son dos columnas
   * al final (CODIGO y CLIENTE ANTERIOR); V.ROBLE las junta en una sola,
   * titulada "CODIGO Y CLIENTE ANTERIOR (TRASPASO O RESCISION)". Es la huella
   * de los traspasos y rescisiones que la app todavía no refleja.
   */
  clienteAnterior: string | null;
  codigoAnterior: string | null;
  deContado: boolean;
  observaciones: string | null;
}

const norm = (v: any) => String(v ?? '').trim().toUpperCase();

/**
 * Convierte una celda a número. Tolera "$4,687.50", espacios y guiones.
 * Devuelve null para vacíos, guiones y textos no numéricos ("DE CONTADO"),
 * en vez de NaN o 0 — un 0 aquí se confundiría con "mensualidad cero".
 */
export function aNumero(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s || s === '-' || s === '—') return null;
  const limpio = s.replace(/[$,\s]/g, '');
  if (!/^-?\d*\.?\d+$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lotes de una celda. El archivo combina en una sola fila los lotes que se
 * vendieron juntos: "19 Y 20", "18,19", "20, 21". La anotación de la columna
 * de cliente lo dice explícito ("Se vendio como un solo lote").
 *
 * El PRECIO de esa fila es del conjunto, no de cada lote: repartirlo
 * inventaría precios que nadie firmó. Por eso se devuelven los lotes y se
 * marca la fila, en vez de dividir.
 */
export function parseLotes(celda: any): string[] {
  if (celda === null || celda === undefined) return [];
  const s = String(celda).replace(/`/g, '').trim();   // el apóstrofo se cuela al capturar
  if (!s) return [];
  return s.split(/\s*(?:,|\sY\s|\sy\s)\s*/).map(x => x.trim()).filter(Boolean);
}

/** Índice de la fila de encabezado, o -1. Se busca "CODIGO DE CLIENTE". */
export function encontrarEncabezado(rows: any[][]): number {
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const celdas = (rows[i] ?? []).map(norm);
    // "CODIGO DE CLIENTE" en casi todas las hojas; V.ROBLE titula solo
    // "CODIGO" y por eso se quedaba fuera (436 contratos de VDR invisibles).
    if (celdas.some(c => c.startsWith('CODIGO DE CLIENT') || c === 'CODIGO')) return i;
  }
  return -1;
}

export interface OpcionesLectura {
  /**
   * Incluir las filas SIN código de cliente, que son el inventario sin vender.
   * Por omisión se omiten: casi todo el código que usa este lector concilia
   * contratos, y ahí una fila sin cliente no significa nada.
   */
  incluirSinCodigo?: boolean;
}

export function leerHoja(rows: any[][], hoja: string, proyecto: string, opciones: OpcionesLectura = {}): FilaLote[] {
  const h = encontrarEncabezado(rows);
  if (h < 0) return [];

  const headers = (rows[h] ?? []).map(norm);
  const buscar = (pred: (s: string) => boolean) => headers.findIndex(pred);

  const cCodigo = buscar(s => s.startsWith('CODIGO DE CLIENT'));
  const cCodigoSolo = buscar(s => s === 'CODIGO');
  const iCodigo = cCodigo >= 0 ? cCodigo : cCodigoSolo;
  // V.ROBLE titula esta columna "CLIENTE ACTUAL" y SANTANDER/PDS solo
  // "CLIENTE"; buscar únicamente "NOMBRE" dejaba fuera esas hojas, y con ellas
  // las anotaciones del tipo "(Se vendio como un solo lote)". Se excluye
  // "CODIGO Y CLIENTE", que es otra columna del mismo archivo.
  const cCliente = buscar(s => (s.includes('NOMBRE') || s.includes('CLIENTE')) && !s.startsWith('CODIGO'));
  const cMza = buscar(s => s.startsWith('MANZANA') || s.startsWith('FRACCION') || s === 'MZA');
  const cLote = buscar(s => s === 'LOTE');
  const cPlazo = buscar(s => s.includes('PLAZO'));
  const cMens = buscar(s => s.includes('MENSUALIDAD'));
  const cM2 = buscar(s => s === 'M2' || s.includes('SUPERFICIE'));
  // OJO: las hojas de SANTANDER/PDS tienen DOS columnas con "PRECIO":
  // "PRECIO M2" (precio por metro) y "PRECIO/VENTA" (el del lote). Buscar por
  // includes('PRECIO') a secas agarraba el precio por metro.
  const cPrecio = buscar(s => s.includes('PRECIO') && !s.includes('M2') && !s.includes('M²'));
  // Cada hoja lo escribe distinto: MONARCA usa "COMISION" y "DOBLE COMISION";
  // V.ROBLE trae "COMICION" (con C, tal cual en el archivo) y "COMISIONDOBLE"
  // sin espacio. Se aceptan las dos grafías y la doble se excluye de la normal.
  const esComision = (s: string) => /^COMI[SC]ION/.test(s);
  const esDoble = (s: string) => s.includes('DOBLE') && /COMI[SC]ION/.test(s);
  const cComision = buscar(s => esComision(s) && !s.includes('DOBLE'));
  const cComisionDoble = buscar(esDoble);
  const cPrimerPago = buscar(s => s.replace(/[\s.]/g, '').includes('1ERPAGO'));
  const cEstatus = buscar(s => s.startsWith('ESTATUS'));
  const cObs = buscar(s => s.includes('OBSERVACIONES'));
  const cFecha = buscar(s => s.includes('FECHA DE VENTA'));
  const cAnterior = buscar(s => s.includes('ANTERIOR'));
  // La columna "CODIGO" suelta del final es el código del dueño anterior; la
  // del principio ("CODIGO DE CLIENTE") es la del actual.
  const cCodAnterior = headers.map((s, i) => ({ s, i }))
    .filter(x => x.s === 'CODIGO' && x.i !== iCodigo).map(x => x.i)[0] ?? -1;

  const out: FilaLote[] = [];
  for (const r of rows.slice(h + 1)) {
    const codigo = norm(r?.[iCodigo]);
    if (!codigo && !opciones.incluirSinCodigo) continue;

    // Al pie de cada hoja hay cuadros de resumen ("Total | 164", "Reservados",
    // "Libres") cuyas celdas caen bajo las mismas columnas. Un lote real tiene
    // manzana numérica y número de lote; esas etiquetas no. El filtro solo
    // aplica si la hoja trae esas columnas: sin ellas no hay nada que filtrar.
    const mzaCruda = cMza >= 0 && r[cMza] != null ? String(r[cMza]).replace(/`/g, '').trim() : '';
    const loteCrudo = cLote >= 0 && r[cLote] != null ? String(r[cLote]).replace(/`/g, '').trim() : '';
    if (cMza >= 0 && !/^\d+$/.test(mzaCruda)) continue;
    if (cLote >= 0 && !loteCrudo) continue;

    const plazoTexto = cPlazo >= 0 && r[cPlazo] != null ? String(r[cPlazo]).trim() : null;
    out.push({
      codigo,
      proyecto,
      hoja,
      // El apóstrofo se cuela al capturar en Excel y aparece tanto en la
      // manzana ("`15") como en el lote: se limpia en los dos.
      manzana: cMza >= 0 && r[cMza] != null ? String(r[cMza]).replace(/`/g, '').trim() : null,
      lote: cLote >= 0 && r[cLote] != null ? String(r[cLote]).replace(/`/g, '').trim() : null,
      lotes: cLote >= 0 ? parseLotes(r[cLote]) : [],
      vendidoJunto: /vendio.*un\s*solo\s*lote|vendi[oó].*juntos?/i.test(String(r[cCliente] ?? '')),
      cliente: cCliente >= 0 && r[cCliente] != null ? String(r[cCliente]).trim() : null,
      mensualidad: cMens >= 0 ? aNumero(r[cMens]) : null,
      precio: cPrecio >= 0 ? aNumero(r[cPrecio]) : null,
      comision: cComision >= 0 ? aNumero(r[cComision]) : null,
      comisionDoble: cComisionDoble >= 0 ? aNumero(r[cComisionDoble]) : null,
      m2: cM2 >= 0 ? aNumero(r[cM2]) : null,
      plazoTexto,
      primerPagoTexto: cPrimerPago >= 0 && r[cPrimerPago] != null ? String(r[cPrimerPago]).trim() || null : null,
      anioVenta: cFecha >= 0 ? anioDeSerialExcel(r[cFecha]) : null,
      estatus: cEstatus >= 0 && r[cEstatus] != null ? String(r[cEstatus]).trim() || null : null,
      clienteAnterior: cAnterior >= 0 && r[cAnterior] != null ? String(r[cAnterior]).trim() || null : null,
      codigoAnterior: cCodAnterior >= 0 && r[cCodAnterior] != null ? String(r[cCodAnterior]).trim() || null : null,
      deContado: norm(plazoTexto).includes('CONTADO'),
      observaciones: cObs >= 0 && r[cObs] != null ? String(r[cObs]).trim() || null : null,
    });
  }
  return out;
}

export function leerArchivoMaestro(ruta = ARCHIVO_MAESTRO, opciones: OpcionesLectura = {}): FilaLote[] {
  const wb = XLSX.readFile(ruta);
  const out: FilaLote[] = [];
  for (const hoja of wb.SheetNames) {
    const proyecto = HOJA_A_PROYECTO[hoja.trim().toUpperCase()] ?? HOJA_A_PROYECTO[hoja.trim()];
    if (!proyecto) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: null }) as any[][];
    out.push(...leerHoja(rows, hoja, proyecto, opciones));
  }
  return out;
}

export interface ContratoArchivo {
  codigo: string;
  proyecto: string;
  lotes: number;
  /** Mensualidad del CONTRATO = suma de las de sus lotes. Ver agruparPorCodigo. */
  mensualidad: number | null;
  /** Lotes del contrato cuya fila venía sin mensualidad (la suma queda corta). */
  lotesSinMensualidad: number;
  /**
   * Alguna fila parece traer el ACUMULADO del contrato en vez del precio de su
   * lote. Caso real (F108): dos lotes de 233.19 m² con la misma mensualidad,
   * uno a $291,490 y el otro a $582,980 — el segundo es la suma. Sumarlos le
   * habría subido $291,490 a una clienta que no lo debe. Cuando esto es true,
   * el precioTotal NO es de fiar y el contrato debe revisarse a mano.
   */
  precioSospechoso: boolean;
  /** "manzana|lote" de cada lote del contrato, para verificar que la app y el
   *  archivo hablan del MISMO contrato y no de dos que comparten código. */
  lotesRef: Set<string>;
  precioTotal: number | null;
  m2Total: number | null;
  deContado: boolean;
  clientes: string[];
}

/**
 * Agrupa las filas por código de cliente (= contrato).
 *
 * Convención: cada fila es un LOTE, y su PRECIO, M2 y MENSUALIDAD son de ese
 * lote. Los tres se SUMAN para obtener los del contrato.
 *
 * Verificado contra producción: A071 tiene 5 lotes y su mensualidad en la BD
 * es $19,166.67 = 5 × $3,833.33, que es el valor repetido en las 5 filas del
 * archivo. Lo mismo en 20 casos revisados de 5 proyectos distintos. Tomar el
 * valor repetido en vez de la suma le bajaría la mensualidad al cliente
 * tantas veces como lotes tenga.
 */
export function agruparPorCodigo(filas: FilaLote[]): Map<string, ContratoArchivo> {
  const porCodigo = new Map<string, FilaLote[]>();
  for (const f of filas) {
    const k = `${f.proyecto}|${f.codigo}`;
    (porCodigo.get(k) ?? porCodigo.set(k, []).get(k)!).push(f);
  }

  const out = new Map<string, ContratoArchivo>();
  for (const [k, fs] of porCodigo) {
    const mens = fs.map(f => f.mensualidad).filter((n): n is number => n !== null);
    const precios = fs.map(f => f.precio).filter((n): n is number => n !== null);
    const m2s = fs.map(f => f.m2).filter((n): n is number => n !== null);

    out.set(k, {
      codigo: fs[0].codigo,
      proyecto: fs[0].proyecto,
      lotes: fs.length,
      mensualidad: mens.length ? Math.round(mens.reduce((a, b) => a + b, 0) * 100) / 100 : null,
      lotesSinMensualidad: fs.length - mens.length,
      precioTotal: precios.length ? precios.reduce((a, b) => a + b, 0) : null,
      precioSospechoso: precioAcumuladoSospechoso(fs),
      lotesRef: new Set(fs.flatMap(f => f.manzana != null ? f.lotes.map(l => `${Number(f.manzana)}|${l}`) : [])),
      m2Total: m2s.length ? Math.round(m2s.reduce((a, b) => a + b, 0) * 1000) / 1000 : null,
      deContado: fs.every(f => f.deContado),
      clientes: [...new Set(fs.map(f => f.cliente).filter((s): s is string => !!s))],
    });
  }
  return out;
}

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Mes en que el cliente empieza a pagar. Dos formatos conviven en el archivo:
 *   "MAYO"        → V.ROBLE y las hojas de proyecto; el año sale de la venta
 *   "Octubre/25"  → SANTANDER y PUERTA DEL SOL; trae el año en dos dígitos
 *
 * Devuelve null —nunca una fecha inventada— si no se puede determinar, porque
 * de este dato depende dónde arranca el calendario de cuotas del cliente.
 */
export function parsePrimerPago(texto: any, anioVenta: number | null): { mes: number; anio: number } | null {
  if (texto === null || texto === undefined) return null;
  const s = sinAcentos(String(texto).trim().toLowerCase());
  if (!s || s === '-' || s === '\u2014') return null;

  const [nombreMes, anioTxt] = s.split('/').map(x => x.trim());
  const idx = MESES_ES.findIndex(m => m === nombreMes);
  if (idx < 0) return null;

  if (anioTxt) {
    const n = Number(anioTxt);
    if (!Number.isFinite(n)) return null;
    return { mes: idx + 1, anio: n < 100 ? 2000 + n : n };
  }
  if (anioVenta === null) return null;
  return { mes: idx + 1, anio: anioVenta };
}

/** Serial de fecha de Excel → año. Excel cuenta días desde 1899-12-30. */
export function anioDeSerialExcel(serial: any): number | null {
  const n = aNumero(serial);
  if (n === null || n < 1) return null;
  return new Date(Date.UTC(1899, 11, 30) + n * 86400000).getUTCFullYear();
}

/**
 * ¿Alguna fila trae el acumulado en vez del precio de su lote?
 *
 * La señal: dos lotes con la MISMA superficie y la MISMA mensualidad no pueden
 * costar distinto. Si el precio por m² de una fila se sale del de sus
 * hermanas, esa fila lleva la suma, no su parte.
 */
function precioAcumuladoSospechoso(fs: FilaLote[]): boolean {
  const conDatos = fs.filter(f => f.precio != null && f.precio > 0 && f.m2 != null && f.m2 > 0);
  if (conDatos.length < 2) return false;

  const ppm = conDatos.map(f => f.precio! / f.m2!);
  const min = Math.min(...ppm), max = Math.max(...ppm);
  // Más de 1.5x entre el precio por m² más barato y el más caro del MISMO
  // contrato: los lotes de un mismo comprador no varían así.
  return max > min * 1.5;
}

/** Redondeo al peso mayor inmediato: 4570.15 → 4571, 4570 → 4570. */
export function alPesoMayor(n: number): number {
  return Math.ceil(Math.round(n * 100) / 100);
}
