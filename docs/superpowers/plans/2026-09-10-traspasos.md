# Traspasos y dinero retenido — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Registrar en CentralHub que un lote cambió de dueño —con el dinero que se le respeta al cliente que se va— y mostrarle al administrador cuánto dinero quedó retenido por traspasos y cancelaciones.

**Architecture:** Un registro `Traspaso` es el acta del movimiento. El sistema deduce la forma (cambio de titular vs. reubicación) del destino que se elija, no se la pregunta a la secretaria. Los pagos del contrato origen NUNCA se tocan: el dinero que se respeta entra como UN pago nuevo en el destino, y la diferencia queda explicada en el acta. El bucket de dinero retenido es una vista derivada de los pagos y las actas, no un saldo guardado.

**Tech Stack:** Express + Prisma + PostgreSQL, Next.js 15 (App Router), vitest, deploy en Railway.

**Spec:** `docs/superpowers/specs/2026-09-10-traspasos-design.md`

## Global Constraints

- **Los pagos existentes son inmutables.** Nunca crear movimientos negativos sobre el contrato origen ni editar sus `Payment`. Los recibos tienen folio y validación pública (`ReciboLog`, `/validar/:id`): alterarlos volvería mentira un documento ya entregado.
- **Toda lógica de negocio va en funciones puras** bajo `src/services/lib/`, con su test en `src/services/lib/__tests__/`. Los servicios con Prisma orquestan; no deciden.
- **Todo cambio de datos va en una transacción** (`prisma.$transaction`), releyendo dentro lo que valida.
- **El `userId` sale del token** (`req.user!.userId`), nunca del body.
- **Dinero:** `Float` con `round2()` de `src/utils/money`, igual que el resto del sistema.
- **Comentarios y mensajes de usuario en español.** Los comentarios explican POR QUÉ, no qué.
- **Correr `npx vitest run` y `npx tsc --noEmit` antes de cada commit.** Ambos deben pasar.
- El proyecto tiene **429 tests** al inicio de este plan; ese número solo debe subir.

---

### Task 1: Esquema de datos

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260911040000_add_traspasos/migration.sql`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: modelo `Traspaso`, enum `TraspasoTipo { CAMBIO_TITULAR, REUBICACION }`, valor `TRASPASADO` en `ContractStatus`, valor `TRASPASO_ENTRADA` en `PaymentType`, campo `Payment.traspasoId`.

- [ ] **Step 1: Agregar el enum y el modelo al schema**

En `prisma/schema.prisma`, junto al bloque de contratos:

```prisma
// ============================================================================
// TRASPASOS — un lote cambia de manos
//
// El acta del movimiento. Existe porque hasta ahora esto se resolvía editando
// el cliente a mano o cancelando por SQL, y el dinero que el cliente anterior
// había abonado desaparecía sin explicación.
// ============================================================================

enum TraspasoTipo {
  CAMBIO_TITULAR   // mismo lote y proyecto: el contrato sigue, cambia el dueño
  REUBICACION      // otro lote u otro proyecto: se cierra uno y se abre otro
}

model Traspaso {
  id                String       @id @default(uuid())
  numero            Int          @unique
  fecha             DateTime
  tipo              TraspasoTipo

  contratoOrigenId  String       @map("contrato_origen_id")
  contratoDestinoId String?      @map("contrato_destino_id")  // null en CAMBIO_TITULAR

  clienteAnteriorId String       @map("cliente_anterior_id")
  clienteNuevoId    String       @map("cliente_nuevo_id")

  montoAbonado      Float        @map("monto_abonado")    // lo que el origen tenía pagado
  montoRespetado    Float        @map("monto_respetado")  // lo que se le reconoce

  motivo            String?
  // Obligatoria si montoRespetado <> montoAbonado: sin ella el dinero que no
  // pasó quedaría sin explicación.
  nota              String?
  documentoUrl      String?      @map("documento_url")

  createdById       String       @map("created_by_id")
  createdAt         DateTime     @default(now()) @map("created_at")

  contratoOrigen    Contract     @relation("TraspasoOrigen",  fields: [contratoOrigenId],  references: [id])
  contratoDestino   Contract?    @relation("TraspasoDestino", fields: [contratoDestinoId], references: [id])
  clienteAnterior   Client       @relation("TraspasoAnterior", fields: [clienteAnteriorId], references: [id])
  clienteNuevo      Client       @relation("TraspasoNuevo",    fields: [clienteNuevoId],    references: [id])
  createdBy         User         @relation("TraspasoCreatedBy", fields: [createdById], references: [id])
  payments          Payment[]

  @@index([contratoOrigenId])
  @@index([fecha])
  @@map("traspasos")
}
```

- [ ] **Step 2: Agregar los valores a los enums existentes**

En `enum ContractStatus`, después de `RESCISSION`:

```prisma
  // El lote pasó a otro dueño. Distinto de CANCELED: aquí no se deshizo la
  // venta, cambió de manos.
  TRASPASADO
```

En `enum PaymentType`, después de `RESERVATION_DEPOSIT`:

```prisma
  // Dinero que venía de otro contrato al traspasarse. No es un cobro nuevo:
  // ya había entrado a caja cuando el cliente anterior pagó.
  TRASPASO_ENTRADA
```

- [ ] **Step 3: Agregar la relación en Payment, Contract, Client y User**

En `model Payment`, junto a `corteDiarioId`:

```prisma
  // Traspaso del que proviene este abono (solo en TRASPASO_ENTRADA).
  traspasoId        String?       @map("traspaso_id")
  traspaso          Traspaso?     @relation(fields: [traspasoId], references: [id])
```

y agregar `@@index([traspasoId])` junto a los otros índices de `Payment`.

En `model Contract`, junto a las otras relaciones:

```prisma
  traspasosOrigen   Traspaso[]    @relation("TraspasoOrigen")
  traspasosDestino  Traspaso[]    @relation("TraspasoDestino")
```

En `model Client`:

```prisma
  traspasosComoAnterior Traspaso[] @relation("TraspasoAnterior")
  traspasosComoNuevo    Traspaso[] @relation("TraspasoNuevo")
```

En `model User`:

```prisma
  traspasosCreados  Traspaso[]    @relation("TraspasoCreatedBy")
```

- [ ] **Step 4: Validar el schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 5: Escribir la migración a mano**

Crear `prisma/migrations/20260911040000_add_traspasos/migration.sql`:

```sql
-- Traspasos: un lote cambia de manos.
-- TRASPASADO es distinto de CANCELED: la venta no se deshizo, cambió de dueño.

CREATE TYPE "TraspasoTipo" AS ENUM ('CAMBIO_TITULAR', 'REUBICACION');

ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'TRASPASADO';
ALTER TYPE "PaymentType"    ADD VALUE IF NOT EXISTS 'TRASPASO_ENTRADA';

CREATE TABLE "traspasos" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "tipo" "TraspasoTipo" NOT NULL,
    "contrato_origen_id" TEXT NOT NULL,
    "contrato_destino_id" TEXT,
    "cliente_anterior_id" TEXT NOT NULL,
    "cliente_nuevo_id" TEXT NOT NULL,
    "monto_abonado" DOUBLE PRECISION NOT NULL,
    "monto_respetado" DOUBLE PRECISION NOT NULL,
    "motivo" TEXT,
    "nota" TEXT,
    "documento_url" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "traspasos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "traspasos_numero_key" ON "traspasos"("numero");
CREATE INDEX "traspasos_contrato_origen_id_idx" ON "traspasos"("contrato_origen_id");
CREATE INDEX "traspasos_fecha_idx" ON "traspasos"("fecha");

ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_contrato_origen_id_fkey"
    FOREIGN KEY ("contrato_origen_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_contrato_destino_id_fkey"
    FOREIGN KEY ("contrato_destino_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_cliente_anterior_id_fkey"
    FOREIGN KEY ("cliente_anterior_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_cliente_nuevo_id_fkey"
    FOREIGN KEY ("cliente_nuevo_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD COLUMN "traspaso_id" TEXT;
CREATE INDEX "payments_traspaso_id_idx" ON "payments"("traspaso_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_traspaso_id_fkey"
    FOREIGN KEY ("traspaso_id") REFERENCES "traspasos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 6: Generar el cliente y verificar que compila**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add prisma/
git commit -m "feat(traspasos): modelo Traspaso y estatus TRASPASADO

Un lote que cambia de manos no tenía dónde registrarse: se resolvía editando
el cliente a mano o cancelando por SQL, y el dinero del cliente anterior
desaparecía sin explicación.

TRASPASADO es distinto de CANCELED: la venta no se deshizo, cambió de dueño.
Payment.traspasoId liga el abono que viaja al contrato destino con el acta que
lo explica."
```

---

### Task 2: Reglas del traspaso (lógica pura)

**Files:**
- Create: `src/services/lib/traspaso.ts`
- Test: `src/services/lib/__tests__/traspaso.test.ts`

**Interfaces:**
- Consumes: `TraspasoTipo` de `@prisma/client` (Task 1).
- Produces:
  - `deducirTipo(origen: LoteRef, destino: LoteRef): TraspasoTipo`
  - `validarTraspaso(input: ValidarInput): string | null`
  - `interface LoteRef { projectId: string; lotIds: string[] }`
  - `interface ValidarInput { montoAbonado: number; montoRespetado: number; nota?: string; estadoOrigen: string; estadoLoteDestino?: string; mismoLote: boolean }`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/services/lib/__tests__/traspaso.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { deducirTipo, validarTraspaso } from '../traspaso';

describe('deducirTipo — la forma sale del destino, no se le pregunta a nadie', () => {
  it('mismo proyecto y mismo lote: cambia el titular', () => {
    expect(deducirTipo(
      { projectId: 'p1', lotIds: ['l1'] },
      { projectId: 'p1', lotIds: ['l1'] },
    )).toBe('CAMBIO_TITULAR');
  });

  it('mismo proyecto pero otro lote: es reubicación', () => {
    expect(deducirTipo(
      { projectId: 'p1', lotIds: ['l1'] },
      { projectId: 'p1', lotIds: ['l2'] },
    )).toBe('REUBICACION');
  });

  it('otro proyecto: es reubicación aunque el lote se llame igual', () => {
    expect(deducirTipo(
      { projectId: 'p1', lotIds: ['l1'] },
      { projectId: 'p2', lotIds: ['l1'] },
    )).toBe('REUBICACION');
  });

  it('los mismos lotes en otro orden siguen siendo el mismo lote', () => {
    expect(deducirTipo(
      { projectId: 'p1', lotIds: ['l1', 'l2'] },
      { projectId: 'p1', lotIds: ['l2', 'l1'] },
    )).toBe('CAMBIO_TITULAR');
  });

  it('conservar solo una parte de los lotes es reubicación', () => {
    // Caso D073: compró 3, se queda con 1.
    expect(deducirTipo(
      { projectId: 'p1', lotIds: ['l1', 'l2', 'l3'] },
      { projectId: 'p1', lotIds: ['l1'] },
    )).toBe('REUBICACION');
  });
});

describe('validarTraspaso', () => {
  const base = {
    montoAbonado: 40000, montoRespetado: 40000,
    estadoOrigen: 'ACTIVE', estadoLoteDestino: 'AVAILABLE', mismoLote: false,
  };

  it('acepta un traspaso que respeta todo lo abonado', () => {
    expect(validarTraspaso(base)).toBeNull();
  });

  it('acepta respetar menos, si viene la nota', () => {
    expect(validarTraspaso({ ...base, montoRespetado: 10000, nota: 'Solo el enganche' })).toBeNull();
  });

  it('EXIGE nota cuando no se respeta todo', () => {
    expect(validarTraspaso({ ...base, montoRespetado: 10000 })).toMatch(/nota/i);
    expect(validarTraspaso({ ...base, montoRespetado: 10000, nota: '   ' })).toMatch(/nota/i);
  });

  it('no se puede respetar más de lo que el cliente pagó', () => {
    expect(validarTraspaso({ ...base, montoRespetado: 50000, nota: 'x' })).toMatch(/más de lo abonado/i);
  });

  it('el monto respetado no puede ser negativo', () => {
    expect(validarTraspaso({ ...base, montoRespetado: -1, nota: 'x' })).toMatch(/negativo/i);
  });

  it('respetar cero es válido, con nota', () => {
    expect(validarTraspaso({ ...base, montoRespetado: 0, nota: 'No se le respeta nada' })).toBeNull();
  });

  it('un contrato ya traspasado no se traspasa otra vez', () => {
    expect(validarTraspaso({ ...base, estadoOrigen: 'TRASPASADO' })).toMatch(/ya fue traspasado/i);
  });

  it('un contrato cancelado o rescindido tampoco', () => {
    expect(validarTraspaso({ ...base, estadoOrigen: 'CANCELED' })).toMatch(/cancelado o rescindido/i);
    expect(validarTraspaso({ ...base, estadoOrigen: 'RESCISSION' })).toMatch(/cancelado o rescindido/i);
  });

  it('el lote destino debe estar disponible', () => {
    expect(validarTraspaso({ ...base, estadoLoteDestino: 'SOLD' })).toMatch(/disponible/i);
  });

  it('en cambio de titular el lote destino es el mismo, así que no se exige disponible', () => {
    expect(validarTraspaso({ ...base, estadoLoteDestino: 'SOLD', mismoLote: true })).toBeNull();
  });

  it('los centavos de punto flotante no disparan la nota obligatoria', () => {
    expect(validarTraspaso({ ...base, montoRespetado: 40000.004 })).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/services/lib/__tests__/traspaso.test.ts`
Expected: FAIL — `Failed to resolve import "../traspaso"`

- [ ] **Step 3: Escribir la implementación mínima**

Crear `src/services/lib/traspaso.ts`:

```typescript
/**
 * Reglas del traspaso — lógica PURA (sin Prisma), para probarlas sin base.
 *
 * La forma del traspaso NO se le pregunta a la secretaria: se deduce del
 * destino que eligió. Ella captura a dónde va el cliente; si resulta ser el
 * mismo lote en el mismo proyecto, es un cambio de titular, y si no, hay que
 * cerrar un contrato y abrir otro. Un solo flujo en pantalla, dos
 * comportamientos por debajo.
 */
import { TraspasoTipo } from '@prisma/client';
import { round2 } from '../../utils/money';

export interface LoteRef {
  projectId: string;
  lotIds: string[];
}

export function deducirTipo(origen: LoteRef, destino: LoteRef): TraspasoTipo {
  if (origen.projectId !== destino.projectId) return TraspasoTipo.REUBICACION;
  const a = [...origen.lotIds].sort().join('|');
  const b = [...destino.lotIds].sort().join('|');
  return a === b ? TraspasoTipo.CAMBIO_TITULAR : TraspasoTipo.REUBICACION;
}

export interface ValidarInput {
  montoAbonado: number;
  montoRespetado: number;
  nota?: string;
  estadoOrigen: string;
  estadoLoteDestino?: string;
  mismoLote: boolean;
}

/** Mensaje de error, o null si el traspaso es válido. */
export function validarTraspaso(f: ValidarInput): string | null {
  if (f.estadoOrigen === 'TRASPASADO') return 'Este contrato ya fue traspasado';
  if (f.estadoOrigen === 'CANCELED' || f.estadoOrigen === 'RESCISSION') {
    return 'Este contrato está cancelado o rescindido: no se puede traspasar';
  }

  const respetado = round2(f.montoRespetado);
  const abonado = round2(f.montoAbonado);
  if (!Number.isFinite(respetado) || respetado < 0) {
    return 'El monto que se respeta no puede ser negativo';
  }
  // Medio peso de tolerancia: los centavos de punto flotante no son una
  // diferencia real y no deben disparar la nota obligatoria.
  if (respetado > abonado + 0.5) {
    return 'No se puede respetar más de lo abonado por el cliente';
  }
  if (abonado - respetado >= 0.5 && !f.nota?.trim()) {
    return 'No se respeta todo lo abonado: explica en la nota a qué se debe';
  }

  // En un cambio de titular el lote destino ES el de origen, y está vendido
  // justamente porque este contrato lo tiene.
  if (!f.mismoLote && f.estadoLoteDestino && f.estadoLoteDestino !== 'AVAILABLE') {
    return 'El lote destino no está disponible';
  }
  return null;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/services/lib/__tests__/traspaso.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npx vitest run
git add src/services/lib/traspaso.ts src/services/lib/__tests__/traspaso.test.ts
git commit -m "feat(traspasos): reglas puras del traspaso

deducirTipo saca la forma del destino elegido en vez de preguntársela a la
secretaria: mismo lote y proyecto es cambio de titular, cualquier otra cosa es
reubicación. Así la pantalla tiene un solo flujo.

La nota es obligatoria cuando no se respeta todo lo abonado, con medio peso de
tolerancia para que los centavos de punto flotante no la disparen."
```

---

### Task 3: Servicio de traspasos

**Files:**
- Create: `src/services/traspaso.service.ts`
- Test: `src/services/__tests__/traspasoService.test.ts`

**Interfaces:**
- Consumes: `deducirTipo`, `validarTraspaso` de `src/services/lib/traspaso` (Task 2).
- Produces: `traspasoService.crear(input: CrearTraspasoInput)`, `traspasoService.listar()`, `traspasoService.obtener(id: string)`.
- `CrearTraspasoInput = { contratoOrigenId: string; clienteNuevoId: string; lotIdsDestino: string[]; projectIdDestino: string; montoRespetado: number; fecha?: Date; motivo?: string; nota?: string; documentoUrl?: string; userId: string; datosContratoDestino?: { totalPrice: number; downPayment: number; installmentAmount: number; installmentCount: number; startDate: Date } }`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/services/__tests__/traspasoService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    contract: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    contractLot: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    lot: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    payment: { aggregate: vi.fn(), create: vi.fn() },
    cuota: { deleteMany: vi.fn() },
    traspaso: { findFirst: vi.fn(), create: vi.fn() },
  };
  const prisma = {
    contract: { findUnique: vi.fn() },
    traspaso: { findMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  };
  return { prisma, tx };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mocks.prisma; }),
  TraspasoTipo: { CAMBIO_TITULAR: 'CAMBIO_TITULAR', REUBICACION: 'REUBICACION' },
  ContractStatus: { ACTIVE: 'ACTIVE', IN_MORA: 'IN_MORA', CANCELED: 'CANCELED', RESCISSION: 'RESCISSION', TRASPASADO: 'TRASPASADO' },
  PaymentType: { TRASPASO_ENTRADA: 'TRASPASO_ENTRADA' },
  PaymentMethod: { CASH: 'CASH', TRANSFER: 'TRANSFER' },
  PaymentStatus: { CONFIRMED: 'CONFIRMED' },
  LotStatus: { AVAILABLE: 'AVAILABLE', SOLD: 'SOLD' },
  CuotaStatus: { PENDIENTE: 'PENDIENTE', PAGADA: 'PAGADA' },
}));

import traspasoService from '../traspaso.service';

const ORIGEN = {
  id: 'c-origen', contractNumber: 'E024', codigoLegado: 'E024', status: 'ACTIVE',
  clientId: 'cli-1', projectId: 'p-vdb', balance: 612987,
  lots: [{ lotId: 'lote-a' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.contract.findUnique.mockResolvedValue(ORIGEN);
  mocks.tx.contract.findUnique.mockResolvedValue(ORIGEN);
  mocks.tx.contractLot.findMany.mockResolvedValue([{ lotId: 'lote-a' }]);
  mocks.tx.lot.findMany.mockResolvedValue([{ id: 'lote-b', status: 'AVAILABLE', projectId: 'p-mon2' }]);
  mocks.tx.payment.aggregate.mockResolvedValue({ _sum: { amount: 40000 } });
  mocks.tx.traspaso.findFirst.mockResolvedValue({ numero: 6 });
  mocks.tx.traspaso.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'tr-1', ...data }));
  mocks.tx.contract.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'c-destino', ...data }));
  mocks.tx.contract.update.mockImplementation(({ data }: any) => Promise.resolve(data));
  mocks.tx.payment.create.mockImplementation(({ data }: any) => Promise.resolve(data));
  mocks.tx.contract.findMany.mockResolvedValue([]);
});

const baseInput = {
  contratoOrigenId: 'c-origen',
  clienteNuevoId: 'cli-2',
  lotIdsDestino: ['lote-b'],
  projectIdDestino: 'p-mon2',
  montoRespetado: 10000,
  nota: 'Se acordó respetar solo el enganche',
  userId: 'u-admin',
  datosContratoDestino: {
    totalPrice: 260000, downPayment: 0, installmentAmount: 4167,
    installmentCount: 60, startDate: new Date('2026-06-01'),
  },
};

describe('crear — reubicación (otro proyecto)', () => {
  it('numera consecutivo y guarda lo abonado y lo respetado', async () => {
    const t = await traspasoService.crear(baseInput);
    expect(t).toMatchObject({
      numero: 7, tipo: 'REUBICACION',
      montoAbonado: 40000, montoRespetado: 10000,
    });
  });

  it('NO toca los pagos del contrato origen: solo crea el abono en el destino', async () => {
    await traspasoService.crear(baseInput);
    const creados = mocks.tx.payment.create.mock.calls.map(c => c[0].data);
    expect(creados).toHaveLength(1);
    expect(creados[0]).toMatchObject({
      contractId: 'c-destino', paymentType: 'TRASPASO_ENTRADA', amount: 10000,
    });
    // Ni un solo movimiento negativo sobre el origen.
    expect(creados.every(p => p.amount > 0)).toBe(true);
    expect(creados.some(p => p.contractId === 'c-origen')).toBe(false);
  });

  it('cierra el origen como TRASPASADO con balance 0 y libera su lote', async () => {
    await traspasoService.crear(baseInput);
    const upd = mocks.tx.contract.update.mock.calls.find(c => c[0].where.id === 'c-origen');
    expect(upd![0].data).toMatchObject({ status: 'TRASPASADO', balance: 0 });
    expect(mocks.tx.lot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'AVAILABLE' } }),
    );
  });

  it('rechaza respetar más de lo abonado, sin escribir nada', async () => {
    await expect(traspasoService.crear({ ...baseInput, montoRespetado: 99999 }))
      .rejects.toThrow(/más de lo abonado/i);
    expect(mocks.tx.traspaso.create).not.toHaveBeenCalled();
  });

  it('rechaza si falta la nota cuando no se respeta todo', async () => {
    await expect(traspasoService.crear({ ...baseInput, nota: undefined }))
      .rejects.toThrow(/nota/i);
  });

  it('rechaza un contrato ya traspasado', async () => {
    mocks.tx.contract.findUnique.mockResolvedValue({ ...ORIGEN, status: 'TRASPASADO' });
    await expect(traspasoService.crear(baseInput)).rejects.toThrow(/ya fue traspasado/i);
  });

  it('rechaza si el lote destino no está disponible', async () => {
    mocks.tx.lot.findMany.mockResolvedValue([{ id: 'lote-b', status: 'SOLD', projectId: 'p-mon2' }]);
    await expect(traspasoService.crear(baseInput)).rejects.toThrow(/disponible/i);
  });
});

describe('crear — cambio de titular (mismo lote y proyecto)', () => {
  const mismoLote = {
    ...baseInput,
    lotIdsDestino: ['lote-a'], projectIdDestino: 'p-vdb',
    montoRespetado: 40000, nota: undefined,
    datosContratoDestino: undefined,
  };

  beforeEach(() => {
    mocks.tx.lot.findMany.mockResolvedValue([{ id: 'lote-a', status: 'SOLD', projectId: 'p-vdb' }]);
  });

  it('no crea contrato nuevo: el mismo cambia de dueño', async () => {
    const t = await traspasoService.crear(mismoLote);
    expect(t.tipo).toBe('CAMBIO_TITULAR');
    expect(t.contratoDestinoId).toBeNull();
    expect(mocks.tx.contract.create).not.toHaveBeenCalled();
  });

  it('no mueve un peso: el contrato conserva su historial', async () => {
    await traspasoService.crear(mismoLote);
    expect(mocks.tx.payment.create).not.toHaveBeenCalled();
  });

  it('cambia el titular del contrato y NO lo cierra', async () => {
    await traspasoService.crear(mismoLote);
    const upd = mocks.tx.contract.update.mock.calls.find(c => c[0].where.id === 'c-origen');
    expect(upd![0].data).toMatchObject({ clientId: 'cli-2' });
    expect(upd![0].data.status).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/services/__tests__/traspasoService.test.ts`
Expected: FAIL — `Failed to resolve import "../traspaso.service"`

- [ ] **Step 3: Escribir el servicio**

Crear `src/services/traspaso.service.ts`:

```typescript
/**
 * Traspasos: un lote cambia de manos.
 *
 * La decisión estructural: los pagos del contrato ORIGEN no se tocan nunca.
 * Si el cliente pagó $40,000, pagó $40,000 — es un hecho y sus recibos, que
 * tienen folio y validación pública, lo prueban. Restarle con un movimiento
 * negativo volvería mentira su historial.
 *
 * El dinero que se le respeta entra como UN pago nuevo en el destino, y la
 * diferencia queda explicada en el acta (montoAbonado − montoRespetado), con
 * quién la autorizó y por qué.
 */
import {
  PrismaClient, TraspasoTipo, ContractStatus, PaymentType, PaymentMethod,
  PaymentStatus, LotStatus, CuotaStatus,
} from '@prisma/client';
import { deducirTipo, validarTraspaso } from './lib/traspaso';
import { round2 } from '../utils/money';

const prisma = new PrismaClient();

export interface DatosContratoDestino {
  totalPrice: number;
  downPayment: number;
  installmentAmount: number;
  installmentCount: number;
  startDate: Date;
}

export interface CrearTraspasoInput {
  contratoOrigenId: string;
  clienteNuevoId: string;
  lotIdsDestino: string[];
  projectIdDestino: string;
  montoRespetado: number;
  fecha?: Date;
  motivo?: string;
  nota?: string;
  documentoUrl?: string;
  userId: string;
  /** Requerido en REUBICACION: el contrato destino se crea con estos datos. */
  datosContratoDestino?: DatosContratoDestino;
}

export const traspasoService = {
  async crear(input: CrearTraspasoInput) {
    const fecha = input.fecha ?? new Date();

    return prisma.$transaction(async (tx) => {
      // Se relee TODO dentro de la transacción: entre que la secretaria abrió
      // la pantalla y confirmó, el contrato pudo cambiar de estado.
      const origen = await tx.contract.findUnique({
        where: { id: input.contratoOrigenId },
        include: { lots: { select: { lotId: true } } },
      });
      if (!origen) throw new Error('Contrato origen no encontrado');

      const lotesOrigen = (await tx.contractLot.findMany({
        where: { contractId: origen.id }, select: { lotId: true },
      })).map(l => l.lotId);

      const lotesDestino = await tx.lot.findMany({
        where: { id: { in: input.lotIdsDestino } },
        select: { id: true, status: true, projectId: true },
      });
      if (lotesDestino.length !== input.lotIdsDestino.length) {
        throw new Error('Alguno de los lotes destino no existe');
      }

      const tipo = deducirTipo(
        { projectId: origen.projectId, lotIds: lotesOrigen },
        { projectId: input.projectIdDestino, lotIds: input.lotIdsDestino },
      );
      const mismoLote = tipo === TraspasoTipo.CAMBIO_TITULAR;

      // Lo abonado es la suma de sus pagos confirmados, no el campo balance:
      // el balance puede venir arrastrado, los pagos son hechos.
      const agg = await tx.payment.aggregate({
        where: { contractId: origen.id, status: PaymentStatus.CONFIRMED },
        _sum: { amount: true },
      });
      const montoAbonado = round2(agg._sum.amount ?? 0);
      const montoRespetado = round2(input.montoRespetado);

      const error = validarTraspaso({
        montoAbonado, montoRespetado, nota: input.nota,
        estadoOrigen: origen.status,
        estadoLoteDestino: lotesDestino.find(l => l.status !== LotStatus.AVAILABLE)?.status,
        mismoLote,
      });
      if (error) throw new Error(error);

      if (!mismoLote && !input.datosContratoDestino) {
        throw new Error('Falta la información del contrato destino');
      }

      const ultimo = await tx.traspaso.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } });

      let contratoDestinoId: string | null = null;

      if (mismoLote) {
        // Cambia el dueño y ya: el contrato conserva pagos, cuotas e historia.
        await tx.contract.update({
          where: { id: origen.id },
          data: { clientId: input.clienteNuevoId },
        });
      } else {
        const d = input.datosContratoDestino!;
        const destino = await tx.contract.create({
          data: {
            contractNumber: `${origen.contractNumber}-T${(ultimo?.numero ?? 0) + 1}`,
            clientId: input.clienteNuevoId,
            projectId: input.projectIdDestino,
            contractDate: fecha,
            status: ContractStatus.ACTIVE,
            totalPrice: d.totalPrice,
            downPayment: d.downPayment,
            financingAmount: round2(d.totalPrice - d.downPayment),
            balance: round2(d.totalPrice - montoRespetado),
            installmentAmount: d.installmentAmount,
            installmentCount: d.installmentCount,
            startDate: d.startDate,
          },
        });
        contratoDestinoId = destino.id;

        await tx.contractLot.createMany({
          data: input.lotIdsDestino.map(lotId => ({ contractId: destino.id, lotId })),
        });
        await tx.lot.updateMany({
          where: { id: { in: input.lotIdsDestino } },
          data: { status: LotStatus.SOLD },
        });

        // El origen se cierra: no se deshizo la venta, cambió de manos.
        await tx.contractLot.deleteMany({ where: { contractId: origen.id } });
        await tx.cuota.deleteMany({ where: { contractId: origen.id, status: CuotaStatus.PENDIENTE } });
        await tx.lot.updateMany({
          where: { id: { in: lotesOrigen.filter(l => !input.lotIdsDestino.includes(l)) } },
          data: { status: LotStatus.AVAILABLE },
        });
        await tx.contract.update({
          where: { id: origen.id },
          data: { status: ContractStatus.TRASPASADO, balance: 0, moraMonthsCount: 0 },
        });
      }

      const traspaso = await tx.traspaso.create({
        data: {
          numero: (ultimo?.numero ?? 0) + 1,
          fecha,
          tipo,
          contratoOrigenId: origen.id,
          contratoDestinoId,
          clienteAnteriorId: origen.clientId,
          clienteNuevoId: input.clienteNuevoId,
          montoAbonado,
          montoRespetado,
          motivo: input.motivo?.trim() || null,
          nota: input.nota?.trim() || null,
          documentoUrl: input.documentoUrl ?? null,
          createdById: input.userId,
        },
      });

      // El abono que viaja. Solo en reubicación: en cambio de titular el
      // contrato ya tiene ese dinero, no hay nada que mover.
      if (contratoDestinoId && montoRespetado > 0) {
        await tx.payment.create({
          data: {
            paymentNumber: `TR-${traspaso.numero}-${Date.now()}`,
            contractId: contratoDestinoId,
            clientId: input.clienteNuevoId,
            paymentType: PaymentType.TRASPASO_ENTRADA,
            paymentMethod: PaymentMethod.TRANSFER,
            amount: montoRespetado,
            paymentDate: fecha,
            concept: `Abono por traspaso #${traspaso.numero} desde ${origen.codigoLegado ?? origen.contractNumber}`,
            status: PaymentStatus.CONFIRMED,
            createdBy: input.userId,
            traspasoId: traspaso.id,
          },
        });
      }

      return traspaso;
    });
  },

  async listar() {
    return prisma.traspaso.findMany({
      include: {
        contratoOrigen:  { select: { codigoLegado: true, contractNumber: true, project: { select: { code: true } } } },
        contratoDestino: { select: { codigoLegado: true, contractNumber: true, project: { select: { code: true } } } },
        clienteAnterior: { select: { firstName: true, lastName: true } },
        clienteNuevo:    { select: { firstName: true, lastName: true } },
        createdBy:       { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ fecha: 'desc' }, { numero: 'desc' }],
    });
  },

  async obtener(id: string) {
    const t = await prisma.traspaso.findUnique({
      where: { id },
      include: {
        contratoOrigen:  { select: { codigoLegado: true, contractNumber: true, project: { select: { code: true, name: true } } } },
        contratoDestino: { select: { codigoLegado: true, contractNumber: true, project: { select: { code: true, name: true } } } },
        clienteAnterior: { select: { firstName: true, lastName: true } },
        clienteNuevo:    { select: { firstName: true, lastName: true } },
        createdBy:       { select: { firstName: true, lastName: true } },
        payments:        { select: { id: true, amount: true, paymentDate: true, concept: true } },
      },
    });
    if (!t) throw new Error('Traspaso no encontrado');
    return t;
  },
};

export default traspasoService;
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/services/__tests__/traspasoService.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npx vitest run
git add src/services/traspaso.service.ts src/services/__tests__/traspasoService.test.ts
git commit -m "feat(traspasos): servicio con el acta y el abono que viaja

Los pagos del contrato origen NO se tocan: si el cliente pagó \$40,000, pagó
\$40,000, y sus recibos con folio y validación pública lo prueban. El dinero
que se le respeta entra como UN pago nuevo en el destino, y la diferencia
queda explicada en el acta con quién la autorizó.

Lo abonado se calcula sumando los pagos confirmados, no leyendo el campo
balance: el balance puede venir arrastrado, los pagos son hechos.

Todo se relee dentro de la transacción, porque entre que la secretaria abre la
pantalla y confirma, el contrato pudo cambiar de estado."
```

---

### Task 4: Endpoints de traspaso

**Files:**
- Create: `src/controllers/traspaso.controller.ts`
- Create: `src/routes/traspaso.routes.ts`
- Modify: `src/app.ts`
- Test: `src/controllers/__tests__/traspasoController.test.ts`

**Interfaces:**
- Consumes: `traspasoService` (Task 3).
- Produces: `POST /api/v1/traspasos` (multipart, campo `file` opcional), `GET /api/v1/traspasos`, `GET /api/v1/traspasos/:id`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/controllers/__tests__/traspasoController.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({ crear: vi.fn(), listar: vi.fn(), obtener: vi.fn() }));
vi.mock('../../services/traspaso.service', () => ({
  default: mocks,
  traspasoService: mocks,
}));

import traspasoController from '../traspaso.controller';

function run(body: any, user: any) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  return { res, promesa: traspasoController.crear({ body, user } as unknown as Request, res) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.crear.mockResolvedValue({ id: 't1', numero: 7 });
});

describe('POST /traspasos', () => {
  const body = {
    contratoOrigenId: 'c1', clienteNuevoId: 'cli2',
    lotIdsDestino: ['l1'], projectIdDestino: 'p1', montoRespetado: '10000',
  };

  it('toma el userId del TOKEN, nunca del body', async () => {
    const { promesa } = run({ ...body, userId: 'suplantado' }, { userId: 'u-real', role: 'ADMIN' });
    await promesa;
    expect(mocks.crear).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-real' }));
  });

  it('convierte el monto a número', async () => {
    const { promesa } = run(body, { userId: 'u-real', role: 'ADMIN' });
    await promesa;
    expect(mocks.crear).toHaveBeenCalledWith(expect.objectContaining({ montoRespetado: 10000 }));
  });

  it('devuelve 201 con el traspaso creado', async () => {
    const { res, promesa } = run(body, { userId: 'u-real', role: 'ADMIN' });
    await promesa;
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('un error del servicio sale como 400 con su mensaje', async () => {
    mocks.crear.mockRejectedValue(new Error('El lote destino no está disponible'));
    const { res, promesa } = run(body, { userId: 'u-real', role: 'ADMIN' });
    await promesa;
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'El lote destino no está disponible' }),
    );
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/controllers/__tests__/traspasoController.test.ts`
Expected: FAIL — `Failed to resolve import "../traspaso.controller"`

- [ ] **Step 3: Escribir el controlador**

Crear `src/controllers/traspaso.controller.ts`:

```typescript
// src/controllers/traspaso.controller.ts
import { Request, Response } from 'express';
import traspasoService from '../services/traspaso.service';
import { getFileStorage } from '../services/storage';
import { validateFileSignature } from '../utils/fileSignature';

// Misma lista que usa el documento de rescisión (contract.controller.ts:13).
// Se declara aquí porque allá es una const local, no exportada.
const DOC_ALLOWED_MIMETYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export class TraspasoController {
  // POST /api/v1/traspasos  (multipart: `file` = documento firmado, opcional)
  async crear(req: Request, res: Response) {
    try {
      const b = req.body ?? {};

      // Mismo tratamiento que el documento de rescisión: se valida la firma
      // real del archivo (no el nombre ni el mimetype declarado) y se guarda
      // en el storage privado. Ver contract.controller.rescind.
      const file = (req as any).file;
      let documentoUrl: string | undefined;
      if (file) {
        const detected = await validateFileSignature(file.buffer, DOC_ALLOWED_MIMETYPES);
        const ext = detected.mime === 'application/pdf' ? 'pdf'
                  : detected.mime === 'image/png' ? 'png' : 'jpg';
        documentoUrl = `traspasos/${b.contratoOrigenId}/${Date.now()}.${ext}`;
        await getFileStorage().saveFile(documentoUrl, file.buffer, detected.mime);
      }
      const traspaso = await traspasoService.crear({
        contratoOrigenId: b.contratoOrigenId,
        clienteNuevoId: b.clienteNuevoId,
        // En multipart los arreglos llegan como string: se normaliza.
        lotIdsDestino: Array.isArray(b.lotIdsDestino) ? b.lotIdsDestino : [b.lotIdsDestino].filter(Boolean),
        projectIdDestino: b.projectIdDestino,
        montoRespetado: Number(b.montoRespetado),
        fecha: b.fecha ? new Date(b.fecha) : undefined,
        motivo: b.motivo,
        nota: b.nota,
        documentoUrl,
        datosContratoDestino: b.datosContratoDestino
          ? {
              totalPrice: Number(b.datosContratoDestino.totalPrice),
              downPayment: Number(b.datosContratoDestino.downPayment),
              installmentAmount: Number(b.datosContratoDestino.installmentAmount),
              installmentCount: Number(b.datosContratoDestino.installmentCount),
              startDate: new Date(b.datosContratoDestino.startDate),
            }
          : undefined,
        // Del token, nunca del body: quien autoriza un traspaso queda
        // registrado y eso no puede falsificarse desde el cliente.
        userId: req.user!.userId,
      });
      res.status(201).json({ success: true, message: 'Traspaso registrado', data: traspaso });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  // GET /api/v1/traspasos
  async listar(_req: Request, res: Response) {
    try {
      res.json({ success: true, data: await traspasoService.listar() });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
  }

  // GET /api/v1/traspasos/:id
  async obtener(req: Request, res: Response) {
    try {
      res.json({ success: true, data: await traspasoService.obtener(req.params.id) });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
  }
}

export default new TraspasoController();
```

- [ ] **Step 4: Escribir las rutas**

Crear `src/routes/traspaso.routes.ts`, copiando el patrón de subida de archivo de `src/routes/contract.routes.ts:10-19`:

```typescript
// src/routes/traspaso.routes.ts — un lote cambia de manos
import { Router } from 'express';
import multer from 'multer';
import traspasoController from '../controllers/traspaso.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { handleMulterUpload } from '../middlewares/handleMulterUpload';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const handleDocumento = handleMulterUpload(upload, 'file');

const router = Router();
router.use(authenticate);

const adminOrManager = authorize('ADMIN', 'MANAGER');

router.get('/',     adminOrManager, traspasoController.listar);
router.post('/',    adminOrManager, handleDocumento, traspasoController.crear);
router.get('/:id',  adminOrManager, traspasoController.obtener);

export default router;
```

Rutas verificadas contra el repo: `getFileStorage` vive en
`src/services/storage`, `validateFileSignature` en `src/utils/fileSignature`, y
`handleMulterUpload` en `src/middlewares/handleMulterUpload`.

- [ ] **Step 5: Montar las rutas en app.ts**

En `src/app.ts`, junto a `corteDiarioRoutes`:

```typescript
import traspasoRoutes from './routes/traspaso.routes';
```

y

```typescript
app.use(`/api/${API_VERSION}/traspasos`, traspasoRoutes);
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `npx vitest run src/controllers/__tests__/traspasoController.test.ts && npx tsc --noEmit`
Expected: PASS, 4 tests; tsc sin errores.

- [ ] **Step 7: Commit**

```bash
npx vitest run
git add src/controllers/traspaso.controller.ts src/controllers/__tests__/traspasoController.test.ts src/routes/traspaso.routes.ts src/app.ts
git commit -m "feat(traspasos): endpoints con documento de evidencia

El userId sale del token y no del body: quien autoriza un traspaso queda
registrado, y eso no puede falsificarse desde el cliente.

Mismo patrón de subida que la rescisión (multipart, campo file opcional al
storage privado)."
```

---

### Task 5: El bucket de dinero retenido

**Files:**
- Create: `src/services/lib/dineroRetenido.ts`
- Create: `src/services/dineroRetenido.service.ts`
- Modify: `src/controllers/dashboard.controller.ts`
- Modify: `src/routes/dashboard.routes.ts`
- Test: `src/services/lib/__tests__/dineroRetenido.test.ts`

**Interfaces:**
- Consumes: nada de tareas previas (lee la base directo).
- Produces: `GET /api/v1/dashboard/dinero-retenido` (solo ADMIN), `construirResumenRetenido(casos: CasoRetenido[]): ResumenRetenido`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/services/lib/__tests__/dineroRetenido.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { construirResumenRetenido, CasoRetenido } from '../dineroRetenido';

const caso = (o: Partial<CasoRetenido> = {}): CasoRetenido => ({
  contratoId: 'c1', codigo: 'E016', proyecto: 'VDB',
  cliente: 'Magdaleno Marquez', origen: 'CANCELACION',
  pagado: 164000, devuelto: 0, respetadoEnTraspaso: 0,
  fecha: new Date('2026-06-04'), ...o,
});

describe('dinero retenido — lo que quedó sin respaldar una obligación', () => {
  it('retenido = pagado − devuelto − lo respetado en un traspaso', () => {
    const r = construirResumenRetenido([caso({ pagado: 40000, devuelto: 0, respetadoEnTraspaso: 10000 })]);
    expect(r.total).toBe(30000);
  });

  it('una devolución baja el retenido', () => {
    expect(construirResumenRetenido([caso({ pagado: 100000, devuelto: 30000 })]).total).toBe(70000);
  });

  it('separa por origen: cancelación vs traspaso', () => {
    const r = construirResumenRetenido([
      caso({ origen: 'CANCELACION', pagado: 100000 }),
      caso({ origen: 'TRASPASO', pagado: 40000, respetadoEnTraspaso: 10000 }),
    ]);
    expect(r.porOrigen).toEqual([
      { origen: 'CANCELACION', casos: 1, monto: 100000 },
      { origen: 'TRASPASO', casos: 1, monto: 30000 },
    ]);
  });

  it('agrupa por proyecto, del que más retiene al que menos', () => {
    const r = construirResumenRetenido([
      caso({ proyecto: 'MDS', pagado: 50000 }),
      caso({ proyecto: 'VDR', pagado: 120000 }),
      caso({ proyecto: 'MDS', pagado: 30000 }),
    ]);
    expect(r.porProyecto).toEqual([
      { proyecto: 'VDR', casos: 1, monto: 120000 },
      { proyecto: 'MDS', casos: 2, monto: 80000 },
    ]);
  });

  it('un caso donde se devolvió todo NO aparece en la lista', () => {
    // Si se le devolvió hasta el último peso, no hay nada retenido.
    const r = construirResumenRetenido([caso({ pagado: 50000, devuelto: 50000 })]);
    expect(r.total).toBe(0);
    expect(r.casos).toHaveLength(0);
  });

  it('nunca devuelve un retenido negativo, aunque se haya devuelto de más', () => {
    const r = construirResumenRetenido([caso({ pagado: 50000, devuelto: 60000 })]);
    expect(r.total).toBe(0);
  });

  it('sin casos da ceros y no truena', () => {
    expect(construirResumenRetenido([])).toMatchObject({ total: 0, casos: [], porOrigen: [], porProyecto: [] });
  });

  it('los casos salen ordenados de mayor a menor', () => {
    const r = construirResumenRetenido([
      caso({ codigo: 'A', pagado: 10000 }),
      caso({ codigo: 'B', pagado: 90000 }),
    ]);
    expect(r.casos.map(c => c.codigo)).toEqual(['B', 'A']);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/services/lib/__tests__/dineroRetenido.test.ts`
Expected: FAIL — `Failed to resolve import "../dineroRetenido"`

- [ ] **Step 3: Escribir la lógica pura**

Crear `src/services/lib/dineroRetenido.ts`:

```typescript
/**
 * Dinero retenido: lo que el cliente pagó y que ya no respalda ninguna
 * obligación, porque su contrato se canceló o se traspasó sin devolvérselo.
 *
 * Es una VISTA DERIVADA, no un saldo guardado. Un contador que se actualiza a
 * mano se desincroniza con la primera cancelación hecha por SQL o el primer
 * reembolso capturado después; calculado desde los pagos y las actas, no puede
 * mentir.
 *
 * OJO: no es dinero nuevo. Ya está contado como ingreso desde que el cliente
 * pagó. Esto solo lo etiqueta. Sumarlo aparte lo contaría dos veces.
 */
import { round2 } from '../../utils/money';

export type OrigenRetenido = 'CANCELACION' | 'TRASPASO';

export interface CasoRetenido {
  contratoId: string;
  codigo: string;
  proyecto: string;
  cliente: string;
  origen: OrigenRetenido;
  pagado: number;
  devuelto: number;
  respetadoEnTraspaso: number;
  fecha: Date | null;
}

export interface CasoConRetenido extends CasoRetenido {
  retenido: number;
}

export interface ResumenRetenido {
  total: number;
  porOrigen: Array<{ origen: OrigenRetenido; casos: number; monto: number }>;
  porProyecto: Array<{ proyecto: string; casos: number; monto: number }>;
  casos: CasoConRetenido[];
}

export function construirResumenRetenido(casos: CasoRetenido[]): ResumenRetenido {
  const conRetenido: CasoConRetenido[] = casos
    // Nunca negativo: si se devolvió de más, eso es otro problema, no una
    // retención en contra.
    .map(c => ({ ...c, retenido: Math.max(0, round2(c.pagado - c.devuelto - c.respetadoEnTraspaso)) }))
    .filter(c => c.retenido > 0)
    .sort((a, b) => b.retenido - a.retenido);

  const agrupar = <K extends string>(clave: (c: CasoConRetenido) => K) => {
    const m = new Map<K, { casos: number; monto: number }>();
    for (const c of conRetenido) {
      const k = clave(c);
      const e = m.get(k) ?? { casos: 0, monto: 0 };
      e.casos += 1;
      e.monto = round2(e.monto + c.retenido);
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => b[1].monto - a[1].monto);
  };

  return {
    total: round2(conRetenido.reduce((s, c) => s + c.retenido, 0)),
    porOrigen: agrupar(c => c.origen).map(([origen, v]) => ({ origen, ...v })),
    porProyecto: agrupar(c => c.proyecto).map(([proyecto, v]) => ({ proyecto, ...v })),
    casos: conRetenido,
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/services/lib/__tests__/dineroRetenido.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Escribir el servicio que lee la base**

Crear `src/services/dineroRetenido.service.ts`:

```typescript
/**
 * Arma el bucket de dinero retenido desde la base. La lógica de cálculo vive
 * en lib/dineroRetenido.ts; aquí solo se junta la materia prima.
 */
import { PrismaClient, ContractStatus, PaymentType, PaymentStatus } from '@prisma/client';
import { construirResumenRetenido, CasoRetenido } from './lib/dineroRetenido';
import { round2 } from '../utils/money';

const prisma = new PrismaClient();

export const dineroRetenidoService = {
  async resumen() {
    const contratos = await prisma.contract.findMany({
      where: {
        status: { in: [ContractStatus.CANCELED, ContractStatus.RESCISSION, ContractStatus.TRASPASADO] },
        // Los proyectos ocultos no entran en ningún total del negocio.
        project: { status: { not: 'HIDDEN' } },
      },
      select: {
        id: true, codigoLegado: true, contractNumber: true, status: true, rescindedAt: true,
        project: { select: { code: true } },
        client: { select: { firstName: true, lastName: true } },
        payments: { where: { status: PaymentStatus.CONFIRMED }, select: { amount: true, paymentType: true } },
        traspasosOrigen: { select: { montoRespetado: true, fecha: true } },
      },
    });

    const casos: CasoRetenido[] = contratos.map(c => {
      // Las devoluciones se guardan como monto NEGATIVO (ver
      // contract.service.rescindContract), por eso el valor absoluto.
      const devuelto = round2(Math.abs(
        c.payments.filter(p => p.paymentType === PaymentType.RESCISSION_REFUND)
                  .reduce((s, p) => s + p.amount, 0),
      ));
      const pagado = round2(
        c.payments.filter(p => p.paymentType !== PaymentType.RESCISSION_REFUND)
                  .reduce((s, p) => s + p.amount, 0),
      );
      const respetado = round2(c.traspasosOrigen.reduce((s, t) => s + t.montoRespetado, 0));

      return {
        contratoId: c.id,
        codigo: c.codigoLegado ?? c.contractNumber,
        proyecto: c.project.code,
        cliente: `${c.client.firstName} ${c.client.lastName}`,
        origen: c.status === ContractStatus.TRASPASADO ? 'TRASPASO' : 'CANCELACION',
        pagado, devuelto, respetadoEnTraspaso: respetado,
        fecha: c.traspasosOrigen[0]?.fecha ?? c.rescindedAt ?? null,
      };
    });

    return construirResumenRetenido(casos);
  },
};

export default dineroRetenidoService;
```

- [ ] **Step 6: Exponer el endpoint, solo ADMIN**

En `src/controllers/dashboard.controller.ts`, agregar dentro de la clase:

```typescript
  // GET /api/v1/dashboard/dinero-retenido  (solo ADMIN)
  async getDineroRetenido(_req: Request, res: Response) {
    try {
      res.json({ success: true, data: await dineroRetenidoService.resumen() });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
```

y el import:

```typescript
import dineroRetenidoService from '../services/dineroRetenido.service';
```

En `src/routes/dashboard.routes.ts`, junto a `/summary`:

```typescript
// Dinero que ya no respalda ninguna obligación con un cliente. Información del
// negocio, no operativa: solo ADMIN.
router.get('/dinero-retenido', authorize('ADMIN'), dashboardController.getDineroRetenido.bind(dashboardController));
```

- [ ] **Step 7: Verificar y commitear**

Run: `npx tsc --noEmit && npx vitest run`
Expected: todo verde.

```bash
git add src/services/lib/dineroRetenido.ts src/services/lib/__tests__/dineroRetenido.test.ts src/services/dineroRetenido.service.ts src/controllers/dashboard.controller.ts src/routes/dashboard.routes.ts
git commit -m "feat(traspasos): bucket de dinero retenido

Lo que un cliente pagó y ya no respalda ninguna obligación, porque su contrato
se canceló o se traspasó sin devolvérselo. Hoy son ~\$1.75M de 38 contratos
cancelados, sin una sola devolución registrada.

Es una vista derivada y no un saldo guardado: un contador a mano se
desincroniza con la primera cancelación hecha por SQL. Calculado desde los
pagos y las actas, no puede mentir.

No es dinero nuevo — ya está contado como ingreso desde que el cliente pagó.
El bucket solo etiqueta el que dejó de tener dueño."
```

---

### Task 6: Pantalla de traspaso

**Files:**
- Create: `frontend/src/hooks/useTraspasos.ts`
- Create: `frontend/src/components/contratos/TraspasarContratoModal.tsx`
- Modify: `frontend/src/app/(admin)/contratos/[id]/page.tsx`
- Test: `frontend/src/components/contratos/traspasoForm.test.ts`
- Create: `frontend/src/components/contratos/traspasoForm.ts`

**Interfaces:**
- Consumes: `POST /api/v1/traspasos` (Task 4).
- Produces: `validarFormularioTraspaso(f: FormTraspaso): string | null`, `resumenDinero(abonado: number, respetado: string)`.

- [ ] **Step 1: Escribir el test de la lógica del formulario**

Crear `frontend/src/components/contratos/traspasoForm.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validarFormularioTraspaso, resumenDinero } from './traspasoForm';

const base = {
  clienteNuevoId: 'cli2', lotIdsDestino: ['l1'], projectIdDestino: 'p1',
  montoRespetado: '40000', abonado: 40000, nota: '',
};

describe('validarFormularioTraspaso', () => {
  it('acepta un traspaso completo', () => {
    expect(validarFormularioTraspaso(base)).toBeNull();
  });

  it('exige elegir al cliente nuevo', () => {
    expect(validarFormularioTraspaso({ ...base, clienteNuevoId: '' })).toMatch(/cliente/i);
  });

  it('exige elegir al menos un lote destino', () => {
    expect(validarFormularioTraspaso({ ...base, lotIdsDestino: [] })).toMatch(/lote/i);
  });

  it('exige nota cuando no se respeta todo lo abonado', () => {
    expect(validarFormularioTraspaso({ ...base, montoRespetado: '10000' })).toMatch(/nota/i);
    expect(validarFormularioTraspaso({ ...base, montoRespetado: '10000', nota: 'Solo enganche' })).toBeNull();
  });

  it('no deja respetar más de lo abonado', () => {
    expect(validarFormularioTraspaso({ ...base, montoRespetado: '99999', nota: 'x' })).toMatch(/más de lo abonado/i);
  });
});

describe('resumenDinero — lo que la secretaria ve mientras captura', () => {
  it('respetar todo no deja diferencia', () => {
    expect(resumenDinero(40000, '40000')).toEqual({ respetado: 40000, sePierde: 0, hayDiferencia: false });
  });

  it('respetar menos muestra cuánto se pierde', () => {
    expect(resumenDinero(40000, '10000')).toEqual({ respetado: 10000, sePierde: 30000, hayDiferencia: true });
  });

  it('el campo vacío se lee como cero, no como NaN', () => {
    expect(resumenDinero(40000, '')).toEqual({ respetado: 0, sePierde: 40000, hayDiferencia: true });
  });

  it('tolera que escriban el monto con comas y signo de pesos', () => {
    expect(resumenDinero(40000, '$10,000')).toMatchObject({ respetado: 10000 });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd frontend && npx vitest run src/components/contratos/traspasoForm.test.ts`
Expected: FAIL — no existe `./traspasoForm`.

- [ ] **Step 3: Escribir la lógica del formulario**

Crear `frontend/src/components/contratos/traspasoForm.ts`:

```typescript
// Lógica pura del formulario de traspaso (sin React), para poder probarla.
// Las mismas reglas viven en el backend (services/lib/traspaso.ts): aquí es
// para que la secretaria vea el error antes de enviar, no para confiar en el
// cliente.

export interface FormTraspaso {
  clienteNuevoId: string;
  lotIdsDestino: string[];
  projectIdDestino: string;
  montoRespetado: string;
  abonado: number;
  nota: string;
}

const aNumero = (s: string) => {
  const n = Number((s ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function resumenDinero(abonado: number, montoRespetado: string) {
  const respetado = aNumero(montoRespetado);
  const sePierde = Math.round((abonado - respetado) * 100) / 100;
  return { respetado, sePierde: Math.max(0, sePierde), hayDiferencia: Math.abs(sePierde) >= 0.5 };
}

export function validarFormularioTraspaso(f: FormTraspaso): string | null {
  if (!f.clienteNuevoId) return 'Elige al cliente que recibe';
  if (!f.lotIdsDestino.length) return 'Elige al menos un lote destino';
  if (!f.projectIdDestino) return 'Elige el proyecto destino';

  const { respetado, hayDiferencia } = resumenDinero(f.abonado, f.montoRespetado);
  if (respetado < 0) return 'El monto no puede ser negativo';
  if (respetado > f.abonado + 0.5) return 'No puedes respetar más de lo abonado por el cliente';
  if (hayDiferencia && !f.nota.trim()) return 'No se respeta todo lo abonado: escribe una nota explicando por qué';
  return null;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd frontend && npx vitest run src/components/contratos/traspasoForm.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Escribir el hook**

Crear `frontend/src/hooks/useTraspasos.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface Traspaso {
  id: string;
  numero: number;
  fecha: string;
  tipo: 'CAMBIO_TITULAR' | 'REUBICACION';
  montoAbonado: number;
  montoRespetado: number;
  motivo: string | null;
  nota: string | null;
  contratoOrigen:  { codigoLegado: string | null; contractNumber: string; project: { code: string } };
  contratoDestino: { codigoLegado: string | null; contractNumber: string; project: { code: string } } | null;
  clienteAnterior: { firstName: string; lastName: string };
  clienteNuevo:    { firstName: string; lastName: string };
  createdBy:       { firstName: string; lastName: string };
}

export function useTraspasos() {
  return useQuery<Traspaso[]>({
    queryKey: ['traspasos'],
    queryFn: async () => (await api.get('/traspasos')).data.data,
    staleTime: 60_000,
  });
}

export function useCrearTraspaso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (form: FormData) =>
      (await api.post('/traspasos', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data.data as Traspaso,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['traspasos'] });
      qc.invalidateQueries({ queryKey: ['contratos'] });
      qc.invalidateQueries({ queryKey: ['lotes'] });
    },
  });
}
```

- [ ] **Step 6: Escribir el modal**

Crear `frontend/src/components/contratos/TraspasarContratoModal.tsx`, siguiendo el patrón visual de `frontend/src/components/contratos/RescindirContratoModal.tsx` (mismo tamaño de modal, `var(--surface)`, botones `var(--accent)`).

El modal debe:
1. Mostrar el contrato origen, su cliente y **lo abonado** (dato que viene del detalle del contrato).
2. Selector de cliente que recibe (reusar el buscador de `RegistrarPagoModal`).
3. Selector de proyecto y de lote(s) destino, precargados con el lote actual — así el caso más común (cambio de titular) es un clic.
4. Campo de monto a respetar, precargado con lo abonado.
5. Cuando `resumenDinero(...).hayDiferencia` es true: recuadro en `var(--gold-pale)` diciendo cuánto se pierde y la nota marcada como obligatoria.
6. Campo de archivo opcional para el documento firmado.
7. Al enviar: `validarFormularioTraspaso` primero; si pasa, arma el `FormData` y llama a `useCrearTraspaso`.

- [ ] **Step 7: Agregar el botón en el detalle del contrato**

En `frontend/src/app/(admin)/contratos/[id]/page.tsx`, junto al botón de rescindir, agregar "Traspasar" que abre el modal. Solo visible si el contrato no está en `CANCELED`, `RESCISSION` ni `TRASPASADO`.

- [ ] **Step 8: Verificar y commitear**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: todo verde.

```bash
git add frontend/src/hooks/useTraspasos.ts frontend/src/components/contratos/
git commit -m "feat(traspasos): pantalla de traspaso desde el detalle del contrato

Los selectores vienen precargados con el lote actual, así que el caso más
común —cambio de titular sin mover de lote— es prácticamente un clic. La
secretaria captura a dónde va el cliente; el sistema deduce si eso es un
cambio de titular o una reubicación.

Cuando no se respeta todo lo abonado, la pantalla dice cuánto se pierde y
exige la nota antes de dejar enviar."
```

---

### Task 7: Pantalla del dinero retenido

**Files:**
- Create: `frontend/src/app/(admin)/dinero-retenido/page.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/components/layout/sidebarNav.test.ts`

**Interfaces:**
- Consumes: `GET /api/v1/dashboard/dinero-retenido` (Task 5).
- Produces: ruta `/dinero-retenido`, visible solo para ADMIN.

- [ ] **Step 1: Agregar la entrada al menú con su test**

En `frontend/src/components/layout/Sidebar.tsx`, dentro del grupo Finanzas:

```typescript
      { label: 'Dinero retenido', href: '/dinero-retenido', icon: DollarSign, roles: ['ADMIN'] },
```

En `frontend/src/components/layout/sidebarNav.test.ts`, agregar al test de MANAGER:

```typescript
    expect(h).not.toContain('/dinero-retenido');
```

y al de ADMIN:

```typescript
    expect(h).toContain('/dinero-retenido');
```

- [ ] **Step 2: Correr el test del sidebar**

Run: `cd frontend && npx vitest run src/components/layout/sidebarNav.test.ts`
Expected: PASS.

- [ ] **Step 3: Escribir la pantalla**

Crear `frontend/src/app/(admin)/dinero-retenido/page.tsx` con:

- Guard `useRole().isAdmin`; si no, el mismo bloque de "Acceso restringido" de `frontend/src/app/(admin)/ingresos/page.tsx`.
- Tarjeta grande con el total.
- Aclaración visible: *"Este dinero ya está contado en los ingresos. Aquí solo se marca el que dejó de respaldar una obligación con un cliente."* — sin esa línea alguien lo va a sumar dos veces.
- Desglose por origen (cancelación / traspaso) y por proyecto.
- Tabla de casos: proyecto, contrato, cliente, pagado, devuelto, retenido, fecha.

- [ ] **Step 4: Verificar y commitear**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`

```bash
git add frontend/src/app/\(admin\)/dinero-retenido/ frontend/src/components/layout/
git commit -m "feat(traspasos): pantalla de dinero retenido

La pantalla dice explícitamente que ese dinero YA está contado en los
ingresos. Sin esa línea, el primero que la vea lo va a sumar aparte y contará
\$1.75M dos veces."
```

---

### Task 8: Desplegar y verificar en producción

**Files:** ninguno (operación).

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Correr todo y revisar**

Run: `npx tsc --noEmit && npx vitest run && cd frontend && npx tsc --noEmit && npx vitest run`
Expected: todo verde.

- [ ] **Step 2: Respaldar producción antes de la migración**

```bash
PGURL=$(railway variables -s Postgres --json | python3 -c "import json,sys; print(json.load(sys.stdin)['DATABASE_PUBLIC_URL'])")
pg_dump -Fc --no-owner --no-privileges -d "$PGURL" -f "backups/prod-pre-traspasos-$(date +%Y%m%d_%H%M%S).dump"
```

- [ ] **Step 3: Mergear y desplegar**

```bash
git checkout main && git merge --no-ff feat/traspasos -m "Merge feat/traspasos"
git push origin main
railway up --service backend --detach
railway up ./frontend --path-as-root --service frontend --detach
```

- [ ] **Step 4: Esperar el arranque real, no el exit code**

`railway up` termina cuando SUBE el código, no cuando el contenedor arranca y
corre las migraciones. Verificar de verdad:

```bash
until curl -s -o /dev/null -w "%{http_code}" https://backend-production-8ed1.up.railway.app/health | grep -q 200; do sleep 5; done
```

y luego confirmar que la migración aplicó:

```bash
psql "$PGURL" -At -c "SELECT to_regclass('public.traspasos')"
psql "$PGURL" -At -c "SELECT unnest(enum_range(NULL::\"ContractStatus\"))::text" | grep TRASPASADO
```

Expected: `traspasos` y `TRASPASADO`.

- [ ] **Step 5: Verificar el bucket contra producción**

```bash
curl -s -H "Authorization: Bearer <token de ADMIN>" \
  https://backend-production-8ed1.up.railway.app/api/v1/dashboard/dinero-retenido | head -40
```

Expected: `total` cercano a **$1,752,485** (el valor medido el 2026-09-10), con 38 casos de origen `CANCELACION` y 0 de `TRASPASO`.

Si el total difiere mucho, revisar antes de seguir: significa que la consulta
está tomando contratos que no debía.

- [ ] **Step 6: Nunca truncar la salida de psql con head en scripts transaccionales**

Al verificar con `psql -f`, redirigir a archivo y luego leerlo. Pasar la salida
por `head` le manda SIGPIPE a psql y **muere antes del COMMIT**: la transacción
revierte y parece que funcionó.

```bash
psql "$PGURL" -v ON_ERROR_STOP=1 -f script.sql > /tmp/salida.txt 2>&1
tail -20 /tmp/salida.txt
```

---

## Fuera de este plan

- Migrar los 6 traspasos históricos (V047, V070, V171, V463, A049, C037): necesitan fecha y monto respetado de las secretarias.
- Completar `rescindedAt` y las devoluciones de los 38 cancelados: el usuario lo trabaja con las secretarias.
- Procesar devoluciones de dinero (solo se registran, no se pagan).
- Recalcular automáticamente el plan cuando el destino vale distinto: el contrato destino se captura a mano.
