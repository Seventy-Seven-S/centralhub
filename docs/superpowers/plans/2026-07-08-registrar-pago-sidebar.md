# Botón "Registrar pago" + sidebar limpio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botón global "Registrar pago" (mensualidad) con backend unificado (un solo servicio crea Payment + aplica cuotas + balance + mora), modal con recibo PDF, y sidebar reorganizado en secciones.

**Architecture:** La cascada de pago se extrae a un módulo puro compartido (`aplicarPagoACuotas`) usado por el nuevo servicio `registrarPagoMensualidad` (una transacción Prisma), por `payCuota` (que delega) y por el script de reconciliación. El frontend agrega `RegistrarPagoModal` (buscador de contrato → datos → PDF) abierto desde un botón en el sidebar, y el sidebar pasa a grupos OPERACIÓN/FINANZAS/SISTEMA.

**Tech Stack:** Backend Node 24 + TS + Express + Prisma 5 (tests Vitest). Frontend Next.js 16 + React Query + @react-pdf/renderer.

## Global Constraints

- Rama: `feat/registrar-pago-sidebar` (spec ya commiteado ahí).
- **Sin migraciones de schema.**
- El pago global es **solo Mensualidad** (`PaymentType.INSTALLMENT`).
- Transacción única: Payment + updates de cuotas + `balance: { decrement } ` + recálculo de mora (PENDIENTE con `fechaVencimiento < hoy` → `moraMonthsCount`, status IN_MORA/ACTIVE).
- Validaciones: contrato existe, `status !== 'CANCELED'`, `amount > 0`, tiene ≥1 cuota no PAGADA (si no: error "El contrato no tiene cuotas pendientes").
- El botón del sidebar solo para roles `ADMIN`/`MANAGER` (la API `POST /payments` es adminOrManager).
- Sidebar: grupos OPERACIÓN (Dashboard, Proyectos, Lotes, Contratos, Cuotas, Clientes) / FINANZAS (Gastos, Comisiones) / SISTEMA (Usuarios); "Nuevo Contrato" sale del menú y aparece como botón en la página de Contratos; un grupo sin ítems visibles no pinta su header.
- Comandos backend desde `/Users/miguelmachuca/centralhub`; frontend desde `/Users/miguelmachuca/centralhub/frontend`.

---

### Task 1: Módulo puro `pagoCuotas` (cascada) — TDD

**Files:**
- Create: `src/services/lib/pagoCuotas.ts`
- Test: `src/services/lib/__tests__/pagoCuotas.test.ts`

**Interfaces:**
- Produces:
  - `interface CuotaLike { id: string; montoEsperado: number; montoPagado: number; status: 'PENDIENTE' | 'PAGADA' }`
  - `interface CuotaUpdate { id: string; montoPagado: number; fechaPago: Date; status: 'PENDIENTE' | 'PAGADA' }`
  - `aplicarPagoACuotas(monto: number, fechaPago: Date, cuotas: CuotaLike[]): CuotaUpdate[]` — drena `monto` desde la primera cuota no PAGADA, respetando `montoPagado` previo; parcial queda PENDIENTE; si todas están PAGADA devuelve `[]`; si el monto excede, aplica hasta agotar cuotas.

- [ ] **Step 1: Test que falla** — crear `src/services/lib/__tests__/pagoCuotas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { aplicarPagoACuotas, CuotaLike } from '../pagoCuotas';

const F = new Date('2026-07-08');
const c = (id: string, esperado: number, pagado = 0, status: 'PENDIENTE' | 'PAGADA' = 'PENDIENTE'): CuotaLike =>
  ({ id, montoEsperado: esperado, montoPagado: pagado, status });

describe('aplicarPagoACuotas', () => {
  it('monto exacto paga una cuota', () => {
    const u = aplicarPagoACuotas(8000, F, [c('a', 8000), c('b', 8000)]);
    expect(u).toEqual([{ id: 'a', montoPagado: 8000, fechaPago: F, status: 'PAGADA' }]);
  });

  it('monto parcial deja la cuota PENDIENTE con acumulado', () => {
    const u = aplicarPagoACuotas(3000, F, [c('a', 8000)]);
    expect(u).toEqual([{ id: 'a', montoPagado: 3000, fechaPago: F, status: 'PENDIENTE' }]);
  });

  it('completa una cuota ya parcial y sigue con la siguiente', () => {
    const u = aplicarPagoACuotas(10000, F, [c('a', 8000, 6000), c('b', 8000)]);
    expect(u).toEqual([
      { id: 'a', montoPagado: 8000, fechaPago: F, status: 'PAGADA' },
      { id: 'b', montoPagado: 8000, fechaPago: F, status: 'PAGADA' },
    ]);
  });

  it('salta las PAGADA y empieza en la primera pendiente', () => {
    const u = aplicarPagoACuotas(8000, F, [c('a', 8000, 8000, 'PAGADA'), c('b', 8000)]);
    expect(u).toEqual([{ id: 'b', montoPagado: 8000, fechaPago: F, status: 'PAGADA' }]);
  });

  it('monto que excede todas las cuotas aplica hasta agotarlas', () => {
    const u = aplicarPagoACuotas(50000, F, [c('a', 8000), c('b', 8000)]);
    expect(u).toHaveLength(2);
    expect(u.every(x => x.status === 'PAGADA')).toBe(true);
  });

  it('todas PAGADA → []', () => {
    expect(aplicarPagoACuotas(8000, F, [c('a', 8000, 8000, 'PAGADA')])).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd /Users/miguelmachuca/centralhub && npx vitest run src/services/lib/__tests__/pagoCuotas.test.ts`
Expected: FAIL `Cannot find module '../pagoCuotas'`.

- [ ] **Step 3: Implementar** — crear `src/services/lib/pagoCuotas.ts`:

```ts
// Cascada de pago sobre cuotas — lógica PURA (sin Prisma).
// Única fuente de verdad; la usan payment.service, cuota.service y el script
// de reconciliación apply-payments-to-cuotas.

export interface CuotaLike {
  id: string;
  montoEsperado: number;
  montoPagado: number;
  status: 'PENDIENTE' | 'PAGADA';
}

export interface CuotaUpdate {
  id: string;
  montoPagado: number;
  fechaPago: Date;
  status: 'PENDIENTE' | 'PAGADA';
}

/**
 * Drena `monto` sobre las cuotas en orden, empezando en la primera no PAGADA
 * (respetando su montoPagado previo). La cuota que no alcanza a cerrarse queda
 * PENDIENTE con el acumulado. Si el monto excede todas, aplica hasta agotarlas.
 */
export function aplicarPagoACuotas(monto: number, fechaPago: Date, cuotas: CuotaLike[]): CuotaUpdate[] {
  const updates: CuotaUpdate[] = [];
  const startIdx = cuotas.findIndex(c => c.status !== 'PAGADA');
  if (startIdx === -1) return updates;

  let pool = monto;
  for (let i = startIdx; i < cuotas.length && pool > 0; i++) {
    const c = cuotas[i];
    const needed = c.montoEsperado - c.montoPagado;
    if (needed <= 0) continue;
    if (pool >= needed) {
      updates.push({ id: c.id, montoPagado: c.montoEsperado, fechaPago, status: 'PAGADA' });
      pool -= needed;
    } else {
      updates.push({ id: c.id, montoPagado: c.montoPagado + pool, fechaPago, status: 'PENDIENTE' });
      pool = 0;
    }
  }
  return updates;
}
```

- [ ] **Step 4: Correr y ver 6 verdes**

Run: `npx vitest run src/services/lib/__tests__/pagoCuotas.test.ts` → PASS 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/services/lib/pagoCuotas.ts src/services/lib/__tests__/pagoCuotas.test.ts
git commit -m "feat(pagos): cascada pura aplicarPagoACuotas + tests"
```

---

### Task 2: Servicio unificado `registrarPagoMensualidad` + `POST /payments` reparado

**Files:**
- Modify: `src/types/payment.types.ts` (agregar DTO)
- Modify: `src/services/payment.service.ts` (nuevo método; `createPayment` se elimina)
- Modify: `src/controllers/payment.controller.ts` (método `create`)

**Interfaces:**
- Consumes: `aplicarPagoACuotas`, `CuotaLike` (Task 1); `notificationService.createNotification` y `logger` (existentes, mismo uso que hoy en cuota.service).
- Produces: `paymentService.registrarPagoMensualidad(data: RegistrarPagoDto): Promise<{ payment: any; cuotasAfectadas: number[] }>` — `cuotasAfectadas` = números de cuota tocados, ascendente. Respuesta HTTP de `POST /payments`: `201 { success: true, data: { payment, cuotasAfectadas } }`; errores de negocio → `400 { success: false, message }`.

- [ ] **Step 1: DTO** — en `src/types/payment.types.ts`, después de `CreatePaymentDto` agregar:

```ts
export interface RegistrarPagoDto {
  contractId: string;
  amount: number;
  paymentDate: Date | string;
  paymentMethod: PaymentMethod;
  concept?: string;
  reference?: string;
  notes?: string;
}
```

- [ ] **Step 2: Servicio** — en `src/services/payment.service.ts`:

1. Ampliar imports:
```ts
import { PrismaClient, PaymentStatus, PaymentType, CuotaStatus, ContractStatus } from '@prisma/client';
import { CreatePaymentDto, RegistrarPagoDto, UpdatePaymentDto, PaymentFilters } from '../types/payment.types';
import { aplicarPagoACuotas } from './lib/pagoCuotas';
import notificationService from './notification.service';
import { logger } from '../utils/logger';
```
2. **Eliminar** el método `createPayment` completo (líneas ~8-73) y en su lugar:

```ts
  /**
   * Registra un pago de MENSUALIDAD de forma unificada:
   * Payment + cascada sobre cuotas + balance + mora, en UNA transacción.
   * Lo usan POST /payments y PATCH /cuotas/:id/pay.
   */
  async registrarPagoMensualidad(data: RegistrarPagoDto): Promise<{ payment: any; cuotasAfectadas: number[] }> {
    if (!data.amount || data.amount <= 0) throw new Error('El monto debe ser mayor a 0');

    const contract = await prisma.contract.findUnique({
      where: { id: data.contractId },
      include: { client: true, project: true },
    });
    if (!contract) throw new Error('Contrato no encontrado');
    if (contract.status === ContractStatus.CANCELED) throw new Error('El contrato está cancelado');

    const cuotas = await prisma.cuota.findMany({
      where: { contractId: data.contractId },
      orderBy: { numeroCuota: 'asc' },
    });
    const hayPendientes = cuotas.some(c => c.status !== CuotaStatus.PAGADA);
    if (!hayPendientes) throw new Error('El contrato no tiene cuotas pendientes');

    const fechaPago = data.paymentDate instanceof Date ? data.paymentDate : new Date(data.paymentDate);

    const updates = aplicarPagoACuotas(
      data.amount,
      fechaPago,
      cuotas.map(c => ({
        id: c.id,
        montoEsperado: c.montoEsperado,
        montoPagado: c.montoPagado ?? 0,
        status: c.status === CuotaStatus.PAGADA ? 'PAGADA' as const : 'PENDIENTE' as const,
      })),
    );
    const cuotasAfectadas = cuotas
      .filter(c => updates.some(u => u.id === c.id))
      .map(c => c.numeroCuota);

    const primera = cuotas.find(c => c.numeroCuota === cuotasAfectadas[0]);
    const concept = data.concept?.trim()
      || (cuotasAfectadas.length > 1
        ? `Mensualidades #${cuotasAfectadas[0]}–#${cuotasAfectadas[cuotasAfectadas.length - 1]}`
        : `Mensualidad #${cuotasAfectadas[0] ?? ''}${primera ? ` — ${primera.mes}` : ''}`);

    const paymentNumber = await this.generatePaymentNumber(contract.projectId);
    const newBalance = (contract.balance ?? 0) - data.amount;

    const created = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          paymentNumber,
          contractId: data.contractId,
          clientId: contract.clientId,
          paymentType: PaymentType.INSTALLMENT,
          paymentMethod: data.paymentMethod,
          amount: data.amount,
          paymentDate: fechaPago,
          concept,
          referenceNumber: data.reference,
          notes: data.notes,
          status: PaymentStatus.CONFIRMED,
          balanceAfter: newBalance,
        },
      });
      for (const u of updates) {
        await tx.cuota.update({
          where: { id: u.id },
          data: { montoPagado: u.montoPagado, fechaPago: u.fechaPago, status: u.status as CuotaStatus },
        });
      }
      await tx.contract.update({
        where: { id: data.contractId },
        data: { balance: { decrement: data.amount } },
      });
      const hoy = new Date();
      const vencidas = await tx.cuota.count({
        where: { contractId: data.contractId, status: CuotaStatus.PENDIENTE, fechaVencimiento: { lt: hoy } },
      });
      await tx.contract.update({
        where: { id: data.contractId },
        data: { moraMonthsCount: vencidas, status: vencidas > 0 ? ContractStatus.IN_MORA : ContractStatus.ACTIVE },
      });
      return p;
    });

    // Notificación in-app (fire-and-forget) — misma semántica que tenía payCuota.
    try {
      const cliente = `${contract.client?.firstName ?? ''} ${contract.client?.lastName ?? ''}`.trim() || 'cliente';
      await notificationService.createNotification({
        type: 'PAYMENT',
        message: `Pago registrado: ${data.amount} — ${cliente}`,
        relatedEntity: 'payment',
        relatedEntityId: created.id,
      });
    } catch (err) {
      logger.error(`Error creando notificación de pago ${created.id}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const payment = await this.getPaymentById(created.id);
    return { payment, cuotasAfectadas };
  }
```
Nota: `CreatePaymentDto` queda importado solo si otros métodos lo usan; si nada lo referencia tras el cambio, quitar el import de ese símbolo (dejar los demás).

- [ ] **Step 3: Controller** — en `src/controllers/payment.controller.ts`, reemplazar el cuerpo del método `create`:

```ts
  // POST /api/v1/payments — registra una mensualidad (servicio unificado)
  async create(req: Request, res: Response) {
    try {
      const result = await paymentService.registrarPagoMensualidad(req.body);
      res.status(201).json({ success: true, message: 'Pago registrado', data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message || 'Error al registrar pago' });
    }
  }
```

- [ ] **Step 4: Verificar** — `npx tsc --noEmit` sin errores nuevos en payment.*; `npx vitest run` suite verde.

- [ ] **Step 5: Commit**

```bash
git add src/types/payment.types.ts src/services/payment.service.ts src/controllers/payment.controller.ts
git commit -m "feat(pagos): registrarPagoMensualidad unificado + POST /payments reparado"
```

---

### Task 3: `payCuota` delega + script usa la cascada compartida

**Files:**
- Modify: `src/services/cuota.service.ts` (método `payCuota`, líneas 50-140)
- Modify: `src/scripts/apply-payments-to-cuotas.ts` (función `calcularUpdates`)

**Interfaces:**
- Consumes: `paymentService.registrarPagoMensualidad` (Task 2); `aplicarPagoACuotas`, `CuotaLike` (Task 1).
- Produces: `payCuota` conserva su firma y retorno (`Promise<Cuota|null>`); el script conserva la firma local `calcularUpdates(pagos, cuotas)` y su semántica recompute-desde-cero.

- [ ] **Step 1: payCuota delega** — en `src/services/cuota.service.ts`:

1. Agregar imports: `import paymentService from './payment.service';` y `import { PaymentMethod } from '@prisma/client';` (ampliando el import existente de @prisma/client). Quitar los imports de `notificationService`/`logger` **solo si** ya nada más los usa en el archivo.
2. Reemplazar el método `payCuota` completo (líneas 50-140) por:

```ts
  async payCuota(id: string, data: PayCuotaDto) {
    const cuota = await prisma.cuota.findUnique({ where: { id } });
    if (!cuota) throw new Error('Cuota no encontrada');
    if (cuota.status === CuotaStatus.PAGADA) throw new Error('La cuota ya fue pagada');

    // Delegar en el servicio unificado: crea el Payment (antes este flujo no lo
    // creaba y los pagos por-cuota no aparecían en el historial), aplica la
    // cascada, baja balance y recalcula mora. La notificación vive allá.
    await paymentService.registrarPagoMensualidad({
      contractId: cuota.contractId,
      amount: data.montoPagado,
      paymentDate: data.fechaPago ?? new Date(),
      paymentMethod: PaymentMethod.TRANSFER,
    });

    return prisma.cuota.findUnique({ where: { id } });
  }
```

- [ ] **Step 2: script comparte la cascada** — en `src/scripts/apply-payments-to-cuotas.ts`:

1. Agregar import: `import { aplicarPagoACuotas, CuotaLike } from '../services/lib/pagoCuotas';`
2. Reemplazar la función `calcularUpdates` (líneas 19-66) por un fold sobre la función compartida (misma semántica: recompute desde cero):

```ts
function calcularUpdates(
  pagos:  Array<{ id: string; amount: number; paymentDate: Date }>,
  cuotas: Array<{ id: string; montoEsperado: number; numeroCuota: number }>,
): CuotaUpdate[] {
  // Estado desde cero (el script SIEMPRE recalcula todo el contrato).
  const estado: Array<CuotaLike & { fechaPago: Date | null }> = cuotas.map(c => ({
    id: c.id, montoEsperado: c.montoEsperado, montoPagado: 0, status: 'PENDIENTE', fechaPago: null,
  }));

  for (const pago of pagos) {
    const updates = aplicarPagoACuotas(pago.amount, pago.paymentDate, estado);
    for (const u of updates) {
      const e = estado.find(x => x.id === u.id)!;
      e.montoPagado = u.montoPagado;
      e.status      = u.status;
      e.fechaPago   = u.fechaPago;
    }
  }

  return estado
    .filter(e => e.montoPagado > 0 && e.fechaPago)
    .map(e => ({
      id: e.id,
      montoPagado: e.montoPagado,
      fechaPago: e.fechaPago!,
      status: e.status === 'PAGADA' ? CuotaStatus.PAGADA : CuotaStatus.PENDIENTE,
    }));
}
```
(La interfaz local `CuotaUpdate` del script se conserva tal cual.)

- [ ] **Step 3: Verificar equivalencia del script (dry-run inocuo)** — el script no tiene dry-run, así que la verificación es: `npx tsc --noEmit` limpio + correr `npx tsx src/scripts/apply-payments-to-cuotas.ts --code BET` (proyecto chico ya reconciliado) y confirmar que reporta los mismos totales que la última corrida para BET (57 PAGADAS, 6 parciales — es idempotente: mismos números = misma semántica).

- [ ] **Step 4: Suite completa** — `npx vitest run` (todo verde, incluidos los 6 de pagoCuotas).

- [ ] **Step 5: Commit**

```bash
git add src/services/cuota.service.ts src/scripts/apply-payments-to-cuotas.ts
git commit -m "refactor(pagos): payCuota delega en el servicio unificado; script usa cascada compartida"
```

---

### Task 4: Sidebar en secciones + botón "+ Nuevo contrato" en Contratos

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx` (bloque `NAV_ITEMS` líneas 14-25 y el render del nav líneas 103-148)
- Modify: `frontend/src/app/(admin)/contratos/page.tsx` (header líneas ~160-165 e imports)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: sidebar con grupos; `/nuevo-contrato` accesible vía botón en Contratos.

- [ ] **Step 1: Grupos** — en `Sidebar.tsx`, reemplazar el arreglo `NAV_ITEMS` (líneas 14-25) por:

```ts
const NAV_GROUPS: Array<{ title: string; items: Array<{ label: string; href: string; icon: typeof LayoutDashboard }> }> = [
  {
    title: 'Operación',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Proyectos', href: '/proyectos', icon: Building2 },
      { label: 'Lotes',     href: '/lotes',     icon: Map },
      { label: 'Contratos', href: '/contratos', icon: FileText },
      { label: 'Cuotas',    href: '/cuotas',    icon: Calendar },
      { label: 'Clientes',  href: '/clientes',  icon: Users },
    ],
  },
  {
    title: 'Finanzas',
    items: [
      { label: 'Gastos',     href: '/gastos',     icon: Receipt },
      { label: 'Comisiones', href: '/comisiones', icon: DollarSign },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { label: 'Usuarios', href: '/usuarios', icon: UserCog },
    ],
  },
];
```
Quitar `FilePlus` del import de lucide-react (ya no se usa).

- [ ] **Step 2: Render por grupos** — reemplazar el contenido del `<nav>` (líneas 104-148) por:

```tsx
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {NAV_GROUPS.map(group => {
          const AGENT_HIDDEN = ['/dashboard', '/clientes', '/contratos', '/cuotas', '/gastos', '/comisiones'];
          const ADMIN_ONLY   = ['/usuarios'];
          const visibles = group.items.filter(item => {
            if (user?.role === 'AGENT' && AGENT_HIDDEN.includes(item.href)) return false;
            if (user?.role !== 'ADMIN' && ADMIN_ONLY.includes(item.href)) return false;
            return true;
          });
          if (visibles.length === 0) return null;
          return (
            <div key={group.title} className="mb-4">
              <p
                className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {group.title}
              </p>
              <div className="space-y-0.5">
                {visibles.map(({ label, href, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(href + '/');
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={onClose}
                      className="flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150"
                      style={
                        active
                          ? {
                              backgroundColor: 'var(--accent-pale)',
                              color: 'var(--accent-hover)',
                              borderLeft: '2px solid var(--accent)',
                              paddingLeft: 'calc(0.75rem - 2px)',
                              paddingRight: '0.75rem',
                            }
                          : { color: 'var(--text-secondary)', paddingLeft: '0.75rem', paddingRight: '0.75rem' }
                      }
                      onMouseEnter={e => {
                        if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)';
                      }}
                      onMouseLeave={e => {
                        if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = '';
                      }}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
```
(Nota: `/nuevo-contrato` sale de `AGENT_HIDDEN` porque ya no hay ítem de menú; la ruta sigue existiendo.)

- [ ] **Step 3: Botón en Contratos** — en `frontend/src/app/(admin)/contratos/page.tsx`:

1. Ampliar el import de lucide-react con `Plus`:
```ts
import {
  Search, FileText, AlertTriangle, DollarSign,
  ChevronLeft, ChevronRight, Plus,
} from 'lucide-react';
```
2. Reemplazar el header:
```tsx
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Contratos</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{filtered.length} contratos encontrados</p>
      </div>
```
por:
```tsx
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Contratos</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{filtered.length} contratos encontrados</p>
        </div>
        <button
          onClick={() => router.push('/nuevo-contrato')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ backgroundColor: 'var(--accent)', color: 'white' }}
        >
          <Plus size={16} />
          Nuevo contrato
        </button>
      </div>
```
(`router` ya existe en el componente vía `useRouter()`.)

- [ ] **Step 4: Verificar** — `cd frontend && npx tsc --noEmit` sin errores nuevos; visual rápido: sidebar muestra OPERACIÓN/FINANZAS/SISTEMA sin "Nuevo Contrato"; página Contratos tiene el botón.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx "frontend/src/app/(admin)/contratos/page.tsx"
git commit -m "feat(sidebar): secciones Operación/Finanzas/Sistema + Nuevo contrato como botón"
```

---

### Task 5: `RegistrarPagoModal` + botón en el sidebar

**Files:**
- Create: `frontend/src/components/pagos/RegistrarPagoModal.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx` (botón bajo el ProjectSelector + estado del modal)

**Interfaces:**
- Consumes: `POST /payments` → `201 { success, data: { payment, cuotasAfectadas: number[] } }` (Task 2); hooks existentes `useContratos(projectId?)`, `useCuotasByContrato(contractId)`, `useProjectSelection()`, `ReciboContrato`, `formatCurrency`, `formatLotsLabel`.
- Produces: `export function RegistrarPagoModal({ onClose }: { onClose: () => void })`.

- [ ] **Step 1: Crear el modal** — `frontend/src/components/pagos/RegistrarPagoModal.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Search, FileDown, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { useContratos, useCuotasByContrato, ContratoDetalle } from '@/hooks/useContratos';
import { useProjectSelection } from '@/contexts/ProjectContext';
import { ReciboContrato } from '@/components/pdf/ReciboContrato';
import api from '@/lib/api';
import { formatCurrency, formatLotsLabel } from '@/lib/utils';

type Step = 'pick' | 'form' | 'saving' | 'generating' | 'done';

const METODOS = [
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'CASH',     label: 'Efectivo' },
  { value: 'CHECK',    label: 'Cheque' },
  { value: 'CARD',     label: 'Tarjeta' },
];

export function RegistrarPagoModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { selectedProjectId } = useProjectSelection();
  const { data: contratos = [], isLoading } = useContratos(selectedProjectId ?? undefined);

  const [query, setQuery]       = useState('');
  const [contrato, setContrato] = useState<ContratoDetalle | null>(null);
  const [step, setStep]         = useState<Step>('pick');
  const [monto, setMonto]       = useState('');
  const [fecha, setFecha]       = useState(new Date().toISOString().split('T')[0]);
  const [metodo, setMetodo]     = useState('TRANSFER');
  const [concepto, setConcepto] = useState('');
  const [error, setError]       = useState('');

  const { data: cuotas = [] } = useCuotasByContrato(contrato?.id ?? '');
  const proximaCuota = cuotas.find(c => c.status === 'PENDIENTE');

  const resultados = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activos = contratos.filter(c => c.status !== 'CANCELED');
    if (!q) return activos.slice(0, 8);
    return activos.filter(c =>
      `${c.client.firstName} ${c.client.lastName}`.toLowerCase().includes(q) ||
      (c.codigoLegado ?? '').toLowerCase().includes(q) ||
      c.contractNumber.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [contratos, query]);

  function elegir(c: ContratoDetalle) {
    setContrato(c);
    setMonto(c.installmentAmount ? String(c.installmentAmount) : '');
    setConcepto('');
    setStep('form');
  }

  async function generarRecibo(montoPagado: number, cuotasAfectadas: number[]) {
    if (!contrato) return;
    const cuotaRecibo = cuotas.find(c => c.numeroCuota === cuotasAfectadas[0]) ?? proximaCuota;
    if (!cuotaRecibo) return;
    const balanceDespues = Math.max(0, (contrato.balance ?? 0) - montoPagado);
    const blob = await pdf(
      <ReciboContrato
        contrato={contrato}
        cuota={cuotaRecibo}
        pago={{ montoPagado, fechaPago: fecha, concepto: concepto.trim() || `Mensualidad #${cuotaRecibo.numeroCuota}` }}
        balanceDespues={balanceDespues}
      />
    ).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibo-${contrato.codigoLegado ?? contrato.contractNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function confirmar() {
    if (!contrato) return;
    const n = parseFloat(monto);
    if (!n || n <= 0) { setError('Ingresa un monto válido'); return; }
    setError('');
    setStep('saving');
    try {
      const { data } = await api.post('/payments', {
        contractId: contrato.id,
        amount: n,
        paymentDate: fecha,
        paymentMethod: metodo,
        concept: concepto.trim() || undefined,
      });
      const cuotasAfectadas: number[] = data?.data?.cuotasAfectadas ?? [];
      setStep('generating');
      try { await generarRecibo(n, cuotasAfectadas); } catch (e) { console.error('PDF error:', e); }
      qc.invalidateQueries({ queryKey: ['contratos'] });
      qc.invalidateQueries({ queryKey: ['cuotas'] });
      qc.invalidateQueries({ queryKey: ['pagos'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setStep('done');
      setTimeout(onClose, 1200);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Error al registrar el pago');
      setStep('form');
    }
  }

  const busy = step === 'saving' || step === 'generating';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="rounded-2xl shadow-xl w-full max-w-lg" style={{ backgroundColor: 'var(--surface)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            {step === 'form' && (
              <button onClick={() => { setContrato(null); setStep('pick'); setError(''); }} disabled={busy}
                      className="p-1 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Registrar pago</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {contrato
                  ? `${contrato.codigoLegado ?? contrato.contractNumber} · ${contrato.client.firstName} ${contrato.client.lastName}`
                  : 'Elige el contrato'}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {step === 'pick' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar por cliente o código (F096, K012…)"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl outline-none"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1">
                {isLoading && <p className="text-sm px-2 py-4" style={{ color: 'var(--text-tertiary)' }}>Cargando contratos…</p>}
                {!isLoading && resultados.length === 0 && (
                  <p className="text-sm px-2 py-4" style={{ color: 'var(--text-tertiary)' }}>Sin resultados</p>
                )}
                {resultados.map(c => (
                  <button
                    key={c.id}
                    onClick={() => elegir(c)}
                    className="w-full text-left px-3 py-2.5 rounded-xl transition-colors"
                    style={{ border: '1px solid var(--border)' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {c.codigoLegado ?? c.contractNumber} · {c.client.firstName} {c.client.lastName}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--danger)' }}>{formatCurrency(c.balance ?? 0)}</span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {c.project.name} · {formatLotsLabel(c.lots)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(step === 'form' || busy || step === 'done') && contrato && (
            <div className="space-y-4">
              {/* Resumen */}
              <div className="rounded-xl p-3 text-xs space-y-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Balance: <strong style={{ color: 'var(--danger)' }}>{formatCurrency(contrato.balance ?? 0)}</strong>
                  {contrato.installmentAmount ? <> · Mensualidad: <strong>{formatCurrency(contrato.installmentAmount)}</strong></> : null}
                </p>
                <p style={{ color: 'var(--text-tertiary)' }}>
                  {proximaCuota ? `Próxima cuota: #${proximaCuota.numeroCuota} — ${proximaCuota.mes}` : 'Sin cuotas pendientes'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Monto (MXN)</label>
                <input type="number" value={monto} step="0.01" min="0" disabled={busy}
                       onChange={e => { setMonto(e.target.value); setError(''); }}
                       className="w-full px-3 py-2.5 text-sm rounded-xl outline-none"
                       style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Fecha</label>
                  <input type="date" value={fecha} disabled={busy} onChange={e => setFecha(e.target.value)}
                         className="w-full px-3 py-2.5 text-sm rounded-xl outline-none"
                         style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Método</label>
                  <select value={metodo} disabled={busy} onChange={e => setMetodo(e.target.value)}
                          className="w-full px-3 py-2.5 text-sm rounded-xl outline-none cursor-pointer"
                          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                    {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Concepto <span style={{ color: 'var(--text-tertiary)' }}>(opcional, aparece en el recibo)</span>
                </label>
                <input type="text" value={concepto} disabled={busy}
                       placeholder={proximaCuota ? `Mensualidad #${proximaCuota.numeroCuota} — ${proximaCuota.mes}` : 'Mensualidad'}
                       onChange={e => setConcepto(e.target.value)}
                       className="w-full px-3 py-2.5 text-sm rounded-xl outline-none"
                       style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              </div>

              {error && <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-pale)' }}>{error}</p>}
              {step === 'saving' && <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}><Loader2 className="w-4 h-4 animate-spin" /> Registrando pago…</p>}
              {step === 'generating' && <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}><FileDown className="w-4 h-4 animate-bounce" /> Generando recibo…</p>}
              {step === 'done' && <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--accent)' }}><CheckCircle2 className="w-4 h-4" /> Pago registrado y recibo descargado</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'form' || busy) && contrato && (
          <div className="px-6 py-4 flex gap-3" style={{ borderTop: '1px solid var(--border)' }}>
            <button onClick={onClose} disabled={busy}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              Cancelar
            </button>
            <button onClick={confirmar} disabled={busy}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                    style={{ backgroundColor: 'var(--accent)', color: 'white', opacity: busy ? 0.7 : 1 }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Confirmar y descargar recibo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Botón en el Sidebar** — en `Sidebar.tsx`:

1. Imports nuevos: `import { useState } from 'react';`, agregar `CreditCard` al import de lucide-react, y `import { RegistrarPagoModal } from '@/components/pagos/RegistrarPagoModal';`
2. Dentro del componente, junto a los otros hooks: `const [showPago, setShowPago] = useState(false);`
3. Después del bloque del `ProjectSelector` (el `<div>` que cierra en la línea ~101), insertar:

```tsx
      {/* Botón global: registrar pago (solo ADMIN/MANAGER — la API es adminOrManager) */}
      {(user?.role === 'ADMIN' || user?.role === 'MANAGER') && (
        <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowPago(true)}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ backgroundColor: 'var(--accent)', color: 'white' }}
          >
            <CreditCard className="w-4 h-4" />
            Registrar pago
          </button>
        </div>
      )}
```
4. En el `return` final del componente, agregar el modal (fuera del aside, junto al overlay móvil):

```tsx
  return (
    <>
      {showPago && <RegistrarPagoModal onClose={() => setShowPago(false)} />}
      <div className="hidden lg:flex flex-col h-screen sticky top-0 flex-shrink-0" style={{ width: 260 }}>
        {sidebar}
      </div>
      ...resto igual...
    </>
  );
```

- [ ] **Step 3: Verificar** — `cd frontend && npx tsc --noEmit` sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/pagos/RegistrarPagoModal.tsx frontend/src/components/layout/Sidebar.tsx
git commit -m "feat(pagos): modal global Registrar pago + botón en sidebar"
```

---

### Task 6: QA end-to-end (con reversa del pago de prueba)

**Files:** sin cambios de código.

**Pre-requisito:** backend `:4000` y frontend `:3000` corriendo; login `info@seventyss.com` / `admin123`.

- [ ] **Step 1: Suites** — backend `npx vitest run` (todo verde) y frontend `cd frontend && npx vitest run` (7 verdes).

- [ ] **Step 2: Sidebar** — visual: grupos OPERACIÓN/FINANZAS/SISTEMA; sin "Nuevo Contrato" en el menú; botón dorado "Registrar pago" bajo el selector; página Contratos con botón "+ Nuevo contrato" que navega a `/nuevo-contrato`.

- [ ] **Step 3: Flujo de pago de PRUEBA** — clic en "Registrar pago" → buscar `F096` → elegirlo (muestra balance $404,000, mensualidad $8,000, próxima cuota) → monto **$1**, método Efectivo → confirmar. Verificar: recibo PDF descarga; en `/contratos/<F096>` el Historial de pagos muestra el pago de $1 (¡ahora los pagos aparecen!), el balance bajó a $403,999 y la cuota #10 subió su acumulado en $1.

- [ ] **Step 4: REVERTIR el pago de prueba** (es dato real — limpiarlo):

```bash
cd /Users/miguelmachuca/centralhub
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const proj = await p.project.findFirst({ where: { code: 'MON1' } });
  const c = await p.contract.findFirst({ where: { projectId: proj!.id, codigoLegado: 'F096' } });
  const pago = await p.payment.findFirst({ where: { contractId: c!.id, amount: 1 }, orderBy: { createdAt: 'desc' } });
  if (!pago) { console.log('No hay pago de \$1 — nada que revertir'); return p.\$disconnect(); }
  await p.payment.delete({ where: { id: pago.id } });
  await p.contract.update({ where: { id: c!.id }, data: { balance: { increment: 1 } } });
  console.log('Pago de prueba eliminado y balance restaurado');
  await p.\$disconnect();
})();
"
npx tsx src/scripts/apply-payments-to-cuotas.ts --code MON1 | tail -3
```
(El script recompute-desde-cero deja las cuotas de F096 exactamente como antes del $1.)

- [ ] **Step 5: Verificación post-reversa** — en la app: F096 balance $404,000 y sin el pago de $1 en el historial.

- [ ] **Step 6: Caso de error** — en el modal, buscar un contrato liquidado o intentar monto 0 → mensaje claro sin resetear el form. AGENT (si hay usuario agente de prueba, `asesor@centralhub.com`): no ve el botón.

---

## Criterios de aceptación

1. [ ] 6/6 tests de `pagoCuotas` + suite backend completa verde.
2. [ ] `POST /payments` crea Payment + aplica cuotas + balance + mora en una transacción.
3. [ ] Pagar una cuota desde el detalle del contrato ahora TAMBIÉN crea Payment (aparece en el historial).
4. [ ] El script de reconciliación sigue siendo idempotente (BET reporta los mismos totales).
5. [ ] Botón global funciona end-to-end con recibo PDF (verificado con F096 + revertido).
6. [ ] Sidebar en secciones, sin "Nuevo Contrato" (botón en Contratos), botón de pago solo ADMIN/MANAGER.
