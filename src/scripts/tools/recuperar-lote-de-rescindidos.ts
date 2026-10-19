// Recupera el lote de los contratos rescindidos/cancelados que lo perdieron.
//
// Hasta el 2026-09-25 la rescisión borraba la fila contract_lots (lo corrigió
// dcd2509), así que esos contratos quedaron sin decir qué lote compraron. El
// dato sobrevive en "LOTES TOTALES .xlsx": las columnas CODIGO + CLIENTE
// ANTERIOR de cada lote dicen quién lo tuvo antes. Ejemplo verificado: V037
// Jesús Martín Gómez Ibarra tenía M4-L36 de Valle del Roble.
//
// Qué hace:
//  - solo crea las filas contract_lots que faltan; NUNCA cambia el estado de un
//    lote (hoy puede estar vendido a otro cliente, disponible, etc. — eso lo
//    manda el inventario, no este historial);
//  - solo toca contratos CANCELED/RESCISSION sin ningún lote;
//  - por contrato es todo o nada: si una de sus filas no cuadra (otro proyecto,
//    otro nombre, lote inexistente, precios que no suman) no se escribe nada de
//    ese contrato y se reporta por qué.
//
// priceAtSale: con un lote es el precio total del contrato; con varios, los
// precios del archivo, solo si suman el total del contrato.
//
//   npx tsx src/scripts/tools/recuperar-lote-de-rescindidos.ts [ruta.xlsx]             (dry-run)
//   npx tsx src/scripts/tools/recuperar-lote-de-rescindidos.ts [ruta.xlsx] --confirm
import path from 'path';
import { PrismaClient, ContractStatus } from '@prisma/client';
import { leerClientesAnteriores, mismoCliente, type LoteDeClienteAnterior } from '../lib/clienteAnterior';
import { HOJA_A_PROYECTO, partirLoteFusionado } from '../lib/lotesTotales';

const prisma = new PrismaClient();
const confirmar = process.argv.includes('--confirm');
const RUTA = process.argv.slice(2).find(a => !a.startsWith('--'))
  ?? path.join(process.cwd(), 'backups', 'LOTES TOTALES .xlsx');
const $ = (n: number) => `$${n.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;

const RESCINDIDOS: ContractStatus[] = [ContractStatus.CANCELED, ContractStatus.RESCISSION];

interface Plan {
  contractId: string;
  codigo: string;
  cliente: string;
  proyecto: string;
  lotes: Array<{ lotId: string; etiqueta: string; priceAtSale: number; estadoActual: string; otroContrato: string | null }>;
}

async function main() {
  console.log(confirmar ? '=== ESCRIBIENDO (--confirm) ===\n' : '=== DRY-RUN (nada se escribe; usa --confirm) ===\n');
  console.log(`Archivo: ${RUTA}\n`);

  const delArchivo = leerClientesAnteriores(RUTA);
  const porCodigo = new Map<string, LoteDeClienteAnterior[]>();
  for (const f of delArchivo) porCodigo.set(f.codigo, [...(porCodigo.get(f.codigo) ?? []), f]);

  const sinLote = await prisma.contract.findMany({
    where: { status: { in: RESCINDIDOS }, lots: { none: {} } },
    select: {
      id: true, codigoLegado: true, contractNumber: true, status: true, totalPrice: true, projectId: true,
      project: { select: { name: true } },
      client: { select: { firstName: true, lastName: true } },
    },
    orderBy: { codigoLegado: 'asc' },
  });
  const totalRescindidos = await prisma.contract.count({ where: { status: { in: RESCINDIDOS } } });
  console.log(`Contratos rescindidos/cancelados: ${totalRescindidos} · sin lote: ${sinLote.length}`);
  console.log(`Filas del archivo con cliente anterior: ${delArchivo.length}\n`);

  const planes: Plan[] = [];
  const descartados: Array<{ codigo: string; motivo: string }> = [];

  for (const c of sinLote) {
    const codigo = c.codigoLegado ?? c.contractNumber;
    const cliente = `${c.client.firstName} ${c.client.lastName}`.trim();
    const filas = c.codigoLegado ? porCodigo.get(c.codigoLegado) ?? [] : [];
    const no = (motivo: string) => descartados.push({ codigo, motivo: `${cliente} (${c.project.name}) — ${motivo}` });

    if (filas.length === 0) { no('el archivo no lo menciona como cliente anterior'); continue; }

    const otroProyecto = filas.filter(f => HOJA_A_PROYECTO[f.hoja] !== c.project.name);
    if (otroProyecto.length) { no(`el archivo lo pone en otra hoja: ${otroProyecto.map(f => f.hoja.trim()).join(', ')}`); continue; }

    const otroNombre = filas.filter(f => !mismoCliente(f.clienteAnterior, cliente));
    if (otroNombre.length) { no(`el nombre del archivo no coincide: "${otroNombre[0].clienteAnterior.trim()}"`); continue; }

    // Los lotes del proyecto, para resolver los "1920" (dos lotes vendidos
    // como uno) igual que la carga de LOTES TOTALES.
    const lotesProyecto = await prisma.lot.findMany({
      where: { projectId: c.projectId },
      select: {
        id: true, manzana: true, lotNumber: true, status: true,
        contracts: {
          where: { contract: { status: { notIn: RESCINDIDOS } } },
          select: { contract: { select: { codigoLegado: true, contractNumber: true } } },
        },
      },
    });
    const porManzana = new Map<number, Map<string, (typeof lotesProyecto)[number]>>();
    for (const l of lotesProyecto) {
      if (!porManzana.has(l.manzana)) porManzana.set(l.manzana, new Map());
      porManzana.get(l.manzana)!.set(l.lotNumber, l);
    }

    const encontrados: Array<{ fila: LoteDeClienteAnterior; lote: (typeof lotesProyecto)[number] }> = [];
    let faltante: string | null = null;
    for (const f of filas) {
      const mz = porManzana.get(f.manzana) ?? new Map();
      const directo = mz.get(f.lote);
      const partes = directo ? null : partirLoteFusionado(f.lote, new Set(mz.keys()));
      const lotes = directo ? [directo] : partes ? partes.map(p => mz.get(p)!) : [];
      if (lotes.length === 0) { faltante = `M${f.manzana}-L${f.lote}`; break; }
      // Un "1920" son dos lotes con un solo precio en el archivo: el precio se
      // asigna a la pareja, así que cada mitad queda sin precio propio.
      for (const lote of lotes) encontrados.push({ fila: lotes.length > 1 ? { ...f, precio: null } : f, lote });
    }
    if (faltante) { no(`el lote ${faltante} no existe en la app`); continue; }

    const unicos = [...new Map(encontrados.map(e => [e.lote.id, e])).values()];
    let precios: number[];
    if (unicos.length === 1) {
      precios = [c.totalPrice];
    } else {
      const delArchivoPrecios = unicos.map(e => e.fila.precio);
      const suma = delArchivoPrecios.reduce<number>((a, p) => a + (p ?? 0), 0);
      if (delArchivoPrecios.some(p => p === null) || Math.abs(suma - c.totalPrice) > 1) {
        no(`${unicos.length} lotes y sus precios del archivo (${delArchivoPrecios.map(p => (p === null ? '—' : $(p))).join(' + ')}) no suman el total del contrato ${$(c.totalPrice)}`);
        continue;
      }
      precios = delArchivoPrecios as number[];
    }

    planes.push({
      contractId: c.id, codigo, cliente, proyecto: c.project.name,
      lotes: unicos.map((e, i) => {
        const otro = e.lote.contracts[0]?.contract;
        return {
          lotId: e.lote.id,
          etiqueta: `M${e.lote.manzana}-L${e.lote.lotNumber}`,
          priceAtSale: precios[i],
          estadoActual: e.lote.status,
          otroContrato: otro ? otro.codigoLegado ?? otro.contractNumber : null,
        };
      }),
    });
  }

  console.log(`── Se pueden recuperar: ${planes.length} contratos, ${planes.reduce((a, p) => a + p.lotes.length, 0)} lotes ──`);
  for (const p of planes) {
    const detalle = p.lotes.map(l =>
      `${l.etiqueta} ${$(l.priceAtSale)} [lote hoy: ${l.estadoActual}${l.otroContrato ? `, de ${l.otroContrato}` : ''}]`).join('; ');
    console.log(`  ${p.codigo.padEnd(5)} ${p.cliente} (${p.proyecto}) → ${detalle}`);
  }
  console.log(`\n── No se recuperan: ${descartados.length} ──`);
  for (const d of descartados) console.log(`  ${d.codigo.padEnd(5)} ${d.motivo}`);

  if (!confirmar) {
    console.log('\nDry-run: no se escribió nada. Vuelve a correr con --confirm para crear las filas contract_lots.');
    return;
  }

  let creadas = 0;
  for (const p of planes) {
    await prisma.$transaction(async tx => {
      // Se revisa de nuevo dentro de la transacción: si alguien le puso lote
      // al contrato entre la lectura y ahora, no se duplica.
      if (await tx.contractLot.count({ where: { contractId: p.contractId } })) {
        console.log(`  ${p.codigo}: ya tiene lote, se omite`);
        return;
      }
      for (const l of p.lotes) {
        await tx.contractLot.create({ data: { contractId: p.contractId, lotId: l.lotId, priceAtSale: l.priceAtSale } });
        creadas++;
      }
    });
  }
  console.log(`\nListo: ${creadas} filas contract_lots creadas. Ningún lote cambió de estado.`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
