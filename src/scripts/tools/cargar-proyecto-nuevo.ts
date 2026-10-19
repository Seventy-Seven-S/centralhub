// Da de alta un proyecto nuevo con todo su inventario de lotes, desde un Excel.
//
// Es el caso de un fraccionamiento virgen: lotes con su superficie y su precio,
// ningún cliente y ninguna venta. Todos entran DISPONIBLES — un importador que
// pudiera marcar lotes como vendidos sin contrato crearía ventas sin cliente ni
// pagos, que es justo lo que el cargador de inventario se niega a hacer.
//
// El valor del proyecto NO se captura: sale de sumar el precio de estos lotes.
//
//   npx tsx src/scripts/tools/cargar-proyecto-nuevo.ts \
//     --archivo "backups/LOS CISNES.xlsx" --hoja "Base de Lotes" \
//     --nombre "Los Cisnes" --codigo LCS \
//     --ubicacion "Matamoros, Tamaulipas" --ciudad Matamoros --estado Tamaulipas
//
//   ... --aplicar     para escribir
import { PrismaClient, LotStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import { leerLotesDeHoja } from '../lib/lotesProyectoNuevo';
import { round2 } from '../../utils/money';

const prisma = new PrismaClient();

const arg = (nombre: string) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const pesos = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const archivo = arg('archivo');
  const hoja = arg('hoja');
  const nombre = arg('nombre');
  const codigo = arg('codigo')?.toUpperCase();
  const ubicacion = arg('ubicacion') ?? 'Por definir';
  const ciudad = arg('ciudad') ?? 'Por definir';
  const estado = arg('estado') ?? 'Por definir';

  if (!archivo || !hoja || !nombre || !codigo) {
    throw new Error('Faltan datos: --archivo, --hoja, --nombre y --codigo son obligatorios');
  }

  console.log(aplicar ? '=== APLICANDO ===' : '=== DRY-RUN (nada se escribe) ===');

  // Un código repetido pisaría otro proyecto. Se para antes de leer nada.
  const yaExisteCodigo = await prisma.project.findUnique({ where: { code: codigo } });
  if (yaExisteCodigo) throw new Error(`Ya existe un proyecto con el código ${codigo}: "${yaExisteCodigo.name}"`);
  const yaExisteNombre = await prisma.project.findFirst({ where: { name: nombre } });
  if (yaExisteNombre) throw new Error(`Ya existe un proyecto llamado "${nombre}" (código ${yaExisteNombre.code})`);

  const wb = XLSX.readFile(archivo);
  const ws = wb.Sheets[hoja];
  if (!ws) throw new Error(`El archivo no tiene una hoja "${hoja}". Tiene: ${wb.SheetNames.join(', ')}`);

  const { lotes, descartadas, repetidos } = leerLotesDeHoja(
    XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][],
  );

  if (repetidos.length) {
    throw new Error(
      `La hoja trae ${repetidos.length} lote(s) repetido(s): ${repetidos.slice(0, 10).join(', ')}` +
      `${repetidos.length > 10 ? '…' : ''}. Duplicar inventario infla el valor del proyecto — corrige el archivo primero.`,
    );
  }
  if (lotes.length === 0) throw new Error('No se encontró ningún lote en esa hoja');

  const conPrecio = lotes.filter(l => l.precio !== null && l.precio > 0);
  const conSuperficie = lotes.filter(l => l.superficie !== null && l.superficie > 0);
  const valor = round2(conPrecio.reduce((s, l) => s + l.precio!, 0));
  const manzanas = new Set(lotes.map(l => l.manzana));

  console.log(`\nProyecto: ${nombre} (${codigo})`);
  console.log(`  ${ubicacion} — ${ciudad}, ${estado}`);
  console.log(`\nHoja "${hoja}" del archivo ${archivo}`);
  console.log(`  lotes:        ${lotes.length} en ${manzanas.size} manzanas`);
  console.log(`  con precio:   ${conPrecio.length}/${lotes.length}`);
  console.log(`  con m²:       ${conSuperficie.length}/${lotes.length}`);
  console.log(`  descartadas:  ${descartadas} filas que no eran lotes (totales, vacías, encabezados)`);
  console.log(`  valor del proyecto: ${pesos(valor)}`);
  console.log(`\n  primeros 3:`);
  for (const l of lotes.slice(0, 3)) {
    console.log(`      M${l.manzana}-L${l.lote} | ${l.ubicacion ?? '—'} | ${l.superficie ?? '—'} m² | ${l.precio !== null ? pesos(l.precio) : '—'}`);
  }

  if (!aplicar) { console.log('\n(dry-run: vuelve a correr con --aplicar para escribir)'); await prisma.$disconnect(); return; }

  const proyecto = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: { code: codigo, name: nombre, location: ubicacion, city: ciudad, state: estado, status: 'ACTIVE' },
    });
    await tx.lot.createMany({
      data: lotes.map(l => ({
        projectId: p.id,
        manzana: l.manzana,
        lotNumber: l.lote,
        // La superficie es obligatoria en el modelo. Un 0 se ve y se puede
        // completar; un número inventado no.
        areaM2: l.superficie ?? 0,
        basePrice: l.precio ?? 0,
        currentPrice: l.precio ?? 0,
        status: LotStatus.AVAILABLE,
        features: l.ubicacion ? { ubicacion: l.ubicacion } : undefined,
      })),
    });
    return p;
  });

  const creados = await prisma.lot.count({ where: { projectId: proyecto.id } });
  console.log(`\n✓ Proyecto ${proyecto.name} (${proyecto.code}) creado con ${creados} lotes`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error('\n✗', e.message); await prisma.$disconnect(); process.exit(1); });
