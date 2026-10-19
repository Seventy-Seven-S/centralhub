// Carga el inventario faltante desde "LOTES TOTALES .xlsx", el archivo que
// lleva el arquitecto con una hoja por proyecto.
//
// En la migración original solo entraron los lotes VENDIDOS. El inventario sin
// vender nunca se cargó, así que la tarjeta del proyecto muestra vendido al
// 100% cuando en realidad quedan lotes libres: Puerta del Sol tiene 62 lotes en
// la app y 733 en el archivo.
//
// Dos reglas, porque el riesgo es distinto:
//   - NO modifica ni borra ningún lote existente. Solo reporta diferencias.
//   - NO crea un lote marcado VENDIDO. Un lote vendido sin contrato es peor
//     que un lote ausente: aparecería como venta sin cliente ni pagos. Se
//     reportan para que una persona los revise.
//
//   npx tsx src/scripts/_historico/cargar-lotes-totales.ts                      (dry-run, todos)
//   npx tsx src/scripts/_historico/cargar-lotes-totales.ts "Puerta del Sol"
//   npx tsx src/scripts/_historico/cargar-lotes-totales.ts "Puerta del Sol" --aplicar
//
// `--precios`: en vez de crear lotes, pone al día el PRECIO BASE de los que ya
// existen con el "precio inicial" del archivo. El valor del proyecto es la suma
// de esos precios, así que se deriva en vez de capturarse — misma razón por la
// que se quitó el campo `totalLots`.
import { PrismaClient, LotStatus } from '@prisma/client';
import { leerLotesTotales, HOJA_A_PROYECTO, LoteDelArchivo, partirLoteFusionado } from '../lib/lotesTotales';

const prisma = new PrismaClient();
const ARCHIVO = 'backups/LOTES TOTALES .xlsx';

// El archivo no trae metros cuadrados. Se deja en 0 en vez de inventar una
// superficie: un 0 se ve y se puede completar después; un número inventado no.
const SIN_SUPERFICIE = 0;

const pad = (s: unknown, n: number) => String(s).padEnd(n);


/**
 * Pone al día el precio base de los lotes que ya existen, con el precio inicial
 * del archivo. El precio base solo se muestra en la pantalla de Lotes, no entra
 * en ningún cálculo de cobro, así que es seguro alimentarlo desde aquí.
 */
async function ponerPreciosAlDia(
  proyectoId: string,
  nombre: string,
  lotes: LoteDelArchivo[],
  aplicar: boolean,
) {
  const enBase = await prisma.lot.findMany({
    where: { projectId: proyectoId },
    select: { id: true, manzana: true, lotNumber: true, basePrice: true },
  });
  const porClave = new Map(enBase.map(l => [`${l.manzana}|${l.lotNumber}`, l]));
  const porManzana = new Map<number, Set<string>>();
  for (const l of enBase) {
    if (!porManzana.has(l.manzana)) porManzana.set(l.manzana, new Set());
    porManzana.get(l.manzana)!.add(l.lotNumber);
  }

  const cambios: Array<{ id: string; de: number; a: number; ref: string }> = [];
  let sinPareo = 0;

  for (const l of lotes) {
    if (l.precio === null || l.precio <= 0) continue;

    const directo = porClave.get(`${l.manzana}|${l.lote}`);
    if (directo) {
      if (Math.abs(directo.basePrice - l.precio) >= 0.01) {
        cambios.push({ id: directo.id, de: directo.basePrice, a: l.precio, ref: `M${l.manzana}-L${l.lote}` });
      }
      continue;
    }

    // Par vendido como una sola unidad: el precio de la fila es el del par, así
    // que se reparte entre los dos lotes y el total del proyecto no cambia.
    const mitades = partirLoteFusionado(l.lote, porManzana.get(l.manzana) ?? new Set());
    if (mitades) {
      const mitad = Math.round((l.precio / 2) * 100) / 100;
      for (const m of mitades) {
        const lote = porClave.get(`${l.manzana}|${m}`)!;
        if (Math.abs(lote.basePrice - mitad) >= 0.01) {
          cambios.push({ id: lote.id, de: lote.basePrice, a: mitad, ref: `M${l.manzana}-L${m} (mitad de L${l.lote})` });
        }
      }
      continue;
    }
    sinPareo++;
  }

  console.log(`\n${nombre}`);
  console.log(`  precios por actualizar: ${cambios.length}${sinPareo ? ` | ${sinPareo} filas del archivo sin lote en la base` : ''}`);
  for (const c of cambios.slice(0, 5)) {
    console.log(`      ${c.ref}: $${c.de.toLocaleString('es-MX')} -> $${c.a.toLocaleString('es-MX')}`);
  }
  if (cambios.length > 5) console.log(`      … y ${cambios.length - 5} más`);

  if (aplicar) {
    for (const c of cambios) {
      await prisma.lot.update({ where: { id: c.id }, data: { basePrice: c.a } });
    }
    if (cambios.length) console.log(`  ✓ actualizados ${cambios.length}`);
  }
  return cambios.length;
}

async function main() {
  const args = process.argv.slice(2);
  const aplicar = args.includes('--aplicar');
  const modoPrecios = args.includes('--precios');
  const soloProyectos = args.filter(a => !a.startsWith('--'));

  console.log(aplicar ? '=== APLICANDO ===' : '=== DRY-RUN (nada se escribe) ===');
  if (modoPrecios) console.log('(modo precios: no se crean lotes, se pone al día el precio base)');

  const delArchivo = leerLotesTotales(ARCHIVO);
  const porHoja = new Map<string, LoteDelArchivo[]>();
  for (const l of delArchivo) {
    if (!porHoja.has(l.hoja)) porHoja.set(l.hoja, []);
    porHoja.get(l.hoja)!.push(l);
  }

  let totalCreados = 0, totalVentasSinContrato = 0, totalDesconocidos = 0, totalDiferencias = 0, totalPrecios = 0;

  for (const [hoja, lotes] of porHoja) {
    const nombre = HOJA_A_PROYECTO[hoja];
    if (!nombre) { console.log(`\n! hoja "${hoja}" no está mapeada a ningún proyecto — se omite`); continue; }
    if (soloProyectos.length && !soloProyectos.includes(nombre)) continue;

    const proyecto = await prisma.project.findFirst({ where: { name: nombre }, select: { id: true } });
    if (!proyecto) { console.log(`\n! proyecto "${nombre}" no existe en la base — se omite`); continue; }

    if (modoPrecios) {
      totalPrecios += await ponerPreciosAlDia(proyecto.id, nombre, lotes, aplicar);
      continue;
    }

    const enBase = await prisma.lot.findMany({
      where: { projectId: proyecto.id },
      select: { manzana: true, lotNumber: true, status: true },
    });
    const clave = (m: number | string, l: string) => `${m}|${l}`;
    const existentes = new Map(enBase.map(l => [clave(l.manzana, l.lotNumber), l.status]));

    const aCrear: LoteDelArchivo[] = [];
    const ventasSinContrato: LoteDelArchivo[] = [];
    const desconocidos: LoteDelArchivo[] = [];
    const diferencias: Array<{ l: LoteDelArchivo; enBase: LotStatus }> = [];

    for (const l of lotes) {
      const yaEsta = existentes.get(clave(l.manzana, l.lote));
      if (yaEsta !== undefined) {
        if (l.estado && l.estado !== yaEsta) diferencias.push({ l, enBase: yaEsta });
        continue;
      }
      if (l.estado === null) { desconocidos.push(l); continue; }
      if (l.estado === 'SOLD') { ventasSinContrato.push(l); continue; }
      aCrear.push(l);
    }

    console.log(`\n${nombre}  (hoja "${hoja}")`);
    console.log(`  archivo ${lotes.length} lotes | base ${enBase.length} | por crear ${aCrear.length}`);
    if (ventasSinContrato.length) {
      console.log(`  ⚠️  ${ventasSinContrato.length} marcados VENDIDO que no están en la base — NO se crean, necesitan contrato:`);
      for (const l of ventasSinContrato.slice(0, 10)) {
        console.log(`        M${l.manzana}-L${l.lote} | código ${l.codigoCliente ?? '—'} | ${l.cliente ?? '—'}`);
      }
      if (ventasSinContrato.length > 10) console.log(`        … y ${ventasSinContrato.length - 10} más`);
    }
    if (desconocidos.length) {
      const cuales = [...new Set(desconocidos.map(d => d.estatusTexto))].join(', ');
      console.log(`  ⚠️  ${desconocidos.length} con un estatus que no se reconoce (${cuales}) — no se crean`);
    }
    if (diferencias.length) {
      console.log(`  ℹ️  ${diferencias.length} ya existen con otro estado — no se tocan:`);
      const resumen: Record<string, number> = {};
      for (const d of diferencias) {
        const k = `${d.enBase} en la base / ${d.l.estatusTexto} en el archivo`;
        resumen[k] = (resumen[k] ?? 0) + 1;
      }
      for (const [k, v] of Object.entries(resumen)) console.log(`        ${pad(v, 5)} ${k}`);
    }

    totalCreados += aCrear.length;
    totalVentasSinContrato += ventasSinContrato.length;
    totalDesconocidos += desconocidos.length;
    totalDiferencias += diferencias.length;

    if (aplicar && aCrear.length) {
      await prisma.lot.createMany({
        data: aCrear.map(l => ({
          projectId: proyecto.id,
          manzana: l.manzana,
          lotNumber: l.lote,
          areaM2: SIN_SUPERFICIE,
          basePrice: l.precio ?? 0,
          currentPrice: l.precio ?? 0,
          status: LotStatus[l.estado as keyof typeof LotStatus],
        })),
        skipDuplicates: true,
      });
      console.log(`  ✓ creados ${aCrear.length}`);
    }
  }

  if (modoPrecios) {
    console.log(`\n${aplicar ? 'Precios actualizados' : 'Precios por actualizar'}: ${totalPrecios}`);
    if (!aplicar) console.log('(dry-run: vuelve a correr con --aplicar para escribir)');
    await prisma.$disconnect();
    return;
  }

  console.log(`\n${aplicar ? 'Creados' : 'Por crear'}: ${totalCreados} | ventas sin contrato: ${totalVentasSinContrato} | estatus desconocido: ${totalDesconocidos} | diferencias de estado: ${totalDiferencias}`);
  if (!aplicar) console.log('(dry-run: vuelve a correr con --aplicar para escribir)');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
