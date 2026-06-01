# Spec — Anticipo del apartado como pago registrado

> **Tarea #2** del sprint acordado con el cliente (post-handoff de Chat 2026-05-31).  
> Primer spec del proyecto con este nivel de detalle. **Las secciones de este documento son el template** para los siguientes specs del sprint (tareas #3 a #7).

## Metadata

| Campo | Valor |
|---|---|
| Estado | Aprobado para implementación (rev. 2026-05-31 post-QA) |
| Fecha de diseño | 2026-05-31 (rev. tras QA visual de la primera implementación) |
| Autor | Miguel Machuca + Claude Code (brainstorming skill, superpowers) |
| Sprint task | #2 de 7 |
| Tarea previa | #1 Precio editable en nuevo contrato (commit `b98440c`) |
| Tarea siguiente | #3 Activación manual de contrato |
| Relación con spec contractual | RF1.3 (motor financiamiento) + sección 7.1 (caso de uso venta con apartado) |
| Archivos backend tocados | `src/services/contract.service.ts`, `src/controllers/contract.controller.ts`, (posible) `src/utils/errors.ts` |
| Archivos frontend tocados | `frontend/src/app/(admin)/nuevo-contrato/page.tsx`, `frontend/src/app/(admin)/contratos/[id]/page.tsx`, `frontend/src/app/(portal)/mis-contratos/[id]/page.tsx` |
| Migraciones | Ninguna |
| Dependencias nuevas | `vitest` (devDep) |

---

## 1. Contexto y motivación

Cuando un agente aparta un lote con un depósito (`reservationDeposit > 0`), ese dinero queda registrado solo en el modelo `Lot`. Al formalizar el contrato, el sistema actual crea un Payment de tipo `DOWN_PAYMENT` por el monto completo del enganche pactado, **sin descontar el depósito ya entregado**. Resultado: el dinero del apartado no aparece en el historial de pagos del contrato, y si el cliente pagó $5,000 de apartado y firma con enganche de $25,000, el sistema registra como si hubiera pagado $25,000 al firmar — el apartado se pierde de la trazabilidad financiera.

El cliente (Arq. Alberto Simone García) pidió que el depósito del apartado se refleje como un pago real en el historial. El portal cliente y los estados de cuenta deben mostrar dos entradas distinguibles: el depósito de apartado y el saldo del enganche.

## 2. Decisiones tomadas (con justificación)

| Decisión | Resolución | Razonamiento |
|---|---|---|
| Semántica del depósito | **Pago separado (additional)** [REVISADO 2026-05-31] | Modelo alineado con la operación real del negocio inmobiliario: el apartado y el enganche son pagos distintos. El agente teclea "Enganche al firmar" = lo que cobrará al firmar (adicional al depósito ya recibido). `Contract.downPayment` almacena el **total upfront** = depósito + enganche al firmar. **Decisión previa "Parte del enganche" fue descartada en el QA visual** porque confundía al agente: ver "Enganche $20,000" sugería cobrar $20,000 al firmar cuando realmente solo se cobrarían $15,000 (descontando el depósito). La nueva semántica refleja la intuición real: "lo que tecleo es lo que voy a cobrar al firmar". |
| Timing del Payment | **Crear al formalizar contrato** (fecha retroactiva al `Lot.reservedAt`) | No requiere migración (`Payment.contractId` sigue NOT NULL). Coincide con la frase "al formalizar" del handoff de Chat. Caveat aceptado: el dinero del apartado solo entra a la tabla `payments` cuando hay contrato; antes vive solo en `Lot.reservationDeposit`. |
| Edge `depósito + enganche > precio` [REVISADO] | **Rechazar con HTTP 400** | Bajo la nueva semántica el conflicto no es entre depósito y enganche (son independientes), sino que el total upfront no puede exceder el precio del lote (resultaría en saldo financiado negativo). Audit-friendly. |
| Monto mínimo de "anticipo" | **Cualquier `deposit > 0`** | Convención ya implementada en `lot.service.ts:188`. No introducir umbral nuevo. |
| Alcance UI | **Banner informativo + label "Enganche al firmar" + cálculo de saldo ajustado en wizard + traducción del enum en historial** [REVISADO] | El banner ya no dice "se aplicará al enganche" (confunde) sino "se registrará como pago separado al formalizar". El label "Enganche" se renombra a "Enganche al firmar" para dejar claro que NO incluye el depósito. El cálculo de saldo en vivo del wizard pasa a `saldo = precio − (depósito + enganche)`. |
| Enfoque de implementación | **Función pura `computeDepositSplit` + orquestación inline en `createContract`** | Testabilidad de B + simplicidad de A. La función pura es unit-testable sin fixtures de Prisma; la orquestación queda en un único método sin spread artificial. |
| Test runner | **Vitest, instalación mínima** | ESM nativo, lee `tsconfig.json`, cero config para TypeScript. Solo unit tests sobre `computeDepositSplit`. |

## 3. Supuestos e invariantes

**Invariante de negocio (no verificada por sistema)**:  
> Se asume que `Lot.reservationDeposit > 0` representa dinero efectivamente recibido al momento del apartado. El sistema no verifica esta invariante; depende de la convención operativa del agente al capturar el apartado. Vector ya existente; este cambio no lo agrava.

**Invariantes técnicas (verificables con queries)**:
1. `SUM(Payments tipo DOWN_PAYMENT + RESERVATION_DEPOSIT del contrato) === Contract.downPayment`.
2. `Lot.reservationDeposit === null` cuando `Lot.status === SOLD`.
3. `Payment.contractId !== null` siempre (el modelo lo exige; no cambia).

## 4. Arquitectura

**Backend — `src/services/contract.service.ts`**

Nueva función pura `computeDepositSplit(lots, downPayment)` que vive en el mismo archivo que `ContractService`, exportada por nombre.

Signature:
```ts
export function computeDepositSplit(
  lots: Array<{
    id: string;
    reservationDeposit: number | null;
    manzana: number;
    lotNumber: string;
    reservedAt: Date | null;
  }>,
  engancheAlFirmar: number,
  totalPrice: number,
): {
  totalDeposit: number;
  enganche: number;          // = engancheAlFirmar (pass-through, round2)
  totalUpfront: number;      // = totalDeposit + enganche (lo que se guarda en Contract.downPayment)
  depositSources: Array<{ lotLabel: string; amount: number; reservedAt: Date }>;
};
```

Reglas internas:
- `round2 = (n) => Math.round(n * 100) / 100` aplicado a la suma de depósitos, al `engancheAlFirmar` y al `totalUpfront`.
- Si `totalUpfront > totalPrice` (todos redondeados) → `throw new TotalUpfrontExceedsPriceError(totalUpfront, totalPrice)`.
- `depositSources` solo incluye lotes con `reservationDeposit > 0`.
- **Sin validación cruzada entre depósito y enganche** — son pagos independientes bajo la nueva semántica.

`createContract` la invoca después del lookup de lotes (línea ~36) y antes de abrir la transacción. Si lanza, fail rápido sin tocar BD.

Dentro del `prisma.$transaction` existente:
- Contract creado con `downPayment = totalUpfront` (NO con `data.downPayment` directo). Esto significa que el campo `Contract.downPayment` ahora representa el **total upfront** (depósito + enganche al firmar), no solo el enganche tecleado.
- `Contract.balance = totalPrice - totalUpfront` (NO con `data.downPayment`).
- ContractLot[] creado (sin cambio).
- `lot.updateMany` a SOLD **+ limpieza explícita** de los 7 campos de reserva.
- Si `totalDeposit > 0` → crear `Payment` tipo `RESERVATION_DEPOSIT` (sin cambio respecto al diseño anterior).
- Si `enganche > 0` → crear `Payment` tipo `DOWN_PAYMENT`:
  - `amount = enganche` (el monto tecleado completo, **sin restar el depósito**)
  - `paymentDate = startDate ?? contractDate`
  - `concept = 'Enganche al firmar'` (sin la frase "saldo tras aplicar depósito")
- Si `enganche === 0` → no se crea Payment DOWN_PAYMENT (el depósito cubre todo lo upfront).
- `paymentNumber` sigue el patrón `PAY-${codigoLegado}-${seq}`.

**Backend — `src/controllers/contract.controller.ts`**

Captura el error con `instanceof TotalUpfrontExceedsPriceError` y responde:
```json
{
  "success": false,
  "code": "TOTAL_UPFRONT_EXCEEDS_PRICE",
  "message": "El total upfront (depósito $X + enganche $Y = $Z) excede el precio del lote ($W). Ajusta el enganche o renegocia el depósito antes de continuar.",
  "totalDeposit": X,
  "enganche": Y,
  "totalUpfront": Z,
  "totalPrice": W
}
```

Antes de responder, loggear con Winston:
```ts
logger.warn('Contract creation rejected: total upfront exceeds price', {
  clientId, projectId, lotIds, totalDeposit, enganche, totalUpfront, totalPrice, agentId: req.user?.id
});
```

**Backend — `src/utils/errors.ts`**

Renombrado `DepositExceedsDownPaymentError` → `TotalUpfrontExceedsPriceError`:
```ts
export class TotalUpfrontExceedsPriceError extends Error {
  readonly code = 'TOTAL_UPFRONT_EXCEEDS_PRICE' as const;
  constructor(public totalUpfront: number, public totalPrice: number) {
    super(`Total upfront (${totalUpfront}) excede precio del lote (${totalPrice})`);
  }
}
```

**Frontend — `frontend/src/app/(admin)/nuevo-contrato/page.tsx`**

Cambios bajo la nueva semántica:

1. **Label del campo enganche**: cambiar `"Enganche"` → `"Enganche al firmar"` para clarificar que NO incluye el depósito.

2. **Cálculo de saldo en vivo** debe pasar a:
   ```ts
   const totalDeposit = loteSeleccionado?.reservationDeposit ?? 0;
   const saldoFinanciado = precioEditado - (totalDeposit + engancheAlFirmar);
   const mensualidad = saldoFinanciado / plazo;
   ```

3. **Banner copy revisado** (en paso 2 cuando `reservationDeposit > 0`):
   ```tsx
   <p>
     <strong>Depósito de apartado registrado:</strong> este lote tiene{' '}
     <strong>{formatCurrency(...)}</strong> registrado el {formatDate(...)}.
     Quedará registrado como pago al formalizar el contrato, separado del enganche
     que captures abajo.
   </p>
   ```

4. **Manejo del error 400 en wizard**: si el backend responde `code: 'TOTAL_UPFRONT_EXCEEDS_PRICE'`, mostrar el `message` en banner de error sobre el botón "Confirmar contrato" sin perder el estado del form.

**Frontend — historial de pagos (admin + portal)**

Agregar entrada en el diccionario `PAYMENT_TYPE`:
- `frontend/src/app/(admin)/contratos/[id]/page.tsx:36-48` → agregar `RESERVATION_DEPOSIT: 'Depósito de apartado'`.
- `frontend/src/app/(portal)/mis-contratos/[id]/page.tsx` → mismo fix, **es must-do**. El cliente final NO debe ver el enum crudo.

## 5. Flujo de datos (con ejemplos numéricos)

**Caso normal**: precio $260,000, depósito $5,000, enganche al firmar $20,000

```
[1] Apartado:  Lot { status=RESERVED, reservationDeposit=5000, reservedAt=2026-04-10 }
[2] Wizard:    Banner aparece. Agente captura enganche al firmar = 20000.
               Wizard calcula en vivo: saldo = 260000 - (5000 + 20000) = 235000.
               Wizard muestra: precio 260k | enganche al firmar 20k | saldo 235k | mensualidad 3,916.67.
[3] POST /contracts { lotIds:[L1], downPayment:20000, ... }
[4] computeDepositSplit: { totalDeposit:5000, enganche:20000, totalUpfront:25000 }
[5] Transacción:
    - Contract creado (K099, downPayment=25000, balance=235000)
    - Lot → SOLD + reservationDeposit=null + reservedBy*=null
    - Payment(RESERVATION_DEPOSIT, $5,000, fecha=2026-04-10, "Depósito de apartado: M5 L-12 ($5,000)")
    - Payment(DOWN_PAYMENT, $20,000, fecha=startDate, "Enganche al firmar")
    - 60 Cuotas de $3,916.67 creadas
[6] Resultado: SUM(Payments) = 25,000 = Contract.downPayment ✓
              Total que paga el cliente = 25k upfront + 235k mensualidades = 260k = precio del lote ✓
```

**Tabla de casos revisada**:

| Escenario | `reservationDeposit` | enganche tecleado | totalPrice | totalUpfront | balance | Payments |
|---|---|---|---|---|---|---|
| Normal | 5,000.00 | 20,000.00 | 260,000 | 25,000 | 235,000 | RESERVATION_DEPOSIT(5,000) + DOWN_PAYMENT(20,000) |
| Sin enganche al firmar (todo apartado) | 25,000.00 | 0 | 260,000 | 25,000 | 235,000 | RESERVATION_DEPOSIT(25,000) solo |
| Sin depósito (legacy) | null o 0 | 25,000.00 | 260,000 | 25,000 | 235,000 | DOWN_PAYMENT(25,000) solo |
| Sin enganche y sin depósito | 0 | 0 | 260,000 | 0 | 260,000 | (ninguno; todo a cuotas) |
| Decimal (un lote) | 3,333.33 | 10,000.00 | 100,000 | 13,333.33 | 86,666.67 | RESERVATION_DEPOSIT(3,333.33) + DOWN_PAYMENT(10,000) |
| Multi-lote consolidado | 3,000 + 2,000 | 20,000.00 | 260,000 | 25,000 | 235,000 | RESERVATION_DEPOSIT(5,000) + DOWN_PAYMENT(20,000) |
| Multi-lote decimal | 1,111.11 + 2,222.22 | 10,000.00 | 100,000 | 13,333.33 | 86,666.67 | RESERVATION_DEPOSIT(3,333.33) + DOWN_PAYMENT(10,000) |
| ❌ totalUpfront > precio | 5,000.00 | 260,000 | 260,000 | 265,000 | — | HTTP 400 `TOTAL_UPFRONT_EXCEEDS_PRICE` |
| ❌ Lote SOLD ya | — | — | — | — | — | HTTP 400 (validación existente) |

## 6. Manejo de errores

**Errores nuevos**:
- `TotalUpfrontExceedsPriceError` → HTTP 400 con `code: 'TOTAL_UPFRONT_EXCEEDS_PRICE'`, `message`, `totalDeposit`, `enganche`, `totalUpfront`, `totalPrice`. Loggeado con Winston nivel warn antes de responder.

**Errores existentes preservados** (sin tocar):
- Cliente/proyecto no encontrado, lotes no existen, lotes no AVAILABLE/RESERVED.

**Rollback transaccional**: `prisma.$transaction` cubre atómicamente Contract + ContractLot[] + Lot updates + Payments. Cualquier falla revierte todo.

**Frontend**: el wizard preserva estado del form al recibir 400. Otros tipos de error usan el mecanismo existente.

## 7. Testing

**Unit tests con Vitest** — solo sobre `computeDepositSplit`.

Setup:
```bash
npm i -D vitest
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
```

Scripts en `package.json`:
```json
"test":       "vitest run",
"test:watch": "vitest"
```

Test file: `src/services/__tests__/computeDepositSplit.test.ts`

**TDD estricto**: escribir los 9 tests primero, ejecutar `npm test`, confirmar los 9 rojos, implementar `computeDepositSplit` hasta verde. Cada test de rojo a verde se commitea individualmente.

| # | Caso | Assertion clave |
|---|---|---|
| 1 | `reservationDeposit: null` | `totalDeposit=0, remaining=downPayment, depositSources=[]` |
| 2 | `reservationDeposit: 0` | `totalDeposit=0, remaining=downPayment, depositSources=[]` |
| 3 | un lote, depósito < enganche | match exacto |
| 4 | un lote, depósito == enganche | `remaining=0` |
| 5 | multi-lote suma < enganche | `depositSources.length=2` |
| 6 | multi-lote mixto null/0/>0 | solo entries con `>0` en depositSources |
| 7 | totalUpfront > totalPrice | `throws TotalUpfrontExceedsPriceError` con campos correctos |
| 8 | decimal: deposit 3,333.33 + enganche 10,000, price 100,000 | `expect(totalUpfront).toBe(13333.33)` — igualdad exacta de Float |
| 9 | multi-lote decimal: 1,111.11 + 2,222.22 deposits + 10,000 enganche, price 100,000 | `expect(totalDeposit).toBe(3333.33); expect(totalUpfront).toBe(13333.33)` |

**Fuera de los unit tests** (NO automatizar en esta tarea): tests de integración del endpoint, mocks de Prisma, E2E del wizard, coverage, CI.

## 8. QA manual (checklist pre-merge)

- [ ] Crear apartado con `deposit=5000` en `/lotes` (admin).
- [ ] Crear contrato desde wizard usando ese lote + enganche al firmar `20000`. Total upfront = 5000 + 20000 = 25000; saldo financiado = 235000.
- [ ] **Banner gold-pale aparece** en paso 2 del wizard con monto y fecha correctos.
- [ ] Tras submit, en `/contratos/[id]`: aparecen DOS Payments con textos legibles ("Depósito de apartado" $5,000 + "Enganche al firmar" $20,000). Suma = $25,000 = `Contract.downPayment` (total upfront). `Balance pendiente = $235,000`.
- [ ] En `/mis-contratos/[id]` del portal cliente (logueado como ese cliente): mismos dos pagos con textos legibles. **NO debe aparecer "RESERVATION_DEPOSIT" crudo.**
- [ ] Estado del Lot: `status=SOLD`, `reservationDeposit=null`, `reservedBy*=null` (verificar en Prisma Studio).
- [ ] Caso decimal: repetir con `deposit=3333.33`, `enganche al firmar=10000`, precio del lote `100000`. Verificar Payment RESERVATION_DEPOSIT = $3,333.33 + Payment DOWN_PAYMENT = $10,000 (exactos, sin Float trash). `Contract.downPayment = 13,333.33`, `Balance = 86,666.67`.
- [ ] Caso de rechazo: contrato con `enganche=20000` sobre lote con `deposit=25000`. Esperar banner de error en wizard con el mensaje del backend; wizard NO pierde estado del form.
- [ ] Log de warn en `logs/combined.log` para el caso de rechazo.

## 9. Out of scope / deuda técnica anotada

No se atiende en esta tarea, registrado para futuras iteraciones:

- **Cron de auto-liberación de apartados expirados** — sigue pendiente; relacionado pero independiente.
- **`generateContractNumber` fuera de transacción** — race condition teórica entre dos agentes concurrentes; `@unique` rescata pero un agente verá error de unicidad. Fix en tarea futura "endurecer createContract".
- **`prisma.cuota.createMany` fuera de transacción** (línea 119 actual) — si falla, contrato queda sin cuotas. Bug existente. Fix en misma tarea futura.
- **Lookup de lotes fuera de transacción** — race condition teórica con apartado/cancelación concurrente. Mismo fix.
- **Endurecer captura del apartado** (comprobante de pago obligatorio, checkbox de confirmación) — depende de decisión de negocio aparte; sale de scope de tarea #2.
- **Refundir el dinero del apartado al liberar sin firma** — el `DELETE /lots/:id/reserve` actual pierde el rastro del depósito. Tarea separada cuando se implemente auto-liberación.
- **Tracking por-lote del depósito multi-lote** — consolidación en un solo Payment con desglose en `concept`. Si contabilidad pide desglose fino más adelante, refactor a un Payment por lote.

## 10. Criterios de aceptación

La tarea está completa cuando:

1. `npm test` pasa con los 9 tests de `computeDepositSplit`.
2. Crear un apartado con depósito y luego formalizar el contrato resulta en dos Payments correctos (verificado vía Prisma Studio y QA checklist).
3. El historial de pagos en `/contratos/[id]` y `/mis-contratos/[id]` muestra "Depósito de apartado" como texto humano, no como enum crudo.
4. El banner aparece en el wizard para lotes con depósito.
5. El error 400 `TOTAL_UPFRONT_EXCEEDS_PRICE` se dispara correctamente cuando `depósito + enganche > precio` y el wizard no pierde estado.
6. Lots formalizados (SOLD) tienen los campos de reserva limpios (null).
7. La invariante `SUM(Payments tipo RESERVATION_DEPOSIT + DOWN_PAYMENT) = Contract.downPayment = (totalDeposit + enganche al firmar)` se cumple para todos los contratos nuevos. Y `Contract.balance = totalPrice - Contract.downPayment`.

## 11. Referencias

- Spec contractual: `/Users/miguelmachuca/Downloads/03 Especificacion Tecnica Detallada.docx` (v1.0, 2026-04-07) — secciones RF1.3 y 7.1.
- Handoff de Chat: `/Users/miguelmachuca/Downloads/CONTEXTO_CHAT_PARA_CODE.md` — secciones "Apartado / reserva" y "Próximo hito".
- Auditoría de código: sesión 2026-05-31, commit base `b98440c`.
- Memoria relevante: `project_centralhub_business_rules.md`, `project_centralhub_spec_gap.md`.
- Código actual relevante:
  - `src/services/contract.service.ts:11-184` (createContract)
  - `src/services/contract.service.ts:362-380` (generateContractNumber)
  - `src/services/lot.service.ts:168-210` (reserveLot)
  - `src/utils/logger.ts` (Winston configurado)
  - `frontend/src/app/(admin)/contratos/[id]/page.tsx:36-48` (PAYMENT_TYPE map)
  - `frontend/src/app/(admin)/nuevo-contrato/page.tsx` (wizard 544L)

---

## Notas sobre este formato (para los siguientes specs del sprint)

Este spec sigue 11 secciones que aplican a casi cualquier tarea backend+frontend del proyecto. Para las próximas tareas (#3 a #7), copiar este archivo, renombrar (`YYYY-MM-DD-<topic>-design.md`) y reescribir el contenido manteniendo las secciones. Lo que vale conservar:

- **Sección 1 (Contexto)** corta — el "qué duele" en máximo 1 párrafo.
- **Sección 2 (Decisiones tomadas)** como tabla — cada decisión + razón. Si una tarea no tiene decisiones interesantes, omitir.
- **Sección 3 (Supuestos e invariantes)** — separar invariantes verificables por sistema vs convenciones humanas.
- **Sección 5 (Flujo de datos)** con ejemplos numéricos concretos siempre que haya dinero, fechas o cálculos. Para tareas puras de UI, sustituir por wireframes ASCII o descripción de estados.
- **Sección 7 (Testing)** — declarar explícitamente qué se prueba unitariamente vs qué queda en QA manual. Evita ambigüedad.
- **Sección 8 (QA manual)** — checklist accionable. Sirve para self-test del desarrollador y para handoff a QA si aplica.
- **Sección 9 (Out of scope)** — proteger contra scope creep durante la implementación. Si algo aparece en el camino, comparar contra esta lista antes de incluirlo.
- **Sección 10 (Criterios de aceptación)** — numerados, verificables. Es la lista de cierre.
