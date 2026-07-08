# Fix de mensualidad y regeneración de cuotas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir la mensualidad de los contratos a plazos (hoy calculada con el "monto más frecuente de los pagos", que se contamina con pagos de 2+ meses) para que sea `financiado ÷ plazo`, y regenerar el calendario de cuotas de los contratos con plazo confiable — reportando los que no tienen plazo en la fuente.

**Architecture:** (1) Un módulo puro nuevo `lib/installments.ts` con la matemática del calendario (testeable). (2) `migrate-project.ts` deja de usar `modaMensualidad` para el monto y usa el módulo (arregla migraciones futuras). (3) Un script de datos `fix-installment-schedules.ts` (dry-run por defecto) recomputa `installmentAmount` y regenera cuotas SOLO para contratos cuyo plazo viene de la hoja Códigos; los demás van a un CSV para revisión. (4) Se reconcilian pagos con el script existente y se valida.

**Tech Stack:** Node 24, TypeScript 5.5, Prisma 5 + PostgreSQL 16, xlsx. Tests: Vitest.

## Global Constraints

- **NO tocar `totalPrice` ni `balance`.** Están correctos (precio = Deuda Total del Directorio = Pagado + Balance; balance = totalPrice − pagos). Solo cambian `installmentAmount` y las filas de `Cuota`.
- **La suma del calendario debe ser exacta:** `sum(montoEsperado de las cuotas) === financiado` (financiado = `totalPrice − downPayment`). La última cuota absorbe el redondeo.
- **Redondeo a 2 decimales** en todos los montos: `round2(n) = Math.round(n*100)/100`.
- **Plazo autoritativo = hoja "Códigos", columna "PLAZO (AÑOS)".** Si está vacío, el contrato NO se toca (va al reporte). Nunca inferir el plazo desde los pagos para el fix de datos.
- **Solo contratos `paymentPlanType='INSTALLMENTS'` y `status != 'CANCELED'`.** Los de contado (CASH) y cancelados se omiten.
- **Idempotente:** correr el script dos veces produce el mismo resultado.
- **Dry-run por defecto**; escribe solo con `--confirm`.
- Excel fuente: `/Users/miguelmachuca/CentralHub - Proyectos /Actualizaciones/2026-06-30/`.
- Todo el trabajo se commitea en la rama `fix/mensualidad-cuotas` (crear desde `main`).

---

### Task 1: Módulo puro `lib/installments.ts` — calendario de cuotas (TDD)

**Files:**
- Create: `src/scripts/lib/installments.ts`
- Test: `src/scripts/lib/__tests__/installments.test.ts`

**Interfaces:**
- Produces:
  - `round2(n: number): number`
  - `buildScheduleAmounts(financiado: number, plazoMeses: number): number[]` — devuelve `plazoMeses` montos; los primeros `plazoMeses-1` son `round2(financiado/plazoMeses)`, el último es `round2(financiado - base*(plazoMeses-1))` para que la suma sea exactamente `round2(financiado)`. Devuelve `[]` si `plazoMeses <= 0`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/scripts/lib/__tests__/installments.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { round2, buildScheduleAmounts } from '../installments';

const sum = (a: number[]) => round2(a.reduce((s, x) => s + x, 0));

describe('round2', () => {
  it('redondea a 2 decimales', () => {
    expect(round2(2304.283333)).toBe(2304.28);
    expect(round2(3916.666)).toBe(3916.67);
  });
});

describe('buildScheduleAmounts', () => {
  it('caso exacto: 480000 / 60 = 8000 cada una', () => {
    const a = buildScheduleAmounts(480000, 60);
    expect(a).toHaveLength(60);
    expect(a.every(x => x === 8000)).toBe(true);
    expect(sum(a)).toBe(480000);
  });

  it('con redondeo: la suma sigue siendo exacta (138257 / 60)', () => {
    const a = buildScheduleAmounts(138257, 60);
    expect(a).toHaveLength(60);
    expect(a[0]).toBe(2304.28);              // round2(138257/60)
    expect(sum(a)).toBe(138257);             // la última absorbe el resto
  });

  it('con redondeo: 235000 / 60', () => {
    const a = buildScheduleAmounts(235000, 60);
    expect(a[0]).toBe(3916.67);
    expect(sum(a)).toBe(235000);
  });

  it('plazo 0 → arreglo vacío', () => {
    expect(buildScheduleAmounts(100000, 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

```bash
cd /Users/miguelmachuca/centralhub
npx vitest run src/scripts/lib/__tests__/installments.test.ts
```

Expected: FALLA con `Cannot find module '../installments'`.

- [ ] **Step 3: Implementar el módulo**

Crear `src/scripts/lib/installments.ts`:

```ts
// Matemática pura del calendario de cuotas. Sin DB, sin Excel.

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
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

```bash
cd /Users/miguelmachuca/centralhub
npx vitest run src/scripts/lib/__tests__/installments.test.ts
```

Expected: PASS, 5 tests verdes.

- [ ] **Step 5: Commit**

```bash
cd /Users/miguelmachuca/centralhub
git add src/scripts/lib/installments.ts src/scripts/lib/__tests__/installments.test.ts
git commit -m "feat(installments): módulo puro de calendario de cuotas + tests"
```

---

### Task 2: Mover `parsePlazo` a la lib + lector de plazos por código (TDD)

**Files:**
- Modify: `src/scripts/lib/installments.ts` (agregar `parsePlazo` + `readPlazosByCodigo`)
- Modify: `src/scripts/migrate-project.ts` (importar `parsePlazo` desde la lib, eliminar la copia local)
- Test: `src/scripts/lib/__tests__/installments.test.ts` (agregar tests de `parsePlazo`)

**Interfaces:**
- Consumes: `round2` (Task 1).
- Produces:
  - `interface PlazoParsed { months: number | null; isContado: boolean; source: 'codigos' | 'contado' | 'inferido' }`
  - `parsePlazo(raw: string): PlazoParsed` (misma lógica que hoy en migrate-project.ts líneas 399-430)
  - `readPlazosByCodigo(excelPath: string): Map<string, PlazoParsed>` — abre el Excel, detecta la hoja de Códigos y la fila de headers, y devuelve un mapa `códigoUpper -> PlazoParsed` leyendo la columna "PLAZO".

- [ ] **Step 1: Agregar tests de `parsePlazo`**

Añadir al final de `src/scripts/lib/__tests__/installments.test.ts`:

```ts
import { parsePlazo } from '../installments';

describe('parsePlazo', () => {
  it('vacío → inferido (months null)', () => {
    expect(parsePlazo('')).toEqual({ months: null, isContado: false, source: 'inferido' });
  });
  it('"DE CONTADO" → contado', () => {
    expect(parsePlazo('DE CONTADO')).toEqual({ months: 0, isContado: true, source: 'contado' });
  });
  it('"5" → 60 meses (años)', () => {
    expect(parsePlazo('5')).toEqual({ months: 60, isContado: false, source: 'codigos' });
  });
  it('"4a-2m" → 50 meses', () => {
    expect(parsePlazo('4a-2m')).toEqual({ months: 50, isContado: false, source: 'codigos' });
  });
  it('"4a" → 48 meses', () => {
    expect(parsePlazo('4a')).toEqual({ months: 48, isContado: false, source: 'codigos' });
  });
});
```

- [ ] **Step 2: Correr y confirmar que fallan**

```bash
cd /Users/miguelmachuca/centralhub
npx vitest run src/scripts/lib/__tests__/installments.test.ts
```

Expected: FALLA (`parsePlazo` no exportado en la lib).

- [ ] **Step 3: Agregar `parsePlazo` + `readPlazosByCodigo` a la lib**

Añadir a `src/scripts/lib/installments.ts` (arriba `import * as XLSX from 'xlsx'` al inicio del archivo):

```ts
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
```

- [ ] **Step 4: Eliminar la copia local en migrate-project.ts e importar de la lib**

En `src/scripts/migrate-project.ts`:
1. Agregar al bloque de imports del inicio:
```ts
import { parsePlazo } from './lib/installments';
```
2. Borrar la definición local `function parsePlazo(...) { ... }` (líneas ~399-430) y la interfaz local `interface PlazoParsed` (líneas ~385-389). Mantener `PLAZO_FALLBACK` y `PLAZO_OPCIONES` si otras funciones los usan (revisar; `inferirPlazo` usa `PLAZO_FALLBACK`).

- [ ] **Step 5: Correr tests + verificar compilación**

```bash
cd /Users/miguelmachuca/centralhub
npx vitest run src/scripts/lib/__tests__/installments.test.ts
npx tsc --noEmit 2>&1 | grep -i "migrate-project\|installments" || echo "tsc OK"
```

Expected: 10 tests verdes; sin errores nuevos de tsc.

- [ ] **Step 6: Commit**

```bash
cd /Users/miguelmachuca/centralhub
git add src/scripts/lib/installments.ts src/scripts/lib/__tests__/installments.test.ts src/scripts/migrate-project.ts
git commit -m "refactor(installments): mover parsePlazo a la lib + lector de plazos por código"
```

---

### Task 3: Corregir migrate-project.ts (mensualidad = financiado/plazo; migraciones futuras)

**Files:**
- Modify: `src/scripts/migrate-project.ts` (bloque de cálculo mensualidad/plazo ~655-686; call site de `generarCuotas` ~1042; `installmentAmount` ~990; función `generarCuotas` ~788-817)

**Interfaces:**
- Consumes: `buildScheduleAmounts` (Task 1), `parsePlazo` (Task 2).

- [ ] **Step 1: Importar buildScheduleAmounts**

En `src/scripts/migrate-project.ts`, ampliar el import de la lib:
```ts
import { parsePlazo, buildScheduleAmounts } from './lib/installments';
```

- [ ] **Step 2: Calcular plazo ANTES de la mensualidad y derivar la mensualidad**

Reemplazar el bloque actual (líneas ~668-686, desde `// mensualidad = monto más frecuente...` hasta el cierre del `if/else` de plazo) por:

```ts
    // ── PLAZO primero (autoritativo desde Códigos) ──
    const plazoCodigos = parsePlazo(cod.plazoRaw);
    const financiado   = precioTotal - enganche;
    let plazoMeses: number;
    let plazoSource: SheetRow['plazoSource'];
    const isContado = plazoCodigos.isContado;
    if (plazoCodigos.isContado) {
      plazoMeses  = 0;
      plazoSource = 'contado';
    } else if (plazoCodigos.months != null) {
      plazoMeses  = plazoCodigos.months;
      plazoSource = 'codigos';
    } else {
      plazoMeses  = PLAZO_FALLBACK;      // sin PLAZO en Códigos → fallback (se reporta en revisión humana)
      plazoSource = 'inferido';
    }

    // ── MENSUALIDAD derivada: financiado / plazo (la última cuota absorbe redondeo) ──
    const mensualidad = plazoMeses > 0 ? buildScheduleAmounts(financiado, plazoMeses)[0] : 0;
```

Nota: se elimina el uso de `modaMensualidad` y de `inferirPlazo` para el cálculo. Las funciones pueden quedar sin usar; si `tsc`/lint marca "declared but never used", borrarlas (`modaMensualidad` ~631-640, `inferirPlazo` ~642-646).

- [ ] **Step 3: Generar las cuotas con el reparto exacto**

Reemplazar la función `generarCuotas` (líneas ~788-817) por una que use `buildScheduleAmounts`:

```ts
async function generarCuotas(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  contractId: string,
  financiado: number,
  plazoMeses: number,
  fechaInicio: Date,
  logger: MigrationLogger,
  rowIdx: number
): Promise<number> {
  const amounts = buildScheduleAmounts(financiado, plazoMeses);
  const cuotasData = amounts.map((monto, i) => {
    const fechaVencimiento = new Date(fechaInicio);
    fechaVencimiento.setMonth(fechaVencimiento.getMonth() + i + 1);
    return {
      contractId,
      numeroCuota: i + 1,
      mes: formatSpanishMonth(fechaVencimiento),
      montoEsperado: monto,
      montoPagado: 0,
      fechaVencimiento,
      status: CuotaStatus.PENDIENTE,
    };
  });
  await tx.cuota.createMany({ data: cuotasData });
  logger.info(`  → ${cuotasData.length} cuotas generadas para contrato ${contractId}`);
  return cuotasData.length;
}
```

- [ ] **Step 4: Actualizar el call site de generarCuotas**

En la línea ~1042-1047, cambiar el 3er argumento de `row.mensualidad` a `financiado`. El call site quedaba:
```ts
            const cuotasCount = await generarCuotas(
              tx,
              contract.id,
              row.mensualidad,
              row.plazoMeses,
              fechaInicio,
              ...
```
Debe quedar (financiado = precioTotal − enganche del row):
```ts
            const cuotasCount = await generarCuotas(
              tx,
              contract.id,
              row.precioTotal - row.enganche,
              row.plazoMeses,
              fechaInicio,
              ...
```

- [ ] **Step 5: Verificar compilación + tests backend**

```bash
cd /Users/miguelmachuca/centralhub
npx tsc --noEmit 2>&1 | grep -i "migrate-project" || echo "tsc OK"
npx vitest run 2>&1 | tail -4
```

Expected: sin errores de tsc en migrate-project; suite backend verde.

- [ ] **Step 6: Commit**

```bash
cd /Users/miguelmachuca/centralhub
git add src/scripts/migrate-project.ts
git commit -m "fix(migrate): mensualidad = financiado/plazo (no el modo de pagos)"
```

---

### Task 4: Script de regeneración de cuotas `fix-installment-schedules.ts`

**Files:**
- Create: `src/scripts/fix-installment-schedules.ts`

**Interfaces:**
- Consumes: `buildScheduleAmounts` (Task 1), `readPlazosByCodigo`, `PlazoParsed` (Task 2).
- CLI: dry-run por defecto; `--confirm` escribe. Genera `logs/fix-schedules-sin-plazo.csv`.

- [ ] **Step 1: Crear el script**

Crear `src/scripts/fix-installment-schedules.ts`:

```ts
/**
 * fix-installment-schedules.ts
 * Recomputa installmentAmount = financiado/plazo y regenera las cuotas de los
 * contratos a plazos cuyo plazo viene de la hoja Códigos. Los contratos SIN
 * plazo en la fuente se OMITEN y se listan en logs/fix-schedules-sin-plazo.csv.
 *
 * NO toca totalPrice ni balance. Deja las cuotas nuevas en PENDIENTE
 * (la reconciliación de pagos se corre aparte con apply-payments-to-cuotas.ts).
 *
 * Uso:
 *   npx tsx src/scripts/fix-installment-schedules.ts            # dry-run
 *   npx tsx src/scripts/fix-installment-schedules.ts --confirm  # escribe
 */
import { PrismaClient, ContractStatus, CuotaStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { buildScheduleAmounts, readPlazosByCodigo, PlazoParsed } from './lib/installments';

const prisma = new PrismaClient();
const BASE = '/Users/miguelmachuca/CentralHub - Proyectos /Actualizaciones/2026-06-30/';
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const mesLabel = (d: Date) => `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;

// Mapa code de proyecto → archivo Excel fuente
const FILE_BY_CODE: Record<string, string> = {
  BET: 'SISTEMA BETANIA.xlsx', MDS: 'SISTEMA Magnolia del Sur.xlsx',
  MON1: 'SISTEMA MONARCA.xlsx', MON2: 'SISTEMA MONARCA II.xlsx',
  PDS: 'SISTEMA PUERTA DEL SOL.xlsx', SAN: 'SISTEMA SANTANDER.xlsx',
  VDB: 'SISTEMA Valle de Bugambilias .xlsx', VDR: 'VALLE DEL ROBLE.xlsx',
  JSA1: 'JSA 1.xlsx', JSA2: 'JSA 2.xlsx', JSA3: 'JSA 3.xlsx', JSA4: 'JSA 4.xlsx',
};

async function main() {
  const confirm = process.argv.includes('--confirm');
  const projects = await prisma.project.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } });

  let fixed = 0, skippedNoPlazo = 0, unchanged = 0;
  const sinPlazo: string[] = ['proyecto,codigo,cliente,totalPrice,financiado,installmentAmount_actual'];

  for (const proj of projects) {
    const file = proj.code ? FILE_BY_CODE[proj.code] : undefined;
    if (!file) continue;
    let plazos: Map<string, PlazoParsed>;
    try { plazos = readPlazosByCodigo(BASE + file); }
    catch (e) { console.log(`${proj.code}: no se pudo leer plazos (${(e as Error).message}) — omitido`); continue; }

    const contratos = await prisma.contract.findMany({
      where: { projectId: proj.id, status: { not: ContractStatus.CANCELED }, paymentPlanType: 'INSTALLMENTS' },
      select: { id: true, codigoLegado: true, totalPrice: true, downPayment: true, installmentAmount: true, installmentCount: true, startDate: true, contractDate: true,
        client: { select: { firstName: true, lastName: true } } },
    });

    for (const c of contratos) {
      const cod = (c.codigoLegado ?? '').toUpperCase();
      const plazo = plazos.get(cod);
      const financiado = (c.totalPrice ?? 0) - (c.downPayment ?? 0);

      // Sin plazo confiable → reportar y omitir
      if (!plazo || plazo.months == null || plazo.months <= 0) {
        skippedNoPlazo++;
        sinPlazo.push(`${proj.code},${cod},"${c.client?.firstName ?? ''} ${c.client?.lastName ?? ''}",${c.totalPrice},${financiado},${c.installmentAmount}`);
        continue;
      }

      const plazoMeses = plazo.months;
      const amounts = buildScheduleAmounts(financiado, plazoMeses);
      const nuevaMensualidad = amounts[0];

      // ¿ya está bien? (mismo plazo y misma mensualidad base)
      if (c.installmentCount === plazoMeses && Math.abs((c.installmentAmount ?? 0) - nuevaMensualidad) < 0.01) {
        unchanged++;
        continue;
      }

      fixed++;
      console.log(`  ${proj.code}/${cod}: ${c.installmentCount}×${c.installmentAmount} → ${plazoMeses}×${nuevaMensualidad} (financiado ${financiado})`);

      if (!confirm) continue;

      const fechaInicio = c.startDate ?? c.contractDate ?? new Date(0);
      await prisma.$transaction(async (tx) => {
        await tx.cuota.deleteMany({ where: { contractId: c.id } });
        const cuotasData = amounts.map((monto, i) => {
          const fv = new Date(fechaInicio);
          fv.setMonth(fv.getMonth() + i + 1);
          return { contractId: c.id, numeroCuota: i + 1, mes: mesLabel(fv), montoEsperado: monto, montoPagado: 0, fechaVencimiento: fv, status: CuotaStatus.PENDIENTE };
        });
        await tx.cuota.createMany({ data: cuotasData });
        await tx.contract.update({ where: { id: c.id }, data: { installmentAmount: nuevaMensualidad, installmentCount: plazoMeses } });
      }, { timeout: 60000 });
    }
  }

  // Escribir CSV de sin-plazo
  const csvPath = path.join(process.cwd(), 'logs', 'fix-schedules-sin-plazo.csv');
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, sinPlazo.join('\n'), 'utf8');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Modo: ${confirm ? 'ESCRITURA (--confirm)' : 'DRY-RUN'}`);
  console.log(`Contratos corregidos     : ${fixed}`);
  console.log(`Ya estaban bien          : ${unchanged}`);
  console.log(`Sin plazo (omitidos)     : ${skippedNoPlazo}  → ${csvPath}`);
  console.log('='.repeat(60));
  if (confirm) console.log('\n⚠ Cuotas regeneradas en PENDIENTE. Corre apply-payments-to-cuotas.ts para reconciliar.');

  await prisma.$disconnect();
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
```

- [ ] **Step 2: Verificar compilación + dry-run**

```bash
cd /Users/miguelmachuca/centralhub
npx tsc --noEmit 2>&1 | grep -i "fix-installment" || echo "tsc OK"
npx tsx src/scripts/fix-installment-schedules.ts 2>&1 | tail -20
```

Expected: sin errores de tsc. El dry-run reporta ~751 corregidos, ~245 sin plazo (PDS+SAN mayoría), genera el CSV. Verificar que `MON1/F096` aparece con `60×16000 → 60×8000`.

- [ ] **Step 3: Commit**

```bash
cd /Users/miguelmachuca/centralhub
git add src/scripts/fix-installment-schedules.ts
git commit -m "feat(scripts): fix-installment-schedules — regenera cuotas con mensualidad correcta"
```

---

### Task 5: Ejecución + validación

**Files:** Sin cambios de código. Backup + corridas + validación.

- [ ] **Step 1: Backup fresco de la BD**

```bash
cd /Users/miguelmachuca/centralhub
URL=$(grep '^DATABASE_URL' .env | sed 's/^DATABASE_URL=//; s/^"//; s/"$//; s/?schema=public//')
pg_dump "$URL" -Fc -f "backups/centralhub-pre-mensualidad-fix-2026-07-07.dump"
ls -la backups/centralhub-pre-mensualidad-fix-2026-07-07.dump
```

Expected: archivo `.dump` creado (varios MB).

- [ ] **Step 2: Correr el fix en modo escritura**

```bash
cd /Users/miguelmachuca/centralhub
npx tsx src/scripts/fix-installment-schedules.ts --confirm 2>&1 | tail -12
```

Expected: "Contratos corregidos: ~751", cuotas regeneradas.

- [ ] **Step 3: Reconciliar pagos (todos los proyectos)**

```bash
cd /Users/miguelmachuca/centralhub
npx tsx src/scripts/apply-payments-to-cuotas.ts 2>&1 | tail -6
```

Expected: cuotas PAGADAS re-marcadas.

- [ ] **Step 4: Validar (script inline)**

```bash
cd /Users/miguelmachuca/centralhub
cat > .tmp-val.ts <<'EOF'
import { PrismaClient, ContractStatus, PaymentStatus } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  // 1) schedules cuadran
  const cs = await p.contract.findMany({ where: { status: { not: ContractStatus.CANCELED }, paymentPlanType: 'INSTALLMENTS' },
    select: { id: true, codigoLegado: true, totalPrice: true, downPayment: true, installmentCount: true, installmentAmount: true } });
  let bad = 0;
  for (const c of cs) {
    const fin = (c.totalPrice ?? 0) - (c.downPayment ?? 0);
    const sched = (c.installmentCount ?? 0) * (c.installmentAmount ?? 0);
    if (Math.abs(sched - fin) > (c.installmentAmount ?? 0) + 1) bad++;
  }
  console.log(`Schedules que NO cuadran: ${bad} (antes 751)`);

  // 2) balances sin cambios
  const pays = await p.payment.groupBy({ by: ['contractId'], where: { status: PaymentStatus.CONFIRMED }, _sum: { amount: true } });
  const paid = new Map(pays.map(r => [r.contractId, r._sum.amount ?? 0]));
  const all = await p.contract.findMany({ where: { status: { not: ContractStatus.CANCELED } }, select: { id: true, totalPrice: true, balance: true } });
  let balBad = 0;
  for (const c of all) { const exp = Math.round(((c.totalPrice??0) - (paid.get(c.id) ?? 0))*100)/100; if (Math.abs(exp - Math.round((c.balance??0)*100)/100) > 1) balBad++; }
  console.log(`Balances inconsistentes: ${balBad} (debe ser 0)`);

  // 3) Arturo F096
  const proj = await p.project.findFirst({ where: { code: 'MON1' } });
  const f = await p.contract.findFirst({ where: { projectId: proj!.id, codigoLegado: 'F096' }, select: { installmentAmount: true, installmentCount: true, balance: true } });
  const pag = await p.cuota.count({ where: { contract: { codigoLegado: 'F096', projectId: proj!.id }, montoPagado: { gt: 0 } } });
  console.log(`F096: mensualidad=${f!.installmentAmount} plazo=${f!.installmentCount} balance=${f!.balance} | cuotas con pago=${pag}`);
  await p.$disconnect();
})();
EOF
npx tsx .tmp-val.ts; rm -f .tmp-val.ts
```

Expected:
- Schedules que NO cuadran: **0** (los con plazo confiable; los ~245 sin plazo quedan como estaban).
- Balances inconsistentes: **0**.
- F096: **mensualidad=8000**, plazo=60, balance=404000, cuotas con pago ≈ 5.

- [ ] **Step 5: Reporte final al usuario**

Reportar: cuántos contratos corregidos, que Arturo ahora muestra $8,000, y el CSV `logs/fix-schedules-sin-plazo.csv` con los ~245 contratos (PDS+SAN) que necesitan que el usuario provea el plazo real. NO se tocaron esos.

---

## Criterios de aceptación

1. [ ] `npx vitest run` verde (installments 10 tests + backend 89).
2. [ ] Los contratos a plazos con plazo en Códigos tienen `installmentCount × installmentAmount ≈ financiado` (0 que no cuadran).
3. [ ] `balance` y `totalPrice` sin cambios (0 inconsistencias).
4. [ ] F096 (Arturo) muestra mensualidad **$8,000** y sus cuotas pagadas reconciliadas.
5. [ ] CSV `logs/fix-schedules-sin-plazo.csv` generado con los contratos sin plazo (PDS+SAN) para revisión.
6. [ ] `migrate-project.ts` corregido: una re-migración futura ya no reintroduce el bug.
