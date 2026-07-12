# Botón global "Registrar pago" + sidebar limpio — Diseño

**Fecha:** 2026-07-07
**Estado:** Aprobado (pendiente de plan de implementación)

## Problema

1. No hay forma de registrar un pago sin navegar hasta la cuota específica de un
   contrato. El usuario quiere un botón global: elegir contrato → registrar
   mensualidad → recibo.
2. El backend tiene la lógica de pago **fragmentada y rota**:
   - `PATCH /cuotas/:id/pay` (`cuota.service.payCuota`): aplica cascada a cuotas,
     baja balance y recalcula mora — pero **no crea registro `Payment`** (los
     pagos por-cuota no aparecen en el "Historial de pagos").
   - `POST /payments` (`payment.service.createPayment`): crea el `Payment` pero
     **no toca cuotas** y su balance está mal (solo resta `extraAmount`).
   - La cascada existe 3 veces (cuota.service, apply-payments-to-cuotas, y
     payments ni la usa).
3. El sidebar tiene 10 opciones planas; el usuario lo quiere limpio e intuitivo.

## Decisiones tomadas (Q&A con el usuario)

- **Solo Mensualidad** en el flujo global (Enganche/Abono después si hace falta).
- Selección de contrato por **buscador** (nombre de cliente o código).
- **Sí** genera recibo PDF al confirmar.
- Botón **destacado en el sidebar**, debajo del selector de proyecto.
- Sidebar: **secciones + quitar redundantes** (ver más abajo).
- Se unifica también `PATCH /cuotas/:id/pay` (aprobado "adelante" sin reservas).

## Parte A — Backend unificado

### A1. Módulo puro compartido `src/services/lib/pagoCuotas.ts`
Extraer la cascada (hoy `calcularUpdates` en `apply-payments-to-cuotas.ts` y
copia inline en `cuota.service.payCuota`):

```ts
export interface CuotaLike { id: string; montoEsperado: number; montoPagado: number; status: 'PENDIENTE' | 'PAGADA'; }
export interface CuotaUpdate { id: string; montoPagado: number; fechaPago: Date; status: 'PENDIENTE' | 'PAGADA'; }
/** Drena `monto` sobre las cuotas en orden desde la primera no PAGADA.
 *  Parciales quedan PENDIENTE con montoPagado acumulado. */
export function aplicarPagoACuotas(monto: number, fechaPago: Date, cuotas: CuotaLike[]): CuotaUpdate[];
```

Tests Vitest (montos exactos, parciales, cuota ya parcial que se completa,
monto que excede todas las cuotas → aplica hasta agotarlas).
El script `apply-payments-to-cuotas.ts` y `cuota.service` pasan a importarlo
(el script mantiene su semántica actual: recalcula desde cero; el servicio
aplica incremental desde el estado actual — ambos casos los cubre la firma).

### A2. Servicio único `payment.service.registrarPagoMensualidad`

```ts
async registrarPagoMensualidad(data: {
  contractId: string; amount: number; paymentDate: Date;
  paymentMethod: PaymentMethod; concept?: string; notes?: string;
}): Promise<{ payment: Payment; cuotasAfectadas: number[] }>
```

En **una** `prisma.$transaction`:
1. Valida: contrato existe, `status !== 'CANCELED'`, `amount > 0`, y tiene al
   menos una cuota no PAGADA (si no → error claro "El contrato no tiene cuotas
   pendientes").
2. Crea `Payment` (INSTALLMENT, CONFIRMED, `paymentNumber` con el generador
   existente, `concept` = provisto o `Mensualidad(es) #n[–#m] — <mes(es)>`,
   `balanceAfter` = balance − amount).
3. Aplica `aplicarPagoACuotas` sobre las cuotas ordenadas por `numeroCuota` y
   persiste los updates.
4. `balance: { decrement: amount }` en el contrato.
5. Recalcula vencidas (PENDIENTE + `fechaVencimiento < hoy`) →
   `moraMonthsCount` y `status` IN_MORA/ACTIVE (no tocar CANCELED — ya
   excluido en 1).

Devuelve el payment con relaciones + números de cuotas afectadas (para el recibo).

### A3. Rutas
- `POST /payments` → controller llama `registrarPagoMensualidad` (DTO existente
  `CreatePaymentDto` sigue válido; `installmentAmount`/`extraAmount` se ignoran
  y quedan deprecados en comentario). Errores de validación → HTTP 400 con
  mensaje claro.
- `PATCH /cuotas/:id/pay` → `cuota.service.payCuota` delega en
  `registrarPagoMensualidad` (usa el `contractId` de la cuota; el `cuotaId` del
  path solo ancla la UX). Conserva su validación "la cuota ya fue pagada".
  Resultado: los pagos por-cuota **ahora sí crean Payment** y aparecen en el
  historial.
- La `Activity` que hoy registra `payCuota` se conserva (movida al servicio
  unificado para ambos flujos).

## Parte B — Frontend

### B1. `RegistrarPagoModal` (`frontend/src/components/pagos/RegistrarPagoModal.tsx`)
- **Paso contrato:** input de búsqueda (filtra client-side la lista de
  `useContratos(selectedProjectId ?? undefined)` por nombre de cliente o
  `codigoLegado`, como la página de Contratos). Lista con código, cliente,
  proyecto, balance. Si hay proyecto en el selector global, se limita a él.
- **Paso datos** (al elegir contrato): resumen (cliente, lotes vía
  `formatLotsLabel` si ya está mergeado — si no, label simple —, balance,
  mensualidad, próxima cuota) + campos: monto (default `installmentAmount`),
  fecha (hoy), método (select TRANSFER/CASH/CHECK/CARD, default TRANSFER),
  concepto (auto, editable).
- **Confirmar:** `POST /payments` → al éxito genera el **recibo PDF** con
  `ReciboContrato` (se le pasa la primera cuota afectada, obtenida del
  response `cuotasAfectadas[0]` + refetch de cuotas; `balanceDespues` =
  balance − monto) → invalida queries `['contratos']`, `['cuotas']`,
  `['dashboard']`, `['pagos']` → cierra con feedback "Pago registrado".
- Estados: form / saving / generating / done + errores del backend visibles.

### B2. Botón en el sidebar
En `Sidebar.tsx`, debajo del `ProjectSelector`: botón primario
(`backgroundColor: var(--accent)`) **"+ Registrar pago"**. Visible solo para
`ADMIN`/`MANAGER` (la API es adminOrManager). Abre el modal (estado local del
Sidebar; el modal se monta ahí mismo).

### B3. Sidebar limpio (secciones)
Estructura nueva de `NAV_ITEMS` con grupos y headers visuales (texto pequeño
uppercase `var(--text-tertiary)`):

- **OPERACIÓN:** Dashboard, Proyectos, Lotes, Contratos, Cuotas, Clientes
- **FINANZAS:** Gastos, Comisiones
- **SISTEMA:** Usuarios

Reglas:
- **"Nuevo Contrato" sale del menú.** A cambio, la página de Contratos gana un
  botón "+ Nuevo contrato" (link a `/nuevo-contrato`) en su header. La ruta
  `/nuevo-contrato` no cambia.
- Filtros por rol se conservan (AGENT: hoy solo ve Proyectos y Lotes → verá
  solo OPERACIÓN con esos ítems; un grupo sin ítems visibles no pinta su header).
- El botón "Registrar pago" (B2) va arriba, fuera de los grupos.

## Casos borde

- Contrato sin cuotas pendientes (liquidado) → 400 con mensaje claro; el modal
  lo muestra sin resetear el form.
- Monto mayor al total pendiente de cuotas → la cascada aplica hasta agotar
  cuotas; el balance baja por el monto completo (consistente con payCuota hoy).
- Doble click en confirmar → botón disabled durante saving.
- AGENT logueado → no ve el botón (y la API igual lo rechaza).

## Pruebas

- Unit (Vitest): `aplicarPagoACuotas` (5+ casos) — la pieza con matemática.
- Backend smoke: crear pago vía `POST /payments` contra la BD local y verificar
  Payment + cuotas + balance + mora en una consulta (script temporal en QA).
- QA visual: flujo completo desde el botón (buscar → pagar → PDF → refleja en
  contrato/cuotas/dashboard); sidebar reorganizado; AGENT no ve el botón;
  botón "+ Nuevo contrato" en la página Contratos.

## Fuera de alcance

- Pagos de Enganche/Abono a capital desde el modal (post-MVP).
- Editar/cancelar pagos.
- Mover el Payment dentro de la transacción en `createContract` (deuda previa).

## Archivos afectados

| Archivo | Acción |
|---|---|
| `src/services/lib/pagoCuotas.ts` | **Nuevo** — cascada pura + tests |
| `src/services/lib/__tests__/pagoCuotas.test.ts` | **Nuevo** |
| `src/services/payment.service.ts` | `registrarPagoMensualidad`; `createPayment` delega/reemplazado |
| `src/services/cuota.service.ts` | `payCuota` delega en el servicio unificado |
| `src/scripts/apply-payments-to-cuotas.ts` | importa la cascada compartida |
| `src/controllers/payment.controller.ts` | errores 400 claros |
| `frontend/src/components/pagos/RegistrarPagoModal.tsx` | **Nuevo** |
| `frontend/src/components/layout/Sidebar.tsx` | botón + secciones |
| `frontend/src/app/(admin)/contratos/page.tsx` | botón "+ Nuevo contrato" |

Backend con cambios de comportamiento (payCuota crea Payment) — sin
migraciones de schema.
