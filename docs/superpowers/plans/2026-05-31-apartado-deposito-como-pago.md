# Anticipo del Apartado como Pago Registrado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando se formaliza un contrato sobre un lote apartado con depósito, el dinero del apartado debe registrarse como Payment tipo `RESERVATION_DEPOSIT` en el historial del contrato, y el `DOWN_PAYMENT` actual se crea solo por el saldo restante del enganche pactado.

**Architecture:** Función pura `computeDepositSplit(lots, downPayment)` exportada desde `contract.service.ts` que calcula el split con rounding a 2 decimales y valida `deposit ≤ enganche` (lanza `DepositExceedsDownPaymentError` si no). `ContractService.createContract` la invoca antes de la transacción y dentro del `prisma.$transaction` crea 0-2 Payments según corresponda, mientras limpia los campos de reserva del Lot al pasarlo a SOLD. Frontend agrega banner informativo en wizard de nuevo contrato y entrada en diccionarios PAYMENT_TYPE de admin y portal cliente.

**Tech Stack:** Node 24, TypeScript 5.5, Express 4, Prisma 5 + PostgreSQL 16, Winston (logger). Frontend Next.js 16 App Router + React 19 + Tailwind 4. **Test runner nuevo**: Vitest (primer setup del proyecto).

**Sin migraciones de schema.** Sin breaking changes en la API pública.

**Autorización de commits**: el usuario NO autoriza commits automáticos. **En cada step de commit, el implementador debe pausar y pedir aprobación explícita al usuario antes de correr `git commit`.**

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `package.json` (root) | Modify | Agregar `vitest` a devDependencies + scripts `test`/`test:watch` |
| `vitest.config.ts` | Create | Config mínima para Vitest |
| `src/utils/errors.ts` | Create | `DepositExceedsDownPaymentError` class |
| `src/services/__tests__/computeDepositSplit.test.ts` | Create | 9 tests TDD |
| `src/services/contract.service.ts` | Modify | Agregar `computeDepositSplit` pure function + integrarlo en `createContract` + limpiar reservation fields + crear hasta 2 Payments |
| `src/controllers/contract.controller.ts` | Modify | Branch `instanceof DepositExceedsDownPaymentError` con HTTP 400 + Winston warn |
| `frontend/src/app/(admin)/nuevo-contrato/page.tsx` | Modify | Banner informativo cuando lote tiene `reservationDeposit > 0` |
| `frontend/src/app/(admin)/contratos/[id]/page.tsx` | Modify | Agregar `RESERVATION_DEPOSIT` al diccionario `PAYMENT_TYPE` |
| `frontend/src/app/(portal)/mis-contratos/[id]/page.tsx` | Modify | Agregar `RESERVATION_DEPOSIT` al diccionario `PAYMENT_TYPE` |

**Total**: 2 nuevos, 7 modificados. Cero migraciones DB.

---

### Task 0: Setup Vitest

**Files:**
- Modify: `/Users/miguelmachuca/Desktop/centralhub/package.json`
- Create: `/Users/miguelmachuca/Desktop/centralhub/vitest.config.ts`

- [ ] **Step 0.1: Instalar Vitest**

```bash
cd /Users/miguelmachuca/Desktop/centralhub
npm i -D vitest
```

Expected: Vitest agregado a `devDependencies` en `package.json`. Sin errores. Verificar con `grep vitest package.json`.

- [ ] **Step 0.2: Crear `vitest.config.ts`**

Contenido exacto del archivo `/Users/miguelmachuca/Desktop/centralhub/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 0.3: Agregar scripts a `package.json`**

En `/Users/miguelmachuca/Desktop/centralhub/package.json`, en el bloque `"scripts"`, agregar después del script `migrate`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Antes del cambio el bloque termina con `"migrate": "tsx src/scripts/migrate-project.ts"`. Después debe quedar con esos dos scripts adicionales, separados por coma según JSON válido.

- [ ] **Step 0.4: Verificar que Vitest corre (sin tests todavía)**

```bash
cd /Users/miguelmachuca/Desktop/centralhub
npm test
```

Expected: Vitest arranca, encuentra 0 archivos de test (`No test files found`), termina con exit code 0 o 1 (cualquiera de los dos es OK por ahora — confirmamos que el binario está instalado y configurado).

- [ ] **Step 0.5: PAUSAR — pedir autorización para commit**

Mensaje al usuario:

> "Hito 0 completo: Vitest instalado y configurado. Cambios: `package.json` (devDependency + scripts), `vitest.config.ts` (nuevo), `package-lock.json` (regenerado). ¿Autorizas el commit?"

Si el usuario aprueba, ejecutar:

```bash
cd /Users/miguelmachuca/Desktop/centralhub
git add package.json package-lock.json vitest.config.ts
git commit -m "$(cat <<'EOF'
chore: setup Vitest as test runner

Primer setup de testing del proyecto. Config mínima:
- vitest.config.ts con environment node y patrón src/**/*.test.ts
- Scripts test y test:watch en package.json
- Sin coverage, sin CI, solo unit tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1: TDD Red — 9 tests fallando para `computeDepositSplit`

**Files:**
- Create: `/Users/miguelmachuca/Desktop/centralhub/src/services/__tests__/computeDepositSplit.test.ts`

- [ ] **Step 1.1: Crear el archivo de tests**

Crear `/Users/miguelmachuca/Desktop/centralhub/src/services/__tests__/computeDepositSplit.test.ts` con este contenido EXACTO:

```ts
import { describe, it, expect } from 'vitest';
import { computeDepositSplit } from '../contract.service';
import { DepositExceedsDownPaymentError } from '../../utils/errors';

// Helper para construir lots fixture mínimos
function lot(opts: {
  id?: string;
  reservationDeposit?: number | null;
  manzana?: number;
  lotNumber?: string;
  reservedAt?: Date | null;
} = {}) {
  return {
    id: opts.id ?? 'lot-' + Math.random().toString(36).slice(2, 8),
    reservationDeposit: opts.reservationDeposit ?? null,
    manzana: opts.manzana ?? 5,
    lotNumber: opts.lotNumber ?? '12',
    reservedAt: opts.reservedAt ?? null,
  };
}

describe('computeDepositSplit', () => {
  it('test 1: reservationDeposit null → totalDeposit 0, remaining = downPayment', () => {
    const result = computeDepositSplit([lot({ reservationDeposit: null })], 25000);
    expect(result.totalDeposit).toBe(0);
    expect(result.downPaymentRemaining).toBe(25000);
    expect(result.depositSources).toEqual([]);
  });

  it('test 2: reservationDeposit 0 → totalDeposit 0, remaining = downPayment', () => {
    const result = computeDepositSplit([lot({ reservationDeposit: 0 })], 25000);
    expect(result.totalDeposit).toBe(0);
    expect(result.downPaymentRemaining).toBe(25000);
    expect(result.depositSources).toEqual([]);
  });

  it('test 3: un lote con depósito < enganche', () => {
    const reservedAt = new Date('2026-04-10');
    const result = computeDepositSplit(
      [lot({ reservationDeposit: 5000, manzana: 5, lotNumber: '12', reservedAt })],
      25000,
    );
    expect(result.totalDeposit).toBe(5000);
    expect(result.downPaymentRemaining).toBe(20000);
    expect(result.depositSources).toHaveLength(1);
    expect(result.depositSources[0]).toEqual({
      lotLabel: 'M5 L-12',
      amount: 5000,
      reservedAt,
    });
  });

  it('test 4: un lote con depósito == enganche → remaining 0', () => {
    const result = computeDepositSplit(
      [lot({ reservationDeposit: 25000, reservedAt: new Date('2026-04-10') })],
      25000,
    );
    expect(result.totalDeposit).toBe(25000);
    expect(result.downPaymentRemaining).toBe(0);
    expect(result.depositSources).toHaveLength(1);
  });

  it('test 5: multi-lote, suma de depósitos < enganche', () => {
    const result = computeDepositSplit(
      [
        lot({ reservationDeposit: 3000, manzana: 5, lotNumber: '12', reservedAt: new Date('2026-04-10') }),
        lot({ reservationDeposit: 2000, manzana: 5, lotNumber: '13', reservedAt: new Date('2026-04-15') }),
      ],
      25000,
    );
    expect(result.totalDeposit).toBe(5000);
    expect(result.downPaymentRemaining).toBe(20000);
    expect(result.depositSources).toHaveLength(2);
  });

  it('test 6: multi-lote mixto (algunos null/0, otros con depósito > 0)', () => {
    const result = computeDepositSplit(
      [
        lot({ reservationDeposit: null, manzana: 5, lotNumber: '12' }),
        lot({ reservationDeposit: 5000, manzana: 5, lotNumber: '13', reservedAt: new Date('2026-04-15') }),
        lot({ reservationDeposit: 0, manzana: 5, lotNumber: '14' }),
      ],
      25000,
    );
    expect(result.totalDeposit).toBe(5000);
    expect(result.downPaymentRemaining).toBe(20000);
    expect(result.depositSources).toHaveLength(1);
    expect(result.depositSources[0].lotLabel).toBe('M5 L-13');
  });

  it('test 7: depósito > enganche → lanza DepositExceedsDownPaymentError', () => {
    expect(() =>
      computeDepositSplit([lot({ reservationDeposit: 30000, reservedAt: new Date('2026-04-10') })], 25000),
    ).toThrow(DepositExceedsDownPaymentError);

    try {
      computeDepositSplit([lot({ reservationDeposit: 30000, reservedAt: new Date('2026-04-10') })], 25000);
    } catch (err) {
      expect(err).toBeInstanceOf(DepositExceedsDownPaymentError);
      const e = err as DepositExceedsDownPaymentError;
      expect(e.code).toBe('DEPOSIT_EXCEEDS_DOWNPAYMENT');
      expect(e.totalDeposit).toBe(30000);
      expect(e.downPayment).toBe(25000);
    }
  });

  it('test 8: decimal — 3,333.33 + 10,000 → remaining exacto 6,666.67 (sin Float trash)', () => {
    const result = computeDepositSplit(
      [lot({ reservationDeposit: 3333.33, reservedAt: new Date('2026-04-10') })],
      10000,
    );
    expect(result.totalDeposit).toBe(3333.33);
    expect(result.downPaymentRemaining).toBe(6666.67); // igualdad exacta, no toBeCloseTo
  });

  it('test 9: multi-lote decimal — 1,111.11 + 2,222.22 + 10,000 → totals exactos', () => {
    const result = computeDepositSplit(
      [
        lot({ reservationDeposit: 1111.11, manzana: 5, lotNumber: '12', reservedAt: new Date('2026-04-10') }),
        lot({ reservationDeposit: 2222.22, manzana: 5, lotNumber: '13', reservedAt: new Date('2026-04-15') }),
      ],
      10000,
    );
    expect(result.totalDeposit).toBe(3333.33);
    expect(result.downPaymentRemaining).toBe(6666.67);
  });
});
```

- [ ] **Step 1.2: Ejecutar y confirmar los 9 fallan**

```bash
cd /Users/miguelmachuca/Desktop/centralhub
npm test
```

Expected output: **9 tests fallidos** con mensajes de tipo:
- `Cannot find module '../contract.service'` exporta `computeDepositSplit` — falla porque la función no existe aún
- `Cannot find module '../../utils/errors'` — falla porque el archivo no existe

Cualquiera de las dos clases de error confirma que los tests están "rojos" por la razón correcta (código no escrito). Si fallaran por otra razón (typo en el test, fixture mal construido), corregir el test ANTES de seguir.

- [ ] **Step 1.3: PAUSAR — pedir autorización para commit**

Mensaje al usuario:

> "Hito 1 completo: 9 tests escritos y confirmados fallando con la razón correcta (function/module no existe). TDD red. ¿Autorizas el commit antes de empezar el green?"

Si aprueba:

```bash
cd /Users/miguelmachuca/Desktop/centralhub
git add src/services/__tests__/computeDepositSplit.test.ts
git commit -m "$(cat <<'EOF'
test: add 9 failing tests for computeDepositSplit (TDD red)

Cubre: deposito null/0, un lote y multi-lote, igualdad con enganche,
mezcla null/0/positivo, validación de excedente, y dos casos decimales
(3,333.33 y 1,111.11 + 2,222.22) que verifican igualdad exacta de Float
post-rounding.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: TDD Green — Implementar `computeDepositSplit` + `DepositExceedsDownPaymentError`

**Files:**
- Create: `/Users/miguelmachuca/Desktop/centralhub/src/utils/errors.ts`
- Modify: `/Users/miguelmachuca/Desktop/centralhub/src/services/contract.service.ts` (agregar export al inicio o final)

- [ ] **Step 2.1: Crear `src/utils/errors.ts`**

Contenido exacto:

```ts
// src/utils/errors.ts
// Custom error classes para distinguir errores de negocio de errores genéricos.

export class DepositExceedsDownPaymentError extends Error {
  readonly code = 'DEPOSIT_EXCEEDS_DOWNPAYMENT' as const;

  constructor(
    public readonly totalDeposit: number,
    public readonly downPayment: number,
  ) {
    super(`Depósito (${totalDeposit}) excede enganche (${downPayment})`);
    this.name = 'DepositExceedsDownPaymentError';
  }
}
```

- [ ] **Step 2.2: Agregar la función pura al inicio de `contract.service.ts`**

En `/Users/miguelmachuca/Desktop/centralhub/src/services/contract.service.ts`, justo después de los imports (línea ~7, antes de `const prisma = new PrismaClient();`), agregar:

```ts
import { DepositExceedsDownPaymentError } from '../utils/errors';

// ────────────────────────────────────────────────────────────────────────────
// computeDepositSplit (pure function — sin Prisma, sin side effects)
// ────────────────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface DepositSplitLot {
  id: string;
  reservationDeposit: number | null;
  manzana: number;
  lotNumber: string;
  reservedAt: Date | null;
}

export interface DepositSplitResult {
  totalDeposit: number;
  downPaymentRemaining: number;
  depositSources: Array<{ lotLabel: string; amount: number; reservedAt: Date }>;
}

export function computeDepositSplit(
  lots: DepositSplitLot[],
  downPayment: number,
): DepositSplitResult {
  const depositSources: DepositSplitResult['depositSources'] = [];
  let rawTotal = 0;

  for (const lot of lots) {
    const deposit = lot.reservationDeposit ?? 0;
    if (deposit > 0) {
      rawTotal += deposit;
      depositSources.push({
        lotLabel: `M${lot.manzana} L-${lot.lotNumber}`,
        amount: round2(deposit),
        reservedAt: lot.reservedAt as Date, // si deposit > 0, reservedAt nunca es null en la práctica
      });
    }
  }

  const totalDeposit = round2(rawTotal);
  const downPaymentRounded = round2(downPayment);

  if (totalDeposit > downPaymentRounded) {
    throw new DepositExceedsDownPaymentError(totalDeposit, downPaymentRounded);
  }

  const downPaymentRemaining = round2(downPaymentRounded - totalDeposit);

  return { totalDeposit, downPaymentRemaining, depositSources };
}
```

**Nota**: el `import { DepositExceedsDownPaymentError } from '../utils/errors';` va junto con los demás imports al inicio del archivo, NO duplicar.

- [ ] **Step 2.3: Ejecutar los tests, confirmar 9 verdes**

```bash
cd /Users/miguelmachuca/Desktop/centralhub
npm test
```

Expected: **9/9 tests passed**, exit code 0.

Si algún test falla:
- Si falla el #8 o #9 con un valor como `6666.670000000001`, el rounding no se aplicó correctamente — revisar que `round2` se invoque en el cálculo de `downPaymentRemaining`.
- Si falla el #7, revisar que el `throw` ocurra cuando `totalDeposit > downPaymentRounded` (NO `>=`).
- Si falla el #6, revisar que la condición sea `deposit > 0` (excluye null y 0).

- [ ] **Step 2.4: PAUSAR — pedir autorización para commit**

Mensaje al usuario:

> "Hito 2 completo: `computeDepositSplit` implementada + `DepositExceedsDownPaymentError`. 9/9 tests pasan en verde. ¿Autorizas el commit?"

Si aprueba:

```bash
cd /Users/miguelmachuca/Desktop/centralhub
git add src/utils/errors.ts src/services/contract.service.ts
git commit -m "$(cat <<'EOF'
feat: add computeDepositSplit pure function + DepositExceedsDownPaymentError

Función pura exportada desde contract.service que calcula el split del
enganche entre depósito de apartado y saldo a pagar al firmar.
Round a 2 decimales para evitar Float trash. Lanza error tipado cuando
el depósito excede el enganche pactado.

9/9 tests TDD pasan.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Orquestación — modificar `createContract` para usar el split

**Files:**
- Modify: `/Users/miguelmachuca/Desktop/centralhub/src/services/contract.service.ts` (función `createContract`, líneas 11-184)

- [ ] **Step 3.1: Leer el código actual de `createContract`**

Antes de modificar, leer `/Users/miguelmachuca/Desktop/centralhub/src/services/contract.service.ts` líneas 11-184 para tener el contexto fresco. Identificar:
- Línea ~31: `const lots = await prisma.lot.findMany(...)` — el snapshot de lots
- Línea ~53-57: cálculo de `totalPrice` y `balance`
- Línea ~60: apertura de `prisma.$transaction`
- Línea ~96-99: `tx.lot.updateMany` que pasa a SOLD pero NO limpia campos de reserva
- Línea ~121-139: bloque `if (contract.downPayment > 0)` que crea el Payment DOWN_PAYMENT

- [ ] **Step 3.2: Insertar invocación a `computeDepositSplit` antes de la transacción**

En `contract.service.ts`, después del bloque que valida `unavailableLots` (línea ~46-48) y ANTES de `generateContractNumber` (línea ~51), insertar:

```ts
    // Calcular split del enganche: depósito de apartado + saldo del enganche
    const depositSplit = computeDepositSplit(lots, data.downPayment);
    // Si depósito > enganche, lanza DepositExceedsDownPaymentError aquí mismo
    // (antes de abrir la transacción, así no tocamos BD).
```

- [ ] **Step 3.3: Modificar el `tx.lot.updateMany` para limpiar campos de reserva**

Reemplazar el bloque actual (líneas ~96-99):

```ts
      // 3. Actualizar estado de lotes a SOLD
      await tx.lot.updateMany({
        where: { id: { in: data.lotIds } },
        data: { status: LotStatus.SOLD },
      });
```

Por:

```ts
      // 3. Actualizar estado de lotes a SOLD + limpiar campos de reserva
      // (los datos del apartado quedan registrados en Payment, no en Lot)
      await tx.lot.updateMany({
        where: { id: { in: data.lotIds } },
        data: {
          status:             LotStatus.SOLD,
          reservedAt:         null,
          reservationExpiry:  null,
          reservationDeposit: null,
          reservedByName:     null,
          reservedByPhone:    null,
          reservedByEmail:    null,
          reservedByAgentId:  null,
        },
      });
```

- [ ] **Step 3.4: Reemplazar el bloque de creación de Payment**

Reemplazar las líneas ~121-139 (el bloque `if (contract.downPayment > 0) { ... }`) por:

```ts
    // Registrar pagos según el split del enganche:
    //   - Si hubo depósito de apartado → Payment tipo RESERVATION_DEPOSIT (fecha = min(reservedAt))
    //   - Si queda saldo del enganche → Payment tipo DOWN_PAYMENT (fecha = startDate)
    let paymentSeq = 0;

    if (depositSplit.totalDeposit > 0) {
      paymentSeq += 1;
      const paymentNumber = `PAY-${contract.codigoLegado}-${String(paymentSeq).padStart(3, '0')}`;
      const earliestReservedAt = depositSplit.depositSources.reduce(
        (min, src) => (src.reservedAt < min ? src.reservedAt : min),
        depositSplit.depositSources[0].reservedAt,
      );
      const conceptParts = depositSplit.depositSources
        .map(s => `${s.lotLabel} ($${s.amount.toLocaleString('es-MX')})`)
        .join('; ');

      await prisma.payment.create({
        data: {
          contractId:    contract.id,
          clientId:      contract.clientId,
          amount:        depositSplit.totalDeposit,
          paymentDate:   earliestReservedAt,
          concept:       `Depósito de apartado: ${conceptParts}`,
          paymentType:   PaymentType.RESERVATION_DEPOSIT,
          paymentMethod: PaymentMethod.TRANSFER,
          status:        PaymentStatus.CONFIRMED,
          paymentNumber,
        },
      });
    }

    if (depositSplit.downPaymentRemaining > 0) {
      paymentSeq += 1;
      const paymentNumber = `PAY-${contract.codigoLegado}-${String(paymentSeq).padStart(3, '0')}`;
      const concept = depositSplit.totalDeposit > 0
        ? 'Enganche (saldo tras aplicar depósito de apartado)'
        : 'Enganche';

      await prisma.payment.create({
        data: {
          contractId:    contract.id,
          clientId:      contract.clientId,
          amount:        depositSplit.downPaymentRemaining,
          paymentDate:   contract.startDate ?? contract.contractDate,
          concept,
          paymentType:   PaymentType.DOWN_PAYMENT,
          paymentMethod: PaymentMethod.TRANSFER,
          status:        PaymentStatus.CONFIRMED,
          paymentNumber,
        },
      });
    }
```

**Nota importante**: el bloque viejo creaba el Payment FUERA de la transacción (`prisma.payment.create` en vez de `tx.payment.create`). El nuevo código mantiene ese patrón actual (fuera de tx). NO mover dentro de la transacción en esta tarea — eso es deuda técnica anotada en el spec (Sección 9), fuera de scope.

- [ ] **Step 3.5: Verificar tipos compilan (TypeScript)**

```bash
cd /Users/miguelmachuca/Desktop/centralhub
npx tsc --noEmit
```

Expected: sin errores de TypeScript. Si hay error de tipo en `depositSplit.depositSources[0].reservedAt` (que `reservedAt` sea `Date | null`), confirmar que `computeDepositSplit` solo agrega entries con `reservedAt` definido. Si el compilador se queja, agregar un assert no-null `as Date` en la línea correspondiente.

- [ ] **Step 3.6: Smoke test manual rápido del endpoint**

Si la BD local está corriendo (`docker-compose up -d`):

```bash
cd /Users/miguelmachuca/Desktop/centralhub
npm run dev
```

En otra terminal, hacer un POST a `/api/v1/contracts` con un payload que use un lote AVAILABLE existente (sin depósito), enganche > 0. Verificar que se crea el contrato y aparece UN Payment tipo DOWN_PAYMENT (igual que antes — comportamiento legacy preservado para lotes sin depósito).

**Si no hay BD corriendo o no hay data lista**, saltar este step y confiar en el QA manual del Task 8.

- [ ] **Step 3.7: PAUSAR — pedir autorización para commit**

Mensaje al usuario:

> "Hito 3 completo: `createContract` ahora usa `computeDepositSplit`, limpia campos de reserva del Lot al pasarlo a SOLD, y crea 0/1/2 Payments según el split. TypeScript compila sin errores. ¿Autorizas el commit?"

Si aprueba:

```bash
cd /Users/miguelmachuca/Desktop/centralhub
git add src/services/contract.service.ts
git commit -m "$(cat <<'EOF'
feat: integrate computeDepositSplit into createContract

- createContract llama computeDepositSplit antes de abrir transacción
- Al pasar lotes a SOLD, limpia campos de reserva (reservedAt, expiry,
  reservationDeposit, reservedBy*). Arregla bug existente donde los
  lotes SOLD conservaban datos del apartado.
- Crea Payment tipo RESERVATION_DEPOSIT cuando hay depósito de apartado,
  con paymentDate = min(reservedAt) y concept con desglose por lote.
- Crea Payment tipo DOWN_PAYMENT solo por el saldo restante del enganche
  (en vez del enganche completo). Si depósito cubre enganche, no se crea.

Sin cambios al schema. Sin breaking changes en la API.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Error handling en el controller

**Files:**
- Modify: `/Users/miguelmachuca/Desktop/centralhub/src/controllers/contract.controller.ts` (método `create`, líneas 11-27)

- [ ] **Step 4.1: Agregar imports al controller**

Al inicio de `/Users/miguelmachuca/Desktop/centralhub/src/controllers/contract.controller.ts`, después del import de `contractService` (línea 4), agregar:

```ts
import { logger } from '../utils/logger';
import { DepositExceedsDownPaymentError } from '../utils/errors';
```

- [ ] **Step 4.2: Modificar el método `create` para branch del error tipado**

Reemplazar las líneas 11-27 (el método `create` completo):

```ts
  // POST /api/v1/contracts
  async create(req: Request, res: Response) {
    try {
      const data: CreateContractDto = req.body;
      const contract = await contractService.createContract(data);

      res.status(201).json({
        success: true,
        message: 'Contrato creado exitosamente',
        data: contract,
      });
    } catch (error: any) {
      if (error instanceof DepositExceedsDownPaymentError) {
        logger.warn('Contract creation rejected: deposit exceeds down payment', {
          clientId:      req.body?.clientId,
          projectId:     req.body?.projectId,
          lotIds:        req.body?.lotIds,
          totalDeposit:  error.totalDeposit,
          downPayment:   error.downPayment,
          agentId:       (req as any).user?.id,
        });
        return res.status(400).json({
          success:      false,
          code:         error.code,
          message:      `El depósito del apartado ($${error.totalDeposit.toLocaleString('es-MX')}) excede el enganche pactado ($${error.downPayment.toLocaleString('es-MX')}). Ajusta el enganche o renegocia el depósito antes de continuar.`,
          totalDeposit: error.totalDeposit,
          downPayment:  error.downPayment,
        });
      }
      res.status(400).json({
        success: false,
        message: error.message || 'Error al crear contrato',
      });
    }
  }
```

- [ ] **Step 4.3: Verificar tipos compilan**

```bash
cd /Users/miguelmachuca/Desktop/centralhub
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4.4: PAUSAR — pedir autorización para commit**

Mensaje al usuario:

> "Hito 4 completo: controller distingue `DepositExceedsDownPaymentError` y responde con `code: 'DEPOSIT_EXCEEDS_DOWNPAYMENT'` + mensaje accionable + logging Winston warn. Otros errores mantienen el handler genérico. ¿Autorizas el commit?"

Si aprueba:

```bash
cd /Users/miguelmachuca/Desktop/centralhub
git add src/controllers/contract.controller.ts
git commit -m "$(cat <<'EOF'
feat: surface DepositExceedsDownPaymentError con HTTP 400 + logging

El controller ahora distingue el error tipado de validación de depósito
y responde con un código de error consumible por el frontend, mensaje
accionable en español, y los montos involucrados. Log warn de Winston
captura clientId, projectId, lotIds, montos y agentId para auditoría.

Otros errores siguen el handler genérico actual.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Banner en el wizard de nuevo contrato

**Files:**
- Modify: `/Users/miguelmachuca/Desktop/centralhub/frontend/src/app/(admin)/nuevo-contrato/page.tsx`

⚠ **Antes de empezar**: el `AGENTS.md` del frontend advierte que Next 16 tiene breaking changes y dice _"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code"_. Para esta tarea solo modificamos JSX y Tailwind dentro de un componente cliente existente — no tocamos APIs de Next (no se usan `headers()`, `cookies()`, `Server Actions`, etc.). No se requiere consultar docs específicos, pero **si en algún momento el implementador necesita agregar un Server Component, una Server Action o cambiar el archivo a 'use server'/'use client', leer `node_modules/next/dist/docs/` primero**.

- [ ] **Step 5.1: Localizar el paso 2 del wizard (Términos del contrato)**

Leer `/Users/miguelmachuca/Desktop/centralhub/frontend/src/app/(admin)/nuevo-contrato/page.tsx` y localizar la sección del paso 2. Buscar con grep el texto del input de enganche o el select del lote:

```bash
grep -n "enganche\|lote\|step.*2\|paso.*2" /Users/miguelmachuca/Desktop/centralhub/frontend/src/app/\(admin\)/nuevo-contrato/page.tsx | head -20
```

Identificar:
- La variable que representa el lote seleccionado (probablemente algo como `selectedLote` o `selectedLot` o un find sobre `lotes`).
- El campo `reservationDeposit` del lote (debe existir según el modelo).
- Dónde se renderiza la sección "Términos" (paso 2 de 3).

- [ ] **Step 5.2: Verificar que `useLotes` devuelve `reservationDeposit` y `reservedAt`**

Leer `/Users/miguelmachuca/Desktop/centralhub/frontend/src/hooks/useLotes.ts` para confirmar el shape del tipo `Lote`. Si `reservationDeposit` o `reservedAt` no están tipados, agregarlos al interface según el modelo de Prisma:

```ts
export interface Lote {
  // ... campos existentes
  reservationDeposit: number | null;
  reservedAt: string | null; // ISO date string desde la API
}
```

- [ ] **Step 5.3: Agregar helpers `formatCurrency` y `formatDate` si no existen**

Si el archivo `nuevo-contrato/page.tsx` ya tiene `formatCurrency` (probable, dado el contexto), reutilizar. Si no, agregar al tope del componente:

```ts
function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
```

- [ ] **Step 5.4: Insertar el banner en el paso 2**

En el JSX del paso 2 (Términos), después de que el lote esté seleccionado y antes del input de enganche, insertar:

```tsx
{selectedLote && (selectedLote.reservationDeposit ?? 0) > 0 && (
  <div
    className="rounded-xl p-4 mb-4 border-l-4"
    style={{
      backgroundColor: 'var(--gold-pale)',
      borderColor: 'var(--gold)',
    }}
  >
    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
      <strong>Depósito de apartado registrado:</strong> este lote tiene{' '}
      <strong>{formatCurrency(selectedLote.reservationDeposit)}</strong> registrado el{' '}
      {formatDate(selectedLote.reservedAt)}. Se aplicará automáticamente al enganche al
      formalizar el contrato.
    </p>
  </div>
)}
```

**Nota**: si el wizard maneja múltiples lotes (`selectedLotes: Lote[]`), reemplazar el bloque por un `.map()` que renderice una línea por cada lote con depósito > 0. El patrón es el mismo, una iteración.

- [ ] **Step 5.5: Manejar el error 400 con `code: DEPOSIT_EXCEEDS_DOWNPAYMENT`**

Localizar la sección del paso 3 (Confirmación) donde se hace el `POST /contracts`. Buscar el `try/catch` del submit. Modificar el catch para detectar el código:

```tsx
} catch (err: any) {
  const apiError = err?.response?.data;
  if (apiError?.code === 'DEPOSIT_EXCEEDS_DOWNPAYMENT') {
    setErrorMessage(apiError.message); // mostrar en banner sobre el botón
    // NO resetear el form. Permitir al usuario volver al paso 2 con todo lleno.
    return;
  }
  // Manejo existente para otros errores (mantener)
  setErrorMessage(apiError?.message || 'Error al crear contrato');
}
```

Si el wizard ya tiene un estado de error visible, reutilizar el mecanismo. Si no, agregar:

```tsx
const [errorMessage, setErrorMessage] = useState<string | null>(null);

// ...y en el JSX del paso 3, sobre el botón Confirmar:
{errorMessage && (
  <div
    className="rounded-xl p-4 mb-4 border-l-4"
    style={{
      backgroundColor: 'var(--danger-bg)',
      borderColor: 'var(--danger)',
      color: 'var(--danger)',
    }}
  >
    <p className="text-sm">{errorMessage}</p>
  </div>
)}
```

- [ ] **Step 5.6: Levantar el frontend y verificar visualmente**

```bash
cd /Users/miguelmachuca/Desktop/centralhub/frontend
npm run dev
```

Navegar a `http://localhost:3000`, login admin, ir a Nuevo Contrato, seleccionar un proyecto. Verificar:
- Si hay un lote apartado con `reservationDeposit > 0`, debe aparecer el banner gold-pale en paso 2.
- Si NO hay lote apartado seleccionado, el banner NO aparece.
- El layout del paso 2 sigue funcional (los inputs de enganche y plazo siguen ahí).

Si no hay datos con depósito en la BD local, este check visual queda postponed al QA del Task 8.

- [ ] **Step 5.7: PAUSAR — pedir autorización para commit**

Mensaje al usuario:

> "Hito 5 completo: banner gold-pale agregado al wizard paso 2 cuando el lote tiene depósito de apartado; manejo del error 400 `DEPOSIT_EXCEEDS_DOWNPAYMENT` en el submit del paso 3 sin perder estado del form. ¿Autorizas el commit?"

Si aprueba:

```bash
cd /Users/miguelmachuca/Desktop/centralhub
git add frontend/src/app/\(admin\)/nuevo-contrato/page.tsx frontend/src/hooks/useLotes.ts
git commit -m "$(cat <<'EOF'
feat(wizard): banner de depósito de apartado + manejo de error 400

- Paso 2: banner informativo gold-pale cuando el lote seleccionado tiene
  reservationDeposit > 0, indicando monto y fecha del apartado.
- Paso 3: si el backend responde 400 con code DEPOSIT_EXCEEDS_DOWNPAYMENT,
  muestra mensaje accionable sin resetear el form (3 pasos preservados).
- Tipos Lote actualizados para incluir reservationDeposit y reservedAt.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: PAYMENT_TYPE map en admin contratos/[id]

**Files:**
- Modify: `/Users/miguelmachuca/Desktop/centralhub/frontend/src/app/(admin)/contratos/[id]/page.tsx` (líneas 36-48)

- [ ] **Step 6.1: Localizar y modificar el diccionario PAYMENT_TYPE**

Leer las líneas 36-48 de `/Users/miguelmachuca/Desktop/centralhub/frontend/src/app/(admin)/contratos/[id]/page.tsx`. Encontrar:

```ts
const PAYMENT_TYPE: Record<string, string> = {
  ENGANCHE:        'Enganche',
  MENSUALIDAD:     'Mensualidad',
  ABONO:           'Abono',
  LIQUIDACION:     'Liquidación',
  OTRO:            'Otro',
  DOWN_PAYMENT:    'Enganche',
  INSTALLMENT:     'Mensualidad',
  PARTIAL_PAYMENT: 'Abono parcial',
  FULL_PAYMENT:    'Liquidación total',
  LATE_FEE:        'Recargo por mora',
  DISCOUNT:        'Descuento',
};
```

Agregar la entrada `RESERVATION_DEPOSIT` justo después de `DOWN_PAYMENT`:

```ts
const PAYMENT_TYPE: Record<string, string> = {
  ENGANCHE:            'Enganche',
  MENSUALIDAD:         'Mensualidad',
  ABONO:               'Abono',
  LIQUIDACION:         'Liquidación',
  OTRO:                'Otro',
  DOWN_PAYMENT:        'Enganche',
  RESERVATION_DEPOSIT: 'Depósito de apartado',
  INSTALLMENT:         'Mensualidad',
  PARTIAL_PAYMENT:     'Abono parcial',
  FULL_PAYMENT:        'Liquidación total',
  LATE_FEE:            'Recargo por mora',
  DISCOUNT:            'Descuento',
};
```

- [ ] **Step 6.2: PAUSAR — pedir autorización para commit**

Mensaje al usuario:

> "Hito 6 completo: `RESERVATION_DEPOSIT` agregado al diccionario PAYMENT_TYPE de admin/contratos/[id]. El historial de pagos ahora muestra 'Depósito de apartado' en lugar del enum crudo. ¿Autorizas el commit?"

Si aprueba:

```bash
cd /Users/miguelmachuca/Desktop/centralhub
git add frontend/src/app/\(admin\)/contratos/\[id\]/page.tsx
git commit -m "$(cat <<'EOF'
feat(admin): traducir RESERVATION_DEPOSIT en historial de pagos

Agrega entrada al diccionario PAYMENT_TYPE para que los Payments tipo
RESERVATION_DEPOSIT muestren 'Depósito de apartado' en lugar del enum.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: PAYMENT_TYPE map en portal mis-contratos/[id]

**Files:**
- Modify: `/Users/miguelmachuca/Desktop/centralhub/frontend/src/app/(portal)/mis-contratos/[id]/page.tsx` (línea 76-77)

🔴 **Crítico para UX del cliente final**: si esto se omite, el cliente B2C verá literalmente `RESERVATION_DEPOSIT` en su estado de cuenta. Must-do.

- [ ] **Step 7.1: Modificar el diccionario PAYMENT_TYPE del portal**

Leer línea 76 en adelante de `/Users/miguelmachuca/Desktop/centralhub/frontend/src/app/(portal)/mis-contratos/[id]/page.tsx`. Verificar el bloque actual:

```ts
const PAYMENT_TYPE: Record<string, string> = {
  DOWN_PAYMENT:  'Enganche',
  // ... posiblemente más entradas
};
```

Agregar `RESERVATION_DEPOSIT: 'Depósito de apartado'` al diccionario. Si el diccionario es más corto que el del admin, mantener la simetría agregando solo esa entrada nueva.

- [ ] **Step 7.2: Verificar visualmente con un cliente logueado**

Si hay un cliente con contrato y depósito en BD:
1. Login en el portal cliente con sus credenciales
2. Abrir `/mis-contratos/[id]`
3. Verificar que el Payment de apartado aparece como **"Depósito de apartado"**, no como `RESERVATION_DEPOSIT`

Si no hay data lista, el check queda en el QA del Task 8.

- [ ] **Step 7.3: PAUSAR — pedir autorización para commit**

Mensaje al usuario:

> "Hito 7 completo: `RESERVATION_DEPOSIT` traducido en el portal cliente también. El cliente B2C verá 'Depósito de apartado' en su historial. ¿Autorizas el commit?"

Si aprueba:

```bash
cd /Users/miguelmachuca/Desktop/centralhub
git add frontend/src/app/\(portal\)/mis-contratos/\[id\]/page.tsx
git commit -m "$(cat <<'EOF'
feat(portal): traducir RESERVATION_DEPOSIT en estado de cuenta del cliente

Misma traducción que en admin para mantener consistencia. El cliente B2C
verá 'Depósito de apartado' en lugar del enum crudo cuando consulte su
historial de pagos.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: QA manual — Verificación end-to-end

**Files:**
- Sin cambios de código. Solo verificación.

**Pre-requisito**: backend (`npm run dev` en root) y frontend (`cd frontend && npm run dev`) corriendo. PostgreSQL accesible (`docker-compose up -d`).

- [ ] **Step 8.1: Crear apartado de prueba**

1. Login en admin (`http://localhost:3000`).
2. Ir a Lotes (`/lotes`).
3. Click sobre un lote AVAILABLE.
4. Click "Apartar".
5. Llenar: nombre, teléfono, email, **deposit = 5000**.
6. Submit. Confirmar que el lote pasa a RESERVED.

Anotar el `lotId` (puede leerse de la URL o de la respuesta de red).

- [ ] **Step 8.2: Formalizar el contrato con ese lote**

1. Ir a Nuevo Contrato (`/nuevo-contrato`).
2. Paso 1: llenar datos del cliente (o usar un cliente existente).
3. Paso 2: seleccionar el proyecto y luego el lote apartado del Step 8.1.
4. **Verificar visualmente**: aparece el banner gold-pale con el monto $5,000.00 y la fecha del apartado.
5. Llenar enganche = **25000**, plazo 60 meses.
6. Paso 3: revisar el resumen y submitear.
7. Confirmar que redirige a `/contratos/[id]` del contrato recién creado (K###).

- [ ] **Step 8.3: Verificar el historial de pagos en admin**

En `/contratos/[id]`:
- [ ] La sección "Historial de pagos" muestra **DOS** entradas:
  - Una con texto **"Depósito de apartado"** y monto $5,000.00, fecha = fecha del apartado.
  - Otra con texto **"Enganche"** (puede decir "Enganche (saldo tras aplicar depósito de apartado)" según el ancho de la columna) y monto $20,000.00, fecha = startDate del contrato.
- [ ] La suma de ambos = $25,000 = el enganche pactado.

- [ ] **Step 8.4: Verificar el portal cliente**

1. Logout del admin.
2. Login en el portal cliente con el email del cliente del contrato y la contraseña temporal generada (4 letras del lastName + 4 últimos del phone).
3. Abrir `/mis-contratos/[id]`.
4. **Verificar**: los dos Payments aparecen con texto humano legible. **No debe verse "RESERVATION_DEPOSIT" en ningún lado.**

- [ ] **Step 8.5: Verificar el estado del Lot en BD**

```bash
cd /Users/miguelmachuca/Desktop/centralhub
npx prisma studio
```

Abrir tabla `lots`, buscar el lote del Step 8.1. Verificar:
- `status` = `SOLD`
- `reservationDeposit` = `null`
- `reservedAt` = `null`
- `reservedByName` = `null`
- `reservedByPhone` = `null`
- `reservedByEmail` = `null`
- `reservedByAgentId` = `null`

- [ ] **Step 8.6: Caso decimal**

Repetir Step 8.1 con deposit = **3333.33**, luego Step 8.2 con enganche = **10000**.

En `/contratos/[id]` verificar:
- Payment RESERVATION_DEPOSIT: **$3,333.33** (sin Float trash en la UI)
- Payment DOWN_PAYMENT: **$6,666.67** (sin `$6,666.669999...`)

Si aparece Float trash, revisar `computeDepositSplit` — el `round2` no se está aplicando correctamente al `downPaymentRemaining`.

- [ ] **Step 8.7: Caso de rechazo (depósito > enganche)**

1. Crear un nuevo apartado con deposit = **25000**.
2. Intentar formalizar contrato con enganche = **20000**.
3. **Verificar**: el wizard muestra un banner de error rojo sobre el botón "Confirmar contrato" con texto del tipo `"El depósito del apartado ($25,000) excede el enganche pactado ($20,000). Ajusta el enganche o renegocia el depósito antes de continuar."`.
4. **Verificar**: el form NO se resetea. Los 3 pasos siguen llenos. El agente puede volver al paso 2, cambiar el enganche a 30000, regresar al paso 3, y submitear de nuevo exitosamente.

- [ ] **Step 8.8: Verificar log de Winston**

```bash
cd /Users/miguelmachuca/Desktop/centralhub
tail -20 logs/combined.log
```

Buscar una línea de tipo:

```
2026-05-31 HH:MM:SS warn: Contract creation rejected: deposit exceeds down payment {"clientId":"...","projectId":"...","lotIds":["..."],"totalDeposit":25000,"downPayment":20000,"agentId":"..."}
```

correspondiente al intento del Step 8.7.

- [ ] **Step 8.9: Sign-off final**

Si los 8 steps de QA pasaron, marcar la tarea #2 del sprint como completa. Reportar al usuario:

> "QA manual completo. Todos los checks pasaron. Tarea #2 'Anticipo del apartado como pago registrado' lista para mergear/cerrar. Resumen:
> - 9/9 unit tests en verde
> - Vitest configurado como nuevo test runner del proyecto
> - 8 commits chicos en main (asumiendo trabajo directo) o en feature branch (recomendado)
> - QA end-to-end verificado en BD local
> - Spec, plan y código sincronizados"

Si algún step del QA falló, **detener** y reportar al usuario con detalle: qué step falló, qué se observó vs esperado, qué hipótesis tenemos del root cause.

---

## Criterios globales de aceptación

(Espejo de Sección 10 del spec. La implementación se considera completa cuando los 7 son `true`.)

1. [ ] `npm test` pasa con los 9 tests de `computeDepositSplit`.
2. [ ] QA Steps 8.1-8.3 pasan: crear apartado + formalizar = dos Payments correctos.
3. [ ] QA Step 8.4 pasa: portal cliente muestra "Depósito de apartado", no enum.
4. [ ] QA Step 8.2 verifica: banner gold-pale aparece en wizard.
5. [ ] QA Step 8.7 pasa: error 400 + wizard preserva estado.
6. [ ] QA Step 8.5 pasa: Lot SOLD tiene campos de reserva limpios.
7. [ ] QA Step 8.6 pasa: invariante `SUM(Payments) = Contract.downPayment` verificable.

---

## Notas para el implementador

- **No autorización para commits**: el plan asume que NO hay autorización pre-aprobada. **Cada paso de commit del plan dice "PAUSAR — pedir autorización"**. Respetar esto: ningún `git commit` se ejecuta sin que el usuario lo apruebe explícitamente en ese momento. Esto es deliberado: el usuario quiere revisar cada hito antes de que entre al historial.
- **Si un step falla**, NO seguir al siguiente. Detenerse, reportar al usuario qué se observó vs lo esperado, y esperar instrucciones. NO intentes "arreglar y seguir" sin checkpoint.
- **Frontend Next 16**: si aparece la necesidad de tocar APIs específicas de Next (Server Actions, Server Components, headers/cookies, middleware), pausar y leer primero `/Users/miguelmachuca/Desktop/centralhub/frontend/node_modules/next/dist/docs/` antes de codear.
- **TypeScript estricto**: después de cada cambio backend, correr `npx tsc --noEmit`. Después de cada cambio frontend, dejar que `npm run dev` reporte errores en runtime.
- **Sin scope creep**: la deuda técnica registrada en la Sección 9 del spec (race conditions, cuotas fuera de transacción, etc.) está **explícitamente fuera de scope** para esta tarea. Si el implementador identifica un fix tentador, anotarlo en una lista aparte para una tarea futura. No incluir en esta.
