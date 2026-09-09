/**
 * ============================================================================
 * generate-lots-template.ts — Genera el "machote" de inventario de lotes
 * ============================================================================
 *
 * Produce un .xlsx con una hoja por proyecto para que el equipo de la
 * inmobiliaria complete los datos faltantes (superficie, precio, inventario).
 *
 * El archivo resultante es consumible por `readLotsFromTemplate()` de
 * lib/lots.ts: las columnas Proyecto | Manzana | Lote | Superficie_m2 |
 * Precio | Precio_m2 | Estatus son exactamente las que ese lector espera.
 * Las columnas extra (Cliente actual, Notas) son informativas y se ignoran.
 *
 * Uso:
 *   npx tsx src/scripts/generate-lots-template.ts [--out <ruta.xlsx>]
 */

import ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaClient, LotStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

/**
 * Proyectos cuyo inventario en BD está INCOMPLETO y necesitan que el equipo
 * capture lotes nuevos, no solo que rellene celdas.
 *
 *  - Migrados solo desde la hoja "Códigos de Cliente" (que únicamente lista
 *    ventas), así que los lotes DISPONIBLES nunca se cargaron.
 *  - O con menos lotes en BD que los declarados en `project.totalLots`.
 */
const INVENTARIO_INCOMPLETO: Record<string, string> = {
  BET: 'Solo se cargaron los 11 lotes vendidos. Falta TODO el inventario disponible.',
  JSA4: 'Solo se cargaron los 149 lotes vendidos. Falta el inventario disponible.',
  MON1: 'Solo se cargaron los 193 lotes vendidos. Falta el inventario disponible.',
  PDS: 'Solo se cargaron los 60 lotes vendidos. Falta el inventario disponible.',
  SAN: 'Solo se cargaron los lotes vendidos. Falta el inventario disponible.',
  VDR: 'Solo se cargaron los 512 lotes vendidos. Falta el inventario disponible.',
  MDS: 'Hay menos lotes cargados que los declarados para el proyecto. Falta completar el inventario.',
  VSR: 'Solo hay 10 lotes cargados. Falta prácticamente todo el inventario.',
};

/** Filas en blanco que se agregan al final de un proyecto incompleto. */
const FILAS_EN_BLANCO = 300;

const ESTATUS_OPCIONES = ['DISPONIBLE', 'VENDIDO', 'RESERVADO', 'NO DISPONIBLE'];

const ESTATUS_ES: Record<LotStatus, string> = {
  AVAILABLE: 'DISPONIBLE',
  SOLD: 'VENDIDO',
  RESERVED: 'RESERVADO',
  UNAVAILABLE: 'NO DISPONIBLE',
};

// Paleta
const AZUL = 'FF1F3864';       // encabezados
const AMARILLO = 'FFFFE699';   // falta capturar
const VERDE = 'FFE2EFDA';      // ya lo tenemos, solo confirmar
const GRIS = 'FFF2F2F2';       // informativo / no tocar
const ROJO = 'FFC00000';       // banner de advertencia
const ROJO_SUAVE = 'FFFCE4E4';

const COLUMNAS = [
  { header: 'Proyecto', key: 'proyecto', width: 11 },
  { header: 'Manzana', key: 'manzana', width: 10 },
  { header: 'Lote', key: 'lote', width: 8 },
  { header: 'Superficie_m2', key: 'superficie', width: 15 },
  { header: 'Precio', key: 'precio', width: 15 },
  { header: 'Precio_m2', key: 'precioM2', width: 13 },
  { header: 'Estatus', key: 'estatus', width: 16 },
  { header: 'Cliente actual (informativo)', key: 'cliente', width: 34 },
  { header: 'Notas', key: 'notas', width: 40 },
];

const HEADER_ROW = 2;   // fila 1 = banner
const FIRST_DATA_ROW = 3;

// ============================================================================
// HELPERS DE FORMATO
// ============================================================================

function fill(cell: ExcelJS.Cell, color: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
}

function borde(cell: ExcelJS.Cell) {
  const linea = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
  cell.border = { top: linea, left: linea, bottom: linea, right: linea };
}

/** Celda que el equipo SÍ puede editar (necesario con protección de hoja). */
function editable(cell: ExcelJS.Cell) {
  cell.protection = { locked: false };
}

// ============================================================================
// DATOS
// ============================================================================

interface FilaLote {
  manzana: number;
  lote: string;
  superficie: number;
  precio: number;
  precioDeContrato: boolean;
  estatus: string;
  cliente: string;
}

interface DatosProyecto {
  code: string;
  name: string;
  totalLotsDeclarado: number;
  filas: FilaLote[];
  faltanM2: number;
  faltanPrecio: number;
  preciosRecuperados: number;
  incompleto: boolean;
}

async function cargarDatos(): Promise<DatosProyecto[]> {
  const projects = await prisma.project.findMany({ orderBy: { code: 'asc' } });
  const out: DatosProyecto[] = [];

  for (const pr of projects) {
    const lots = await prisma.lot.findMany({
      where: { projectId: pr.id },
      orderBy: [{ manzana: 'asc' }, { lotNumber: 'asc' }],
      include: {
        contracts: {
          include: { contract: { include: { client: true } } },
        },
      },
    });

    const filas: FilaLote[] = [];
    let faltanM2 = 0;
    let faltanPrecio = 0;
    let preciosRecuperados = 0;

    for (const lot of lots) {
      const cl = lot.contracts[0]?.contract?.client;
      const cliente = cl ? `${cl.firstName} ${cl.lastName}`.trim() : '';

      let precio = lot.currentPrice > 0 ? lot.currentPrice : 0;
      let precioDeContrato = false;

      if (precio === 0) {
        // El precio de venta vive en ContractLot.priceAtSale aunque el lote
        // tenga basePrice = 0 (migraciones desde la hoja de Códigos).
        const desdeContrato = lot.contracts.find((c) => c.priceAtSale > 0)?.priceAtSale ?? 0;
        if (desdeContrato > 0) {
          precio = desdeContrato;
          precioDeContrato = true;
          preciosRecuperados++;
        } else {
          faltanPrecio++;
        }
      }

      if (!lot.areaM2 || lot.areaM2 <= 0) faltanM2++;

      filas.push({
        manzana: lot.manzana,
        lote: lot.lotNumber,
        superficie: lot.areaM2 > 0 ? lot.areaM2 : 0,
        precio,
        precioDeContrato,
        estatus: ESTATUS_ES[lot.status],
        cliente,
      });
    }

    out.push({
      code: pr.code,
      name: pr.name,
      totalLotsDeclarado: pr.totalLots,
      filas,
      faltanM2,
      faltanPrecio,
      preciosRecuperados,
      incompleto: pr.code in INVENTARIO_INCOMPLETO,
    });
  }

  return out;
}

// ============================================================================
// HOJA DE INSTRUCCIONES
// ============================================================================

function construirInstrucciones(wb: ExcelJS.Workbook, datos: DatosProyecto[], fechaCorte: string) {
  const ws = wb.addWorksheet('INSTRUCCIONES', {
    properties: { tabColor: { argb: AZUL } },
  });

  ws.columns = [
    { width: 4 }, { width: 26 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 14 }, { width: 52 },
  ];

  let r = 1;

  const titulo = ws.getCell(`B${r}`);
  titulo.value = 'CentralHub — Inventario de Lotes';
  titulo.font = { size: 18, bold: true, color: { argb: AZUL } };
  ws.mergeCells(`B${r}:G${r}`);
  r += 1;

  const sub = ws.getCell(`B${r}`);
  sub.value = `Machote para completar la información faltante · Datos al corte del ${fechaCorte}`;
  sub.font = { size: 11, italic: true, color: { argb: 'FF595959' } };
  ws.mergeCells(`B${r}:G${r}`);
  r += 2;

  const seccion = (texto: string) => {
    const c = ws.getCell(`B${r}`);
    c.value = texto;
    c.font = { size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    fill(c, AZUL);
    ws.mergeCells(`B${r}:G${r}`);
    ws.getRow(r).height = 22;
    r += 1;
  };

  const parrafo = (texto: string, negrita = false) => {
    const c = ws.getCell(`B${r}`);
    c.value = texto;
    c.font = { size: 11, bold: negrita };
    c.alignment = { wrapText: true, vertical: 'top' };
    ws.mergeCells(`B${r}:G${r}`);
    ws.getRow(r).height = Math.max(18, Math.ceil(texto.length / 105) * 15);
    r += 1;
  };

  seccion('¿Qué es este archivo?');
  parrafo(
    'Este archivo contiene el inventario de lotes de los 13 proyectos tal como está hoy en CentralHub. ' +
    'Hay una hoja por proyecto (ver las pestañas de abajo). Necesitamos que el equipo complete la ' +
    'información que nos falta para poder mostrar precios, superficies y disponibilidad correctos en el sistema.'
  );
  r += 1;

  seccion('Cómo llenarlo');
  parrafo('1.  Una fila = un lote. Nunca combines ni fusiones celdas.');
  parrafo('2.  No cambies, borres ni reordenes los encabezados (fila 2 de cada hoja). El sistema los lee por nombre.');
  parrafo('3.  Superficie_m2: solo el número, con decimales si aplica. Ejemplo: 162.50   (NO escribas "162.5 m2").');
  parrafo('4.  Precio: solo el número, sin signo de pesos ni comas. Ejemplo: 485000   (NO escribas "$485,000.00").');
  parrafo('5.  Precio o Precio_m2: basta con llenar UNO de los dos. Si pones Precio_m2, el sistema calcula el total multiplicando por la superficie.');
  parrafo('6.  Estatus: usa la lista desplegable de la celda. No escribas variantes libres.');
  parrafo('7.  Las columnas grises (Proyecto, Cliente actual) son informativas y están bloqueadas: sirven para que verifiques que estás en el lote correcto.');
  parrafo('8.  Notas: úsala libremente para dudas, lotes en litigio, lotes fusionados, etc. No entra al sistema, pero la leemos.');
  parrafo('9.  Si un lote de la lista NO existe en la realidad, no borres la fila: escríbelo en Notas y lo damos de baja nosotros.');
  r += 1;

  seccion('Código de colores');
  const leyenda: [string, string, string][] = [
    [AMARILLO, 'AMARILLO', 'Falta el dato y lo necesitamos. Esto es lo que hay que capturar.'],
    [VERDE, 'VERDE', 'Ya tenemos el dato. Solo confírmalo; corrígelo si está mal.'],
    [GRIS, 'GRIS', 'Informativo o calculado. No hace falta que lo toques.'],
    [ROJO_SUAVE, 'ROJO', 'Advertencia al inicio de la hoja: a ese proyecto le faltan lotes completos.'],
  ];
  for (const [color, nombre, desc] of leyenda) {
    const muestra = ws.getCell(`B${r}`);
    muestra.value = nombre;
    muestra.font = { bold: true, size: 11 };
    muestra.alignment = { horizontal: 'center' };
    fill(muestra, color);
    borde(muestra);
    const d = ws.getCell(`C${r}`);
    d.value = desc;
    d.font = { size: 11 };
    ws.mergeCells(`C${r}:G${r}`);
    r += 1;
  }
  r += 1;

  seccion('Qué falta en cada proyecto');

  const cab = ['Proyecto', 'Lotes', 'Falta m²', 'Falta precio', 'Inventario', 'Observación'];
  cab.forEach((h, i) => {
    const c = ws.getCell(r, i + 2);
    c.value = h;
    c.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    fill(c, AZUL);
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    borde(c);
  });
  ws.getRow(r).height = 20;
  r += 1;

  for (const d of datos) {
    const valores = [
      `${d.code} — ${d.name}`,
      d.filas.length,
      d.faltanM2,
      d.faltanPrecio,
      d.incompleto ? 'INCOMPLETO' : 'Completo',
      d.incompleto ? INVENTARIO_INCOMPLETO[d.code] : '',
    ];
    valores.forEach((v, i) => {
      const c = ws.getCell(r, i + 2);
      c.value = v as any;
      c.font = { size: 10 };
      c.alignment = { vertical: 'top', wrapText: i === 5, horizontal: i === 0 || i === 5 ? 'left' : 'center' };
      borde(c);
      if (i === 2 && d.faltanM2 > 0) fill(c, AMARILLO);
      if (i === 3 && d.faltanPrecio > 0) fill(c, AMARILLO);
      if (i === 4) fill(c, d.incompleto ? ROJO_SUAVE : VERDE);
    });
    ws.getRow(r).height = d.incompleto ? 30 : 16;
    r += 1;
  }

  const totalM2 = datos.reduce((a, d) => a + d.faltanM2, 0);
  const totalPrecio = datos.reduce((a, d) => a + d.faltanPrecio, 0);
  const totalLotes = datos.reduce((a, d) => a + d.filas.length, 0);
  const totales = ['TOTAL', totalLotes, totalM2, totalPrecio, '', ''];
  totales.forEach((v, i) => {
    const c = ws.getCell(r, i + 2);
    c.value = v as any;
    c.font = { bold: true, size: 10 };
    c.alignment = { horizontal: i === 0 ? 'left' : 'center' };
    fill(c, GRIS);
    borde(c);
  });
  r += 2;

  seccion('¿Dudas?');
  parrafo(
    'Escríbelas en la columna "Notas" de la fila correspondiente, o contáctanos directamente. ' +
    'Es preferible una nota a un dato inventado: un precio equivocado en el sistema es peor que un precio vacío.'
  );

  ws.views = [{ showGridLines: false }];
}

// ============================================================================
// HOJA DE PROYECTO
// ============================================================================

function construirHojaProyecto(wb: ExcelJS.Workbook, d: DatosProyecto) {
  const ws = wb.addWorksheet(d.code, {
    properties: { tabColor: { argb: d.incompleto ? ROJO : AZUL } },
  });

  ws.columns = COLUMNAS.map((c) => ({ key: c.key, width: c.width }));

  // ---- Fila 1: banner --------------------------------------------------
  ws.mergeCells(1, 1, 1, COLUMNAS.length);
  const banner = ws.getCell(1, 1);
  if (d.incompleto) {
    banner.value =
      `⚠  ${d.code} — ${d.name}   |   ${INVENTARIO_INCOMPLETO[d.code]}  ` +
      `Agrega los lotes que faltan en las filas en blanco del final de esta hoja.`;
    banner.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    fill(banner, ROJO);
  } else {
    banner.value =
      `${d.code} — ${d.name}   |   ${d.filas.length} lotes.   ` +
      `Rellena las celdas AMARILLAS. Las VERDES ya las tenemos: solo confírmalas.`;
    banner.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    fill(banner, AZUL);
  }
  banner.alignment = { vertical: 'middle', wrapText: true };
  ws.getRow(1).height = 32;

  // ---- Fila 2: encabezados ---------------------------------------------
  const header = ws.getRow(HEADER_ROW);
  COLUMNAS.forEach((col, i) => {
    const c = header.getCell(i + 1);
    c.value = col.header;
    c.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    fill(c, AZUL);
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    borde(c);
  });
  header.height = 28;

  // ---- Filas de datos ---------------------------------------------------
  const escribirFila = (
    rowIdx: number,
    f: FilaLote | null   // null = fila en blanco para capturar lote nuevo
  ) => {
    const row = ws.getRow(rowIdx);

    // A — Proyecto (siempre pre-llenado, informativo)
    const cProy = row.getCell(1);
    cProy.value = d.code;
    cProy.alignment = { horizontal: 'center' };
    fill(cProy, GRIS);
    cProy.font = { size: 10, color: { argb: 'FF808080' } };

    // B — Manzana
    const cMz = row.getCell(2);
    cMz.alignment = { horizontal: 'center' };
    if (f) {
      cMz.value = f.manzana;
      fill(cMz, VERDE);
    } else {
      fill(cMz, AMARILLO);
      editable(cMz);
    }

    // C — Lote
    const cLote = row.getCell(3);
    cLote.alignment = { horizontal: 'center' };
    if (f) {
      cLote.value = /^\d+$/.test(f.lote) ? Number(f.lote) : f.lote;
      fill(cLote, VERDE);
    } else {
      fill(cLote, AMARILLO);
      editable(cLote);
    }

    // D — Superficie_m2  (siempre editable: es el dato que más falta)
    const cSup = row.getCell(4);
    cSup.numFmt = '0.00';
    cSup.alignment = { horizontal: 'right' };
    editable(cSup);
    if (f && f.superficie > 0) {
      cSup.value = f.superficie;
      fill(cSup, VERDE);
    } else {
      fill(cSup, AMARILLO);
    }

    // E — Precio
    const cPre = row.getCell(5);
    cPre.numFmt = '#,##0.00';
    cPre.alignment = { horizontal: 'right' };
    editable(cPre);
    if (f && f.precio > 0) {
      cPre.value = f.precio;
      fill(cPre, VERDE);
      if (f.precioDeContrato) {
        cPre.note = 'Precio tomado del contrato de venta de este lote. Confirma que sea el precio de lista correcto.';
      }
    } else {
      fill(cPre, AMARILLO);
    }

    // F — Precio_m2 (alternativa a Precio)
    const cPm2 = row.getCell(6);
    cPm2.numFmt = '#,##0.00';
    cPm2.alignment = { horizontal: 'right' };
    editable(cPm2);
    // Solo se pinta como pendiente cuando tampoco hay Precio total.
    fill(cPm2, f && f.precio > 0 ? GRIS : AMARILLO);

    // G — Estatus (dropdown)
    const cEst = row.getCell(7);
    cEst.alignment = { horizontal: 'center' };
    editable(cEst);
    cEst.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${ESTATUS_OPCIONES.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Estatus inválido',
      error: 'Elige uno de la lista: DISPONIBLE, VENDIDO, RESERVADO, NO DISPONIBLE.',
    };
    if (f) {
      cEst.value = f.estatus;
      fill(cEst, VERDE);
    } else {
      fill(cEst, AMARILLO);
    }

    // H — Cliente actual (informativo, bloqueado)
    const cCli = row.getCell(8);
    cCli.value = f?.cliente || '';
    cCli.font = { size: 10, color: { argb: 'FF808080' } };
    fill(cCli, GRIS);

    // I — Notas (libre)
    const cNot = row.getCell(9);
    editable(cNot);
    cNot.alignment = { wrapText: true, vertical: 'top' };

    for (let i = 1; i <= COLUMNAS.length; i++) borde(row.getCell(i));
    row.height = 16;
  };

  let r = FIRST_DATA_ROW;
  for (const f of d.filas) escribirFila(r++, f);

  if (d.incompleto) {
    // Separador visual antes de las filas para capturar lotes nuevos.
    ws.mergeCells(r, 1, r, COLUMNAS.length);
    const sep = ws.getCell(r, 1);
    sep.value = '▼  AGREGA AQUÍ LOS LOTES QUE FALTAN (disponibles, apartados, de dueños, etc.) — una fila por lote  ▼';
    sep.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    sep.alignment = { horizontal: 'center', vertical: 'middle' };
    fill(sep, ROJO);
    ws.getRow(r).height = 24;
    r += 1;

    for (let i = 0; i < FILAS_EN_BLANCO; i++) escribirFila(r++, null);
  }

  const ultimaFila = r - 1;

  // Encabezados congelados + autofiltro.
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: HEADER_ROW }];
  ws.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: ultimaFila, column: COLUMNAS.length },
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outPath = outIdx !== -1 && args[outIdx + 1]
    ? path.resolve(args[outIdx + 1])
    : path.resolve('docs/plantillas/CentralHub - Inventario de Lotes (por llenar).xlsx');

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  console.log('Leyendo inventario de la base de datos...');
  const datos = await cargarDatos();

  const fechaCorte = new Date().toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CentralHub';
  wb.created = new Date();

  construirInstrucciones(wb, datos, fechaCorte);
  for (const d of datos) construirHojaProyecto(wb, d);

  // Protección: bloquea lo pre-llenado informativo, pero permite capturar,
  // filtrar, ordenar e insertar filas. Sin contraseña: es una guarda contra
  // errores accidentales, no un candado.
  for (const ws of wb.worksheets) {
    await ws.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: true,
      formatColumns: true,
      formatRows: true,
      insertRows: true,
      sort: true,
      autoFilter: true,
    });
  }

  await wb.xlsx.writeFile(outPath);

  // ---- Resumen en consola ----------------------------------------------
  const totalLotes = datos.reduce((a, d) => a + d.filas.length, 0);
  const totalM2 = datos.reduce((a, d) => a + d.faltanM2, 0);
  const totalPrecio = datos.reduce((a, d) => a + d.faltanPrecio, 0);
  const totalRecuperados = datos.reduce((a, d) => a + d.preciosRecuperados, 0);
  const incompletos = datos.filter((d) => d.incompleto).map((d) => d.code);

  console.log(`\n✓ Machote generado: ${outPath}`);
  console.log(`  Hojas:               ${wb.worksheets.length} (INSTRUCCIONES + ${datos.length} proyectos)`);
  console.log(`  Lotes pre-llenados:  ${totalLotes}`);
  console.log(`  Falta superficie:    ${totalM2}`);
  console.log(`  Falta precio:        ${totalPrecio}`);
  console.log(`  Precios recuperados de contratos (pre-llenados en verde): ${totalRecuperados}`);
  console.log(`  Proyectos con inventario incompleto: ${incompletos.join(', ')}`);
  console.log(`  Filas en blanco por proyecto incompleto: ${FILAS_EN_BLANCO}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
