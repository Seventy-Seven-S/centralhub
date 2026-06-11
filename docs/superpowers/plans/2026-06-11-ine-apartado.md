# INE en Flujo de Apartado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar la INE del cliente al apartar un lote, almacenarla detrás de una abstracción de storage asociada al `Lot` (temporal), migrarla al `Client` al formalizar contrato, borrarla al liberar, y servirla solo a ADMIN/MANAGER.

**Architecture:** Se reutiliza el modelo `Document` polimórfico existente (`relatedEntity`/`relatedEntityId`). El upload viaja como multipart en el `POST /lots/:id/reserve` existente (multer memoryStorage → interfaz `FileStorage` con implementación de disco local fuera del `/uploads` público). La migración lot→client es un `updateMany` dentro de la transacción de `createContract`. Flag de obligatoriedad por env var, validado server-side.

**Tech Stack:** Express + TypeScript, Prisma 5 (PostgreSQL), multer 2 (ya instalado), vitest 4, Next.js 16 + React Query + axios.

**Spec:** `docs/superpowers/specs/2026-06-10-ine-apartado-design.md` — las decisiones ahí marcadas como cerradas no se renegocian.

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `prisma/schema.prisma` | Modificar | Enum `DocumentType` + índice en `Document` |
| `src/services/storage/file-storage.ts` | Crear | Interfaz `FileStorage` |
| `src/services/storage/local-disk-storage.ts` | Crear | Implementación disco local |
| `src/services/storage/index.ts` | Crear | Factory `getFileStorage()` |
| `src/services/storage/__tests__/localDiskStorage.test.ts` | Crear | Tests del storage |
| `src/utils/errors.ts` | Modificar | `IneUploadError` con `code` |
| `src/services/ineDocument.ts` | Crear | Helpers puros: validación, keys, flag, migración |
| `src/services/__tests__/ineDocument.test.ts` | Crear | Tests de helpers |
| `src/services/lot.service.ts` | Modificar | `reserveLot` con archivo + compensación; `releaseReservation` borra INE; `getIneDocumentsByLotIds` |
| `src/services/__tests__/lotService.ine.test.ts` | Crear | Tests con Prisma/storage mockeados |
| `src/services/contract.service.ts` | Modificar | Migración INE en la transacción |
| `src/services/document.service.ts` | Crear | `getDocumentFile(id)` |
| `src/services/__tests__/documentService.test.ts` | Crear | Tests del serving |
| `src/controllers/document.controller.ts` | Crear | Handler del archivo |
| `src/routes/document.routes.ts` | Crear | `GET /:id/file` ADMIN/MANAGER |
| `src/app.ts` | Modificar | Registrar `/api/v1/documents` |
| `src/routes/lot.routes.ts` | Modificar | Multer + wrapper de errores en `/reserve` |
| `src/controllers/lot.controller.ts` | Modificar | Pasar archivo al service; códigos de error; metadata INE |
| `src/controllers/client.controller.ts` | Modificar | `ineDocument` en `getClientById` |
| `.env.example`, `.gitignore` | Modificar | Nuevas env vars; ignorar `storage/` |
| `frontend/.env.example` | Crear | Documentar `NEXT_PUBLIC_INE_REQUIRED` |
| `frontend/src/hooks/useLotes.ts` | Modificar | Tipos `hasIne`/`ineDocument` |
| `frontend/src/hooks/useClientes.ts` | Modificar | Tipo `ineDocument` en `Cliente` |
| `frontend/src/app/(admin)/lotes/page.tsx` | Modificar | Input de archivo, FormData, Ver INE en modal |
| `frontend/src/app/(admin)/clientes/[id]/page.tsx` | Modificar | Card "Ver INE" |

**Convenciones del repo a respetar:**
- Servicios lanzan `Error` plano para validaciones genéricas; errores de negocio con código usan clase custom en `src/utils/errors.ts` (patrón `TotalUpfrontExceedsPriceError` → controller responde `{success: false, code, message}` con 400).
- `lot.service.ts`/`lot.controller.ts` son clases singleton exportadas por default; `client.controller.ts` usa funciones + `asyncHandler`.
- Tests en `src/services/__tests__/`, estilo `computeDepositSplit.test.ts`.
- Comandos: `npm test` = `vitest run`. Typecheck: `npm run build` (tsc).

---

### Task 1: Schema Prisma — enum INE + índice

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Agregar `INE` al enum `DocumentType`**

En `prisma/schema.prisma`, el enum (cerca de la línea 530) queda:

```prisma
enum DocumentType {
  CONTRACT
  RECEIPT
  ID
  DEED
  OTHER
  INE
}
```

- [ ] **Step 2: Agregar índice al modelo `Document`**

En el modelo `Document` (línea ~542), antes de `@@map("documents")`:

```prisma
  @@index([relatedEntity, relatedEntityId])
  @@map("documents")
```

- [ ] **Step 3: Correr la migración**

Run: `npx prisma migrate dev --name add_ine_document_type_and_index`
Expected: migración creada en `prisma/migrations/` y aplicada; `prisma generate` corre automáticamente. (Requiere PostgreSQL local levantado.)

- [ ] **Step 4: Verificar que el proyecto sigue compilando**

Run: `npm run build`
Expected: sin errores de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(prisma): DocumentType.INE + índice (relatedEntity, relatedEntityId)"
```

---

### Task 2: Env vars y gitignore

**Files:**
- Modify: `.env.example`
- Modify: `.gitignore`
- Create: `frontend/.env.example`

- [ ] **Step 1: Agregar env vars al `.env.example` del backend**

Al final de `.env.example`:

```
# INE / Documentos de cliente
# Obligatoriedad de la INE al apartar (en producción: true; en dev: false para no friccionar pruebas)
INE_REQUIRED_FOR_RESERVATION=false
# Driver de storage de archivos privados ('local' hoy; 's3' futuro)
STORAGE_DRIVER=local
# Directorio base del storage local (NUNCA dentro de /uploads, que se sirve público)
FILE_STORAGE_DIR=./storage/private
```

- [ ] **Step 2: Ignorar el directorio de storage**

En `.gitignore`, después de la línea `uploads/` (línea 26):

```
storage/
```

- [ ] **Step 3: Crear `frontend/.env.example`**

```
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
# Espejo UX del flag del backend (el backend es la fuente de verdad)
NEXT_PUBLIC_INE_REQUIRED=false
```

- [ ] **Step 4: Agregar el flag al `.env` y `frontend/.env.local` locales** (no se commitean)

Agregar a `.env`: las 3 variables del Step 1. Agregar a `frontend/.env.local`: `NEXT_PUBLIC_INE_REQUIRED=false`.

- [ ] **Step 5: Commit**

```bash
git add .env.example .gitignore frontend/.env.example
git commit -m "chore: env vars para INE (flag, storage driver, dir) + gitignore storage/"
```

---

### Task 3: Abstracción de storage (TDD)

**Files:**
- Create: `src/services/storage/file-storage.ts`
- Create: `src/services/storage/local-disk-storage.ts`
- Create: `src/services/storage/index.ts`
- Test: `src/services/storage/__tests__/localDiskStorage.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

`src/services/storage/__tests__/localDiskStorage.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { LocalDiskStorage } from '../local-disk-storage';

let dir: string;
let storage: LocalDiskStorage;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'ine-storage-'));
  storage = new LocalDiskStorage(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('LocalDiskStorage', () => {
  it('round-trip: saveFile → getFile devuelve el mismo contenido', async () => {
    const data = Buffer.from('contenido-ine');
    await storage.saveFile('ine/lot-1/abc.jpg', data, 'image/jpeg');
    const result = await storage.getFile('ine/lot-1/abc.jpg');
    expect(result.equals(data)).toBe(true);
  });

  it('saveFile crea subdirectorios intermedios de la key', async () => {
    await storage.saveFile('ine/lote-nuevo/sub.pdf', Buffer.from('pdf'), 'application/pdf');
    const result = await storage.getFile('ine/lote-nuevo/sub.pdf');
    expect(result.toString()).toBe('pdf');
  });

  it('getFile de key inexistente lanza', async () => {
    await expect(storage.getFile('ine/no-existe.jpg')).rejects.toThrow();
  });

  it('deleteFile elimina el archivo; getFile posterior lanza', async () => {
    await storage.saveFile('ine/x.png', Buffer.from('png'), 'image/png');
    await storage.deleteFile('ine/x.png');
    await expect(storage.getFile('ine/x.png')).rejects.toThrow();
  });

  it('rechaza keys con path traversal', async () => {
    await expect(storage.getFile('../fuera.txt')).rejects.toThrow('Key inválida');
    await expect(
      storage.saveFile('../../etc/passwd', Buffer.from('x'), 'image/png')
    ).rejects.toThrow('Key inválida');
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- src/services/storage/__tests__/localDiskStorage.test.ts`
Expected: FAIL — `Cannot find module '../local-disk-storage'` (o equivalente).

- [ ] **Step 3: Implementar la interfaz y el storage local**

`src/services/storage/file-storage.ts`:

```typescript
// Abstracción de storage de archivos privados.
// El swap a S3 en producción implementa esta misma interfaz sin tocar consumidores.
export interface FileStorage {
  saveFile(key: string, data: Buffer, mimeType: string): Promise<void>;
  getFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
}
```

`src/services/storage/local-disk-storage.ts`:

```typescript
import { promises as fs } from 'fs';
import path from 'path';
import { FileStorage } from './file-storage';

export class LocalDiskStorage implements FileStorage {
  constructor(private readonly baseDir: string) {}

  // Resuelve la key dentro de baseDir y bloquea path traversal.
  private resolveKey(key: string): string {
    const base = path.resolve(this.baseDir);
    const full = path.resolve(base, key);
    if (!full.startsWith(base + path.sep)) {
      throw new Error(`Key inválida: ${key}`);
    }
    return full;
  }

  async saveFile(key: string, data: Buffer, _mimeType: string): Promise<void> {
    const full = this.resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async getFile(key: string): Promise<Buffer> {
    return await fs.readFile(this.resolveKey(key));
  }

  async deleteFile(key: string): Promise<void> {
    await fs.unlink(this.resolveKey(key));
  }
}
```

`src/services/storage/index.ts`:

```typescript
import { FileStorage } from './file-storage';
import { LocalDiskStorage } from './local-disk-storage';

let instance: FileStorage | null = null;

export function getFileStorage(): FileStorage {
  if (instance) return instance;
  const driver = process.env.STORAGE_DRIVER ?? 'local';
  if (driver !== 'local') {
    throw new Error(`STORAGE_DRIVER no soportado: ${driver}`);
  }
  instance = new LocalDiskStorage(process.env.FILE_STORAGE_DIR ?? './storage/private');
  return instance;
}

export type { FileStorage };
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -- src/services/storage/__tests__/localDiskStorage.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/storage
git commit -m "feat(storage): interfaz FileStorage + LocalDiskStorage con guard de path traversal"
```

---

### Task 4: Helpers de INE — error, validación, key, flag, migración (TDD)

**Files:**
- Modify: `src/utils/errors.ts`
- Create: `src/services/ineDocument.ts`
- Test: `src/services/__tests__/ineDocument.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

`src/services/__tests__/ineDocument.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  validateIneUpload,
  buildIneKey,
  isIneRequired,
  migrateIneToClient,
  MAX_INE_FILE_SIZE,
  IneFileInput,
} from '../ineDocument';
import { IneUploadError } from '../../utils/errors';

function file(over: Partial<IneFileInput> = {}): IneFileInput {
  return {
    buffer: Buffer.from('x'),
    originalName: 'ine.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    ...over,
  };
}

function expectCode(fn: () => void, code: string) {
  try {
    fn();
    expect.unreachable('debió lanzar IneUploadError');
  } catch (e) {
    expect(e).toBeInstanceOf(IneUploadError);
    expect((e as IneUploadError).code).toBe(code);
  }
}

describe('validateIneUpload', () => {
  it('flag activo sin archivo → INE_REQUIRED', () => {
    expectCode(() => validateIneUpload(undefined, true), 'INE_REQUIRED');
  });

  it('flag inactivo sin archivo → no lanza', () => {
    expect(() => validateIneUpload(undefined, false)).not.toThrow();
  });

  it('mimetype inválido → INVALID_FILE_TYPE', () => {
    expectCode(() => validateIneUpload(file({ mimeType: 'image/gif' }), false), 'INVALID_FILE_TYPE');
  });

  it('tamaño excedido → FILE_TOO_LARGE', () => {
    expectCode(() => validateIneUpload(file({ size: MAX_INE_FILE_SIZE + 1 }), false), 'FILE_TOO_LARGE');
  });

  it('happy path: JPG, PNG y PDF pasan con flag activo', () => {
    for (const mimeType of ['image/jpeg', 'image/png', 'application/pdf']) {
      expect(() => validateIneUpload(file({ mimeType }), true)).not.toThrow();
    }
  });
});

describe('buildIneKey', () => {
  it('genera key ine/{lotId}/{uuid}.{ext}', () => {
    expect(buildIneKey('lot-123', 'image/png')).toMatch(/^ine\/lot-123\/[0-9a-f-]{36}\.png$/);
    expect(buildIneKey('lot-123', 'image/jpeg')).toMatch(/\.jpg$/);
    expect(buildIneKey('lot-123', 'application/pdf')).toMatch(/\.pdf$/);
  });

  it('mimetype desconocido lanza INVALID_FILE_TYPE', () => {
    expectCode(() => buildIneKey('lot-1', 'image/gif'), 'INVALID_FILE_TYPE');
  });
});

describe('isIneRequired', () => {
  afterEach(() => {
    delete process.env.INE_REQUIRED_FOR_RESERVATION;
  });

  it("true cuando la env es 'true'", () => {
    process.env.INE_REQUIRED_FOR_RESERVATION = 'true';
    expect(isIneRequired()).toBe(true);
  });

  it('false por default y con cualquier otro valor', () => {
    expect(isIneRequired()).toBe(false);
    process.env.INE_REQUIRED_FOR_RESERVATION = 'false';
    expect(isIneRequired()).toBe(false);
  });
});

describe('migrateIneToClient', () => {
  it('hace updateMany de lot→client con los ids correctos', async () => {
    const tx = { document: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    await migrateIneToClient(tx, ['lot-1', 'lot-2'], 'client-9');
    expect(tx.document.updateMany).toHaveBeenCalledWith({
      where: { relatedEntity: 'lot', relatedEntityId: { in: ['lot-1', 'lot-2'] }, documentType: 'INE' },
      data: { relatedEntity: 'client', relatedEntityId: 'client-9' },
    });
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- src/services/__tests__/ineDocument.test.ts`
Expected: FAIL — `Cannot find module '../ineDocument'`.

- [ ] **Step 3: Agregar `IneUploadError` a `src/utils/errors.ts`**

Al final del archivo:

```typescript
export type IneUploadErrorCode = 'INE_REQUIRED' | 'INVALID_FILE_TYPE' | 'FILE_TOO_LARGE';

export class IneUploadError extends Error {
  constructor(
    public readonly code: IneUploadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'IneUploadError';
  }
}
```

- [ ] **Step 4: Implementar `src/services/ineDocument.ts`**

```typescript
// src/services/ineDocument.ts
// Helpers para el documento INE en el flujo de apartado.
// La INE vive asociada al Lot al apartar y migra al Client al formalizar contrato
// (ver docs/superpowers/specs/2026-06-10-ine-apartado-design.md).
import { randomUUID } from 'node:crypto';
import { IneUploadError } from '../utils/errors';

export interface IneFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

export const MAX_INE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB, igual que upload de contratos

export const ALLOWED_INE_MIMETYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export function isIneRequired(): boolean {
  return process.env.INE_REQUIRED_FOR_RESERVATION === 'true';
}

export function validateIneUpload(file: IneFileInput | undefined, required: boolean): void {
  if (!file) {
    if (required) {
      throw new IneUploadError('INE_REQUIRED', 'La INE del cliente es obligatoria para apartar');
    }
    return;
  }
  if (!ALLOWED_INE_MIMETYPES[file.mimeType]) {
    throw new IneUploadError('INVALID_FILE_TYPE', 'Solo se aceptan JPG, PNG o PDF');
  }
  if (file.size > MAX_INE_FILE_SIZE) {
    throw new IneUploadError('FILE_TOO_LARGE', 'El archivo no debe superar 10 MB');
  }
}

export function buildIneKey(lotId: string, mimeType: string): string {
  const ext = ALLOWED_INE_MIMETYPES[mimeType];
  if (!ext) {
    throw new IneUploadError('INVALID_FILE_TYPE', 'Solo se aceptan JPG, PNG o PDF');
  }
  return `ine/${lotId}/${randomUUID()}.${ext}`;
}

type TxWithDocuments = {
  document: { updateMany(args: unknown): Promise<unknown> };
};

// Se llama DENTRO de la transacción de createContract: el Document deja de
// colgar del Lot y pasa a ser parte permanente del expediente del Client.
export async function migrateIneToClient(
  tx: TxWithDocuments,
  lotIds: string[],
  clientId: string,
): Promise<void> {
  await tx.document.updateMany({
    where: { relatedEntity: 'lot', relatedEntityId: { in: lotIds }, documentType: 'INE' },
    data: { relatedEntity: 'client', relatedEntityId: clientId },
  });
}
```

- [ ] **Step 5: Verificar que pasan**

Run: `npm test -- src/services/__tests__/ineDocument.test.ts`
Expected: 10 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/errors.ts src/services/ineDocument.ts src/services/__tests__/ineDocument.test.ts
git commit -m "feat(ine): IneUploadError + helpers de validación, key y migración lot→client"
```

---

### Task 5: `reserveLot` con INE y compensación (TDD)

**Files:**
- Modify: `src/services/lot.service.ts`
- Test: `src/services/__tests__/lotService.ine.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

`src/services/__tests__/lotService.ine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    lot: { update: vi.fn() },
    document: { create: vi.fn(), deleteMany: vi.fn() },
  };
  const prisma = {
    lot: { findUnique: vi.fn(), update: vi.fn() },
    document: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  };
  const storage = { saveFile: vi.fn(), getFile: vi.fn(), deleteFile: vi.fn() };
  return { prisma, tx, storage };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mocks.prisma),
  LotStatus: { AVAILABLE: 'AVAILABLE', RESERVED: 'RESERVED', SOLD: 'SOLD', UNAVAILABLE: 'UNAVAILABLE' },
  DocumentType: { CONTRACT: 'CONTRACT', RECEIPT: 'RECEIPT', ID: 'ID', DEED: 'DEED', OTHER: 'OTHER', INE: 'INE' },
}));
vi.mock('../storage', () => ({ getFileStorage: () => mocks.storage }));

import lotService from '../lot.service';
import { IneUploadError } from '../../utils/errors';
import { IneFileInput } from '../ineDocument';

const RESERVE_DATA = { deposit: 5000, clientName: 'Juan Pérez', clientPhone: '8681234567' };

function ineFile(over: Partial<IneFileInput> = {}): IneFileInput {
  return {
    buffer: Buffer.from('ine-bytes'),
    originalName: 'ine-juan.jpg',
    mimeType: 'image/jpeg',
    size: 2048,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.lot.findUnique.mockResolvedValue({ id: 'lot-1', status: 'AVAILABLE' });
  mocks.tx.lot.update.mockResolvedValue({ id: 'lot-1', status: 'RESERVED' });
  mocks.prisma.lot.update.mockResolvedValue({ id: 'lot-1', status: 'RESERVED' });
  mocks.tx.document.create.mockResolvedValue({ id: 'doc-1' });
});

afterEach(() => {
  delete process.env.INE_REQUIRED_FOR_RESERVATION;
});

describe('reserveLot con INE', () => {
  it('flag activo sin archivo → IneUploadError INE_REQUIRED, no toca storage ni reserva', async () => {
    process.env.INE_REQUIRED_FOR_RESERVATION = 'true';
    await expect(lotService.reserveLot('lot-1', RESERVE_DATA)).rejects.toThrow(IneUploadError);
    expect(mocks.storage.saveFile).not.toHaveBeenCalled();
    expect(mocks.prisma.lot.update).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sin archivo y flag inactivo → reserva directa sin transacción ni Document', async () => {
    const result = await lotService.reserveLot('lot-1', RESERVE_DATA);
    expect(result).toEqual({ id: 'lot-1', status: 'RESERVED' });
    expect(mocks.prisma.lot.update).toHaveBeenCalledOnce();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.storage.saveFile).not.toHaveBeenCalled();
  });

  it('con archivo → guarda en storage y crea Document INE en la transacción', async () => {
    await lotService.reserveLot('lot-1', RESERVE_DATA, ineFile(), 'user-7');

    expect(mocks.storage.saveFile).toHaveBeenCalledOnce();
    const [key, buffer, mimeType] = mocks.storage.saveFile.mock.calls[0];
    expect(key).toMatch(/^ine\/lot-1\/[0-9a-f-]{36}\.jpg$/);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(mimeType).toBe('image/jpeg');

    expect(mocks.tx.lot.update).toHaveBeenCalledOnce();
    expect(mocks.tx.document.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentType: 'INE',
        relatedEntity: 'lot',
        relatedEntityId: 'lot-1',
        fileName: 'ine-juan.jpg',
        fileUrl: key,
        fileSize: 2048,
        mimeType: 'image/jpeg',
        uploadedBy: 'user-7',
      }),
    });
  });

  it('con archivo pero sin uploadedBy → lanza y no guarda nada', async () => {
    await expect(lotService.reserveLot('lot-1', RESERVE_DATA, ineFile())).rejects.toThrow();
    expect(mocks.storage.saveFile).not.toHaveBeenCalled();
  });

  it('si la transacción falla tras guardar el archivo → compensa con deleteFile y re-lanza', async () => {
    mocks.tx.document.create.mockRejectedValue(new Error('db caída'));
    await expect(
      lotService.reserveLot('lot-1', RESERVE_DATA, ineFile(), 'user-7')
    ).rejects.toThrow('db caída');

    const savedKey = mocks.storage.saveFile.mock.calls[0][0];
    expect(mocks.storage.deleteFile).toHaveBeenCalledWith(savedKey);
  });

  it('mimetype inválido → INVALID_FILE_TYPE antes de tocar storage', async () => {
    await expect(
      lotService.reserveLot('lot-1', RESERVE_DATA, ineFile({ mimeType: 'image/gif' }), 'user-7')
    ).rejects.toThrow(IneUploadError);
    expect(mocks.storage.saveFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- src/services/__tests__/lotService.ine.test.ts`
Expected: FAIL — los tests con archivo fallan porque `reserveLot` no acepta el 3er/4to argumento ni crea Documents (los dos primeros pueden pasar de chiripa; los 4 restantes deben fallar).

- [ ] **Step 3: Extender `reserveLot` en `src/services/lot.service.ts`**

Actualizar imports al inicio del archivo:

```typescript
import { PrismaClient, LotStatus, DocumentType } from '@prisma/client';
import { CreateLotDto, UpdateLotDto, ReserveLotDto, LotFilters } from '../types/lot.types';
import { getFileStorage } from './storage';
import { buildIneKey, isIneRequired, validateIneUpload, IneFileInput } from './ineDocument';
import { logger } from '../utils/logger';
```

Reemplazar el método `reserveLot` completo (líneas 167-210) por:

```typescript
  // Apartar un lote (opcionalmente con la INE del cliente que aparta)
  async reserveLot(id: string, data: ReserveLotDto, ineFile?: IneFileInput, uploadedBy?: string) {
    const lot = await prisma.lot.findUnique({ where: { id } });

    if (!lot) {
      throw new Error('Lote no encontrado');
    }

    if (lot.status !== LotStatus.AVAILABLE) {
      throw new Error('El lote no está disponible para apartar');
    }

    if (!data.clientName?.trim()) {
      throw new Error('El nombre del cliente es requerido');
    }

    if (!data.clientPhone?.trim()) {
      throw new Error('El teléfono del cliente es requerido');
    }

    validateIneUpload(ineFile, isIneRequired());

    if (ineFile && !uploadedBy) {
      throw new Error('uploadedBy es requerido para subir la INE');
    }

    // deposit >= 0; plazo automático según monto
    const expiryWeeks = data.deposit > 0 ? 3 : 1;
    const today = new Date();
    const expiryDate = this.addBusinessWeeks(today, expiryWeeks);

    const reservationData = {
      status:             LotStatus.RESERVED,
      reservedAt:         today,
      reservationExpiry:  expiryDate,
      reservationDeposit: data.deposit,
      reservedByName:     data.clientName.trim(),
      reservedByPhone:    data.clientPhone.trim(),
      reservedByEmail:    data.clientEmail?.trim() ?? null,
      reservedByAgentId:  data.agentId ?? null,
    };
    const projectInclude = {
      project: { select: { id: true, code: true, name: true } },
    };

    if (!ineFile) {
      return await prisma.lot.update({
        where: { id },
        data: reservationData,
        include: projectInclude,
      });
    }

    // Orden obligatorio (spec): guardar archivo → transacción DB → compensar si falla.
    const storage = getFileStorage();
    const key = buildIneKey(id, ineFile.mimeType);
    await storage.saveFile(key, ineFile.buffer, ineFile.mimeType);

    try {
      return await prisma.$transaction(async (tx) => {
        const updated = await tx.lot.update({
          where: { id },
          data: reservationData,
          include: projectInclude,
        });
        await tx.document.create({
          data: {
            documentType:    DocumentType.INE,
            relatedEntity:   'lot',
            relatedEntityId: id,
            fileName:        ineFile.originalName,
            fileUrl:         key,
            fileSize:        ineFile.size,
            mimeType:        ineFile.mimeType,
            uploadedBy:      uploadedBy!,
          },
        });
        return updated;
      });
    } catch (err) {
      await storage.deleteFile(key).catch((delErr) => {
        logger.error(`Compensación fallida: archivo INE huérfano ${key} — ${delErr}`);
      });
      throw err;
    }
  }
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -- src/services/__tests__/lotService.ine.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Correr toda la suite + typecheck**

Run: `npm test && npm run build`
Expected: todos los tests PASS (incluidos los de `computeDepositSplit`), build sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/services/lot.service.ts src/services/__tests__/lotService.ine.test.ts
git commit -m "feat(lots): reserveLot acepta INE — saveFile + Document en tx con compensación"
```

---

### Task 6: `releaseReservation` borra la INE (TDD)

**Files:**
- Modify: `src/services/lot.service.ts:213-246` (método `releaseReservation`)
- Test: `src/services/__tests__/lotService.ine.test.ts` (mismo archivo, nuevo describe)

- [ ] **Step 1: Agregar tests que fallan**

Al final de `src/services/__tests__/lotService.ine.test.ts`:

```typescript
describe('releaseReservation borra la INE', () => {
  beforeEach(() => {
    mocks.prisma.lot.findUnique.mockResolvedValue({ id: 'lot-1', status: 'RESERVED' });
    mocks.tx.lot.update.mockResolvedValue({ id: 'lot-1', status: 'AVAILABLE' });
    mocks.tx.document.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('con INE: borra Documents en la tx y el archivo físico después', async () => {
    mocks.prisma.document.findMany.mockResolvedValue([
      { id: 'doc-1', fileUrl: 'ine/lot-1/abc.jpg' },
    ]);

    const result = await lotService.releaseReservation('lot-1');

    expect(result).toEqual({ id: 'lot-1', status: 'AVAILABLE' });
    expect(mocks.tx.document.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['doc-1'] } },
    });
    expect(mocks.storage.deleteFile).toHaveBeenCalledWith('ine/lot-1/abc.jpg');
  });

  it('sin INE: libera sin tocar documents ni storage', async () => {
    mocks.prisma.document.findMany.mockResolvedValue([]);

    await lotService.releaseReservation('lot-1');

    expect(mocks.tx.document.deleteMany).not.toHaveBeenCalled();
    expect(mocks.storage.deleteFile).not.toHaveBeenCalled();
  });

  it('si deleteFile falla, la liberación NO se revierte (solo log)', async () => {
    mocks.prisma.document.findMany.mockResolvedValue([
      { id: 'doc-1', fileUrl: 'ine/lot-1/abc.jpg' },
    ]);
    mocks.storage.deleteFile.mockRejectedValue(new Error('disco fuera'));

    const result = await lotService.releaseReservation('lot-1');
    expect(result).toEqual({ id: 'lot-1', status: 'AVAILABLE' });
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- src/services/__tests__/lotService.ine.test.ts`
Expected: FAIL — los 3 tests nuevos (releaseReservation actual no consulta documents ni usa transacción).

- [ ] **Step 3: Reescribir `releaseReservation`**

Reemplazar el método completo (líneas 213-246) por:

```typescript
  // Liberar apartado de un lote.
  // Si el apartado no llegó a contrato, la INE se elimina (registro + archivo):
  // minimización de datos LGPD — no retenemos identificaciones de no-clientes.
  async releaseReservation(id: string) {
    const lot = await prisma.lot.findUnique({ where: { id } });

    if (!lot) {
      throw new Error('Lote no encontrado');
    }

    if (lot.status !== LotStatus.RESERVED) {
      throw new Error('El lote no está apartado');
    }

    const ineDocs = await prisma.document.findMany({
      where: { relatedEntity: 'lot', relatedEntityId: id, documentType: DocumentType.INE },
    });

    const released = await prisma.$transaction(async (tx) => {
      const updated = await tx.lot.update({
        where: { id },
        data: {
          status:             LotStatus.AVAILABLE,
          reservedAt:         null,
          reservationExpiry:  null,
          reservationDeposit: null,
          reservedByName:     null,
          reservedByPhone:    null,
          reservedByEmail:    null,
          reservedByAgentId:  null,
        },
        include: {
          project: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      });

      if (ineDocs.length > 0) {
        await tx.document.deleteMany({
          where: { id: { in: ineDocs.map((d) => d.id) } },
        });
      }

      return updated;
    });

    // Borrado físico fuera de la tx: si falla, el registro ya no existe y un
    // archivo huérfano en disco es recuperable por ops — se loggea, no se revierte.
    const storage = getFileStorage();
    for (const doc of ineDocs) {
      try {
        await storage.deleteFile(doc.fileUrl);
      } catch (err) {
        logger.error(`No se pudo borrar archivo INE ${doc.fileUrl} al liberar lote ${id}: ${err}`);
      }
    }

    return released;
  }
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -- src/services/__tests__/lotService.ine.test.ts`
Expected: 9 tests PASS (6 de reserve + 3 de release).

- [ ] **Step 5: Commit**

```bash
git add src/services/lot.service.ts src/services/__tests__/lotService.ine.test.ts
git commit -m "feat(lots): releaseReservation borra INE (registro en tx + archivo físico)"
```

---

### Task 7: Migración INE en `createContract`

**Files:**
- Modify: `src/services/contract.service.ts` (transacción, línea ~176)

La lógica `migrateIneToClient` ya quedó testeada en Task 4; aquí solo se conecta.

- [ ] **Step 1: Importar el helper**

En los imports de `src/services/contract.service.ts`:

```typescript
import { migrateIneToClient } from './ineDocument';
```

- [ ] **Step 2: Llamar la migración dentro de la transacción**

En `createContract`, dentro del `prisma.$transaction`, inmediatamente después del bloque `tx.lot.updateMany` que limpia los campos de reserva (línea ~176, antes del `return newContract;`):

```typescript
      // 4. Migrar la INE del apartado al expediente del cliente
      // (la INE 'pertenece al Client' como estado final — ver spec INE)
      await migrateIneToClient(tx, data.lotIds, data.clientId);

      return newContract;
```

- [ ] **Step 3: Verificar suite y typecheck**

Run: `npm test && npm run build`
Expected: todos los tests PASS, build sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/services/contract.service.ts
git commit -m "feat(contracts): migrar Document INE lot→client al formalizar contrato"
```

---

### Task 8: Serving seguro — `GET /documents/:id/file` (TDD)

**Files:**
- Create: `src/services/document.service.ts`
- Create: `src/controllers/document.controller.ts`
- Create: `src/routes/document.routes.ts`
- Modify: `src/app.ts` (registro de ruta, línea ~117)
- Test: `src/services/__tests__/documentService.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

`src/services/__tests__/documentService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: { document: { findUnique: vi.fn() } },
  storage: { saveFile: vi.fn(), getFile: vi.fn(), deleteFile: vi.fn() },
}));

vi.mock('../../config/database', () => ({ prisma: mocks.prisma }));
vi.mock('../storage', () => ({ getFileStorage: () => mocks.storage }));

import documentService from '../document.service';
import { ApiError } from '../../middlewares/errorHandler';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getDocumentFile', () => {
  it('devuelve buffer, mimeType y fileName del documento', async () => {
    mocks.prisma.document.findUnique.mockResolvedValue({
      id: 'doc-1',
      fileUrl: 'ine/lot-1/abc.jpg',
      mimeType: 'image/jpeg',
      fileName: 'ine-juan.jpg',
    });
    mocks.storage.getFile.mockResolvedValue(Buffer.from('bytes'));

    const result = await documentService.getDocumentFile('doc-1');

    expect(mocks.storage.getFile).toHaveBeenCalledWith('ine/lot-1/abc.jpg');
    expect(result.buffer.toString()).toBe('bytes');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.fileName).toBe('ine-juan.jpg');
  });

  it('documento inexistente → ApiError 404', async () => {
    mocks.prisma.document.findUnique.mockResolvedValue(null);
    await expect(documentService.getDocumentFile('nope')).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(documentService.getDocumentFile('nope')).rejects.toBeInstanceOf(ApiError);
  });

  it('archivo físico inexistente → ApiError 404', async () => {
    mocks.prisma.document.findUnique.mockResolvedValue({
      id: 'doc-1',
      fileUrl: 'ine/perdido.jpg',
      mimeType: 'image/jpeg',
      fileName: 'x.jpg',
    });
    mocks.storage.getFile.mockRejectedValue(new Error('ENOENT'));
    await expect(documentService.getDocumentFile('doc-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('mimeType null → application/octet-stream', async () => {
    mocks.prisma.document.findUnique.mockResolvedValue({
      id: 'doc-1',
      fileUrl: 'ine/x.bin',
      mimeType: null,
      fileName: 'x.bin',
    });
    mocks.storage.getFile.mockResolvedValue(Buffer.from('b'));
    const result = await documentService.getDocumentFile('doc-1');
    expect(result.mimeType).toBe('application/octet-stream');
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- src/services/__tests__/documentService.test.ts`
Expected: FAIL — `Cannot find module '../document.service'`.

- [ ] **Step 3: Implementar `src/services/document.service.ts`**

```typescript
// src/services/document.service.ts
import { prisma } from '../config/database';
import { ApiError } from '../middlewares/errorHandler';
import { getFileStorage } from './storage';

export class DocumentService {
  async getDocumentFile(id: string) {
    const doc = await prisma.document.findUnique({ where: { id } });

    if (!doc) {
      throw new ApiError(404, 'Documento no encontrado');
    }

    let buffer: Buffer;
    try {
      buffer = await getFileStorage().getFile(doc.fileUrl);
    } catch {
      throw new ApiError(404, 'Archivo no encontrado');
    }

    return {
      buffer,
      mimeType: doc.mimeType ?? 'application/octet-stream',
      fileName: doc.fileName,
    };
  }
}

export default new DocumentService();
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -- src/services/__tests__/documentService.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Crear controller y ruta**

`src/controllers/document.controller.ts`:

```typescript
// src/controllers/document.controller.ts
import { Request, Response } from 'express';
import documentService from '../services/document.service';
import { asyncHandler } from '../middlewares/errorHandler';

// GET /api/v1/documents/:id/file — solo ADMIN/MANAGER (enforced en la ruta)
export const getDocumentFile = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { buffer, mimeType, fileName } = await documentService.getDocumentFile(id);

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
  res.send(buffer);
});
```

`src/routes/document.routes.ts`:

```typescript
// src/routes/document.routes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { getDocumentFile } from '../controllers/document.controller';

const router = Router();

router.use(authenticate);

// Documentos sensibles (INE): solo ADMIN y MANAGER pueden consultarlos.
// Los agentes pueden subir (vía /lots/:id/reserve) pero no consultar.
router.get('/:id/file', authorize('ADMIN', 'MANAGER'), getDocumentFile);

export default router;
```

- [ ] **Step 6: Registrar la ruta en `src/app.ts`**

Junto a los demás imports de rutas:

```typescript
import documentRoutes from './routes/document.routes';
```

Junto a los demás `app.use` de API routes (después de la línea de `contracts`):

```typescript
app.use(`/api/${API_VERSION}/documents`, documentRoutes);
```

- [ ] **Step 7: Typecheck + suite**

Run: `npm test && npm run build`
Expected: PASS / sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/services/document.service.ts src/controllers/document.controller.ts src/routes/document.routes.ts src/app.ts src/services/__tests__/documentService.test.ts
git commit -m "feat(documents): GET /documents/:id/file protegido ADMIN/MANAGER vía FileStorage"
```

---

### Task 9: Multipart en la ruta de reserva + códigos de error en controller

**Files:**
- Modify: `src/routes/lot.routes.ts`
- Modify: `src/controllers/lot.controller.ts:92-110` (método `reserve`)

- [ ] **Step 1: Configurar multer en `src/routes/lot.routes.ts`**

Reemplazar el archivo completo por:

```typescript
// src/routes/lot.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import lotController from '../controllers/lot.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { MAX_INE_FILE_SIZE } from '../services/ineDocument';

// memoryStorage: el buffer pasa por la abstracción FileStorage (swap a S3 sin tocar multer).
// El mimetype se valida en el service (validateIneUpload) — fuente de verdad única.
const ineUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_INE_FILE_SIZE },
});

function handleIneFile(req: Request, res: Response, next: NextFunction) {
  ineUpload.single('ineFile')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          code: 'FILE_TOO_LARGE',
          message: 'El archivo no debe superar 10 MB',
        });
      }
      return res.status(400).json({
        success: false,
        message: err instanceof Error ? err.message : 'Error al procesar el archivo',
      });
    }
    next();
  });
}

const router = Router();

router.use(authenticate);

const adminOrManager = authorize('ADMIN', 'MANAGER');

// Lectura — todos los roles autenticados pueden ver lotes
router.get('/',    lotController.getAll);
router.get('/:id', lotController.getById);

// Escritura — solo ADMIN y MANAGER
router.post('/',   adminOrManager, lotController.create);
router.put('/:id', adminOrManager, lotController.update);

// Apartados — solo ADMIN y MANAGER (acepta multipart con campo ineFile opcional)
router.post('/:id/reserve',   adminOrManager, handleIneFile, lotController.reserve);
router.delete('/:id/reserve', adminOrManager, lotController.releaseReservation);

export default router;
```

- [ ] **Step 2: Actualizar `reserve` en `src/controllers/lot.controller.ts`**

Agregar imports al inicio:

```typescript
import { IneUploadError } from '../utils/errors';
import { IneFileInput } from '../services/ineDocument';
```

Reemplazar el método `reserve` (líneas 92-110) por:

```typescript
  // POST /api/v1/lots/:id/reserve  (multipart/form-data, campo de archivo: ineFile)
  async reserve(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const file = (req as any).file as Express.Multer.File | undefined;

      // multipart entrega todos los campos como string
      const data: ReserveLotDto = {
        deposit:     Number(req.body.deposit) || 0,
        clientName:  req.body.clientName,
        clientPhone: req.body.clientPhone,
        clientEmail: req.body.clientEmail || undefined,
        agentId:     req.body.agentId || undefined,
      };

      const ineFile: IneFileInput | undefined = file
        ? {
            buffer:       file.buffer,
            originalName: file.originalname,
            mimeType:     file.mimetype,
            size:         file.size,
          }
        : undefined;

      const uploadedBy = (req as any).user?.userId as string | undefined;
      const lot = await lotService.reserveLot(id, data, ineFile, uploadedBy);

      res.status(200).json({
        success: true,
        message: 'Lote apartado exitosamente',
        data: lot,
      });
    } catch (error: any) {
      if (error instanceof IneUploadError) {
        return res.status(400).json({
          success: false,
          code: error.code,
          message: error.message,
        });
      }
      res.status(400).json({
        success: false,
        message: error.message || 'Error al apartar lote',
      });
    }
  }
```

- [ ] **Step 3: Typecheck + suite**

Run: `npm test && npm run build`
Expected: PASS / sin errores.

- [ ] **Step 4: Verificación manual con curl** (requiere backend corriendo: `npm run dev`, y un token de admin)

```bash
# Login para obtener token (ajustar credenciales del seed)
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"..."}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["accessToken"])')

# Apartar con INE (usar un lotId AVAILABLE real)
curl -s -X POST "http://localhost:4000/api/v1/lots/<LOT_ID>/reserve" \
  -H "Authorization: Bearer $TOKEN" \
  -F deposit=5000 -F "clientName=Juan Pérez" -F clientPhone=8681234567 \
  -F ineFile=@/ruta/a/una/imagen.jpg
```

Expected: `{"success":true,...}`; archivo nuevo bajo `storage/private/ine/<lotId>/`; fila nueva en `documents` con `documentType=INE`, `relatedEntity=lot`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/lot.routes.ts src/controllers/lot.controller.ts
git commit -m "feat(lots): POST /:id/reserve acepta multipart ineFile + códigos de error INE"
```

---

### Task 10: Metadata INE en respuestas de lotes y cliente

**Files:**
- Modify: `src/services/lot.service.ts` (nuevo método)
- Modify: `src/controllers/lot.controller.ts:27-70` (`getAll`, `getById`)
- Modify: `src/controllers/client.controller.ts` (`getClientById`, línea ~23)

- [ ] **Step 1: Agregar `getIneDocumentsByLotIds` a `src/services/lot.service.ts`**

Después del método `releaseReservation`:

```typescript
  // Metadata de Documents INE colgados de lotes (para enriquecer respuestas).
  // Devuelve el doc más reciente por lote.
  async getIneDocumentsByLotIds(lotIds: string[]) {
    const map = new Map<string, { id: string; fileName: string; mimeType: string | null }>();
    if (lotIds.length === 0) return map;

    const docs = await prisma.document.findMany({
      where: {
        relatedEntity:   'lot',
        relatedEntityId: { in: lotIds },
        documentType:    DocumentType.INE,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, fileName: true, mimeType: true, relatedEntityId: true },
    });

    for (const d of docs) {
      if (!map.has(d.relatedEntityId)) {
        map.set(d.relatedEntityId, { id: d.id, fileName: d.fileName, mimeType: d.mimeType });
      }
    }
    return map;
  }
```

- [ ] **Step 2: Enriquecer `getAll` en `src/controllers/lot.controller.ts`**

Reemplazar el cuerpo del `try` de `getAll` (después de construir `filters`) por:

```typescript
      const lots = await lotService.getLots(filters);

      // Metadata INE: hasIne para todos; ineDocument solo ADMIN/MANAGER
      // (los agentes suben pero no consultan — spec INE).
      const reservedIds = lots.filter((l) => l.status === 'RESERVED').map((l) => l.id);
      const ineMap = await lotService.getIneDocumentsByLotIds(reservedIds);
      const role = (req as any).user?.role;
      const isAdminOrManager = role === 'ADMIN' || role === 'MANAGER';

      const data = lots.map((lot) => {
        const doc = ineMap.get(lot.id);
        return {
          ...lot,
          hasIne: !!doc,
          ineDocument: isAdminOrManager && doc ? doc : null,
        };
      });

      res.status(200).json({
        success: true,
        data,
        count: data.length,
      });
```

- [ ] **Step 3: Enriquecer `getById` en `src/controllers/lot.controller.ts`**

Reemplazar el cuerpo del `try` de `getById` por:

```typescript
      const { id } = req.params;
      const lot = await lotService.getLotById(id);

      const ineMap = await lotService.getIneDocumentsByLotIds([id]);
      const doc = ineMap.get(id);
      const role = (req as any).user?.role;
      const isAdminOrManager = role === 'ADMIN' || role === 'MANAGER';

      res.status(200).json({
        success: true,
        data: {
          ...lot,
          hasIne: !!doc,
          ineDocument: isAdminOrManager && doc ? doc : null,
        },
      });
```

- [ ] **Step 4: Agregar `ineDocument` a `getClientById` en `src/controllers/client.controller.ts`**

La ruta `GET /clients/:id` ya es ADMIN/MANAGER, así que se incluye sin condicional de rol. Reemplazar el final del handler `getClientById` (desde el `if (!client)`) por:

```typescript
  if (!client) {
    throw new ApiError(404, 'Client not found');
  }

  // INE migrada al expediente del cliente (la más reciente)
  const ineDocument = await prisma.document.findFirst({
    where: { relatedEntity: 'client', relatedEntityId: id, documentType: 'INE' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, fileName: true, mimeType: true },
  });

  res.status(200).json({
    status: 'success',
    data: { client: { ...client, ineDocument } },
  });
```

- [ ] **Step 5: Typecheck + suite**

Run: `npm test && npm run build`
Expected: PASS / sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/services/lot.service.ts src/controllers/lot.controller.ts src/controllers/client.controller.ts
git commit -m "feat(api): metadata INE — hasIne para todos, ineDocument solo ADMIN/MANAGER"
```

---

### Task 11: Frontend — campo INE en el form de apartado

**Files:**
- Modify: `frontend/src/hooks/useLotes.ts` (interfaz `Lote`)
- Modify: `frontend/src/app/(admin)/lotes/page.tsx` (hook `useReserveLot`, `LoteModal`)

> Antes de tocar código del frontend: leer la guía relevante en
> `frontend/node_modules/next/dist/docs/` — esta versión de Next.js tiene breaking
> changes (requisito de `frontend/AGENTS.md`). Los cambios de esta task son de
> componentes cliente y axios, pero verifica igualmente.

- [ ] **Step 1: Extender la interfaz `Lote` en `frontend/src/hooks/useLotes.ts`**

Después de `project?: ...` agregar:

```typescript
  hasIne?: boolean;
  ineDocument?: { id: string; fileName: string; mimeType: string | null } | null;
```

- [ ] **Step 2: Cambiar `useReserveLot` a multipart en `frontend/src/app/(admin)/lotes/page.tsx`**

Reemplazar el hook (líneas 13-24) por:

```typescript
const useReserveLot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lotId, formData }: { lotId: string; formData: FormData }) => {
      const res = await api.post(`/lots/${lotId}/reserve`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lotes'] });
    },
  });
};
```

- [ ] **Step 3: Constantes y estado del archivo en `LoteModal`**

Después de `const PROJECT_ID = ...` (nivel módulo):

```typescript
const INE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const INE_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const INE_REQUIRED = process.env.NEXT_PUBLIC_INE_REQUIRED === 'true';
```

Dentro de `LoteModal`, junto a los demás `useState`:

```typescript
  const [ineFile, setIneFile] = useState<File | null>(null);
```

- [ ] **Step 4: Reescribir `handleSubmit` con validación client-side y FormData**

Reemplazar `handleSubmit` (líneas 57-69) por:

```typescript
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (INE_REQUIRED && !ineFile) {
      setError('La INE del cliente es obligatoria para apartar');
      return;
    }
    if (ineFile && !INE_ALLOWED_TYPES.includes(ineFile.type)) {
      setError('Solo se aceptan JPG, PNG o PDF');
      return;
    }
    if (ineFile && ineFile.size > INE_MAX_SIZE) {
      setError('El archivo no debe superar 10 MB');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('deposit', String(deposit));
      formData.append('clientName', clientName);
      formData.append('clientPhone', clientPhone);
      if (clientEmail) formData.append('clientEmail', clientEmail);
      if (ineFile) formData.append('ineFile', ineFile);

      await reserveLot.mutateAsync({ lotId: lote.id, formData });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al apartar el lote');
    }
  };
```

- [ ] **Step 5: Agregar el campo de archivo al form**

En la VISTA 2 (form de apartado), después del `<div>` del campo "Anticipo" (cierra en la línea ~206) y antes del bloque `{error && ...}`:

```tsx
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                INE del cliente{INE_REQUIRED ? ' *' : ''}
              </label>
              {ineFile ? (
                <div
                  className="flex items-center justify-between gap-2 px-3 py-2"
                  style={{
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-secondary)',
                  }}
                >
                  <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {ineFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIneFile(null)}
                    className="p-1 rounded-lg transition flex-shrink-0"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={e => setIneFile(e.target.files?.[0] ?? null)}
                  style={inputStyle}
                />
              )}
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                JPG, PNG o PDF · máx 10 MB
              </p>
            </div>
```

- [ ] **Step 6: Verificar build del frontend**

Run: `cd frontend && npm run build`
Expected: build sin errores.

- [ ] **Step 7: Verificación manual**

Con backend y frontend corriendo: abrir `/lotes`, click en lote disponible → "Apartar lote" → llenar form, adjuntar un JPG, confirmar. Expected: apartado exitoso, archivo en `storage/private/ine/`, registro en tabla `documents`. Repetir con un `.gif` → error "Solo se aceptan JPG, PNG o PDF" sin llegar al backend.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/hooks/useLotes.ts "frontend/src/app/(admin)/lotes/page.tsx"
git commit -m "feat(frontend): campo INE en form de apartado — FormData + validación client-side"
```

---

### Task 12: Frontend — "Ver INE" en lote reservado y detalle de cliente

**Files:**
- Modify: `frontend/src/app/(admin)/lotes/page.tsx` (`LoteBox`, `LoteModal` VISTA 1)
- Modify: `frontend/src/hooks/useClientes.ts` (interfaz `Cliente`)
- Modify: `frontend/src/app/(admin)/clientes/[id]/page.tsx`

- [ ] **Step 1: Hacer clickeables los lotes RESERVED en `LoteBox`**

Hoy solo los AVAILABLE abren el modal (línea 250). Cambiar:

```typescript
  const clickable = lote.status === 'AVAILABLE' || lote.status === 'RESERVED';
```

- [ ] **Step 2: Info de apartado + botón "Ver INE" en la VISTA 1 del modal**

Dentro de `LoteModal`, junto a los demás estados:

```typescript
  const [openingIne, setOpeningIne] = useState(false);

  const handleVerIne = async () => {
    if (!lote.ineDocument) return;
    setOpeningIne(true);
    setError('');
    try {
      const res = await api.get(`/documents/${lote.ineDocument.id}/file`, { responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch {
      setError('No se pudo abrir la INE');
    } finally {
      setOpeningIne(false);
    }
  };
```

En la VISTA 1, dentro del `<div className="px-6 py-5 space-y-3 text-sm">`, después del bloque de `orientation` (línea ~129), agregar:

```tsx
              {lote.status === 'RESERVED' && (
                <>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-secondary)' }}>Apartado por</span>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {lote.reservedByName ?? 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-secondary)' }}>Anticipo</span>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {formatCurrency(lote.reservationDeposit ?? 0)}
                    </span>
                  </div>
                </>
              )}
```

Después del bloque del botón "Apartar lote" (`{lote.status === 'AVAILABLE' && ...}`, cierra línea ~141), agregar:

```tsx
            {lote.status === 'RESERVED' && lote.ineDocument && (
              <div className="px-6 pb-5 space-y-2">
                {error && (
                  <p className="text-xs font-medium" style={{ color: 'var(--danger)' }}>{error}</p>
                )}
                <button
                  onClick={handleVerIne}
                  disabled={openingIne}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
                >
                  {openingIne ? 'Abriendo…' : `Ver INE — ${lote.ineDocument.fileName}`}
                </button>
              </div>
            )}
```

Nota: el botón solo aparece si la respuesta trae `ineDocument`, y el backend solo lo incluye para ADMIN/MANAGER — no hace falta chequeo de rol client-side.

- [ ] **Step 3: Extender la interfaz `Cliente` en `frontend/src/hooks/useClientes.ts`**

Después de `createdAt: string;`:

```typescript
  ineDocument?: { id: string; fileName: string; mimeType: string | null } | null;
```

- [ ] **Step 4: Card "Ver INE" en `frontend/src/app/(admin)/clientes/[id]/page.tsx`**

Agregar import:

```typescript
import api from '@/lib/api';
```

Dentro del componente `ClienteDetallePage`, antes del `return`:

```typescript
  const handleVerIne = async () => {
    if (!cliente.ineDocument) return;
    try {
      const res = await api.get(`/documents/${cliente.ineDocument.id}/file`, { responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch {
      alert('No se pudo abrir la INE');
    }
  };
```

En el grid de datos (`grid-cols-1 sm:grid-cols-3`, línea ~110), después de la card de "Código":

```tsx
          {cliente.ineDocument && (
            <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <FileText className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              <div className="min-w-0">
                <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>INE</p>
                <button
                  onClick={handleVerIne}
                  className="text-sm truncate hover:underline"
                  style={{ color: 'var(--accent)' }}
                >
                  {cliente.ineDocument.fileName}
                </button>
              </div>
            </div>
          )}
```

(`FileText` ya está importado en ese archivo.)

- [ ] **Step 5: Verificar build del frontend**

Run: `cd frontend && npm run build`
Expected: build sin errores.

- [ ] **Step 6: Verificación manual**

Como admin: click en un lote reservado (dorado) → modal muestra "Apartado por", "Anticipo" y botón "Ver INE" → abre el archivo en pestaña nueva. Formalizar un contrato sobre ese lote en `/nuevo-contrato` → el detalle del cliente nuevo muestra la card INE con el mismo archivo, y el lote (ya SOLD) deja de mostrarla.

- [ ] **Step 7: Commit**

```bash
git add "frontend/src/app/(admin)/lotes/page.tsx" frontend/src/hooks/useClientes.ts "frontend/src/app/(admin)/clientes/[id]/page.tsx"
git commit -m "feat(frontend): Ver INE en modal de lote reservado y detalle de cliente"
```

---

### Task 13: Verificación final end-to-end

**Files:** ninguno nuevo.

- [ ] **Step 1: Suite completa + builds**

Run: `npm test && npm run build && cd frontend && npm run build && cd ..`
Expected: todos los tests PASS, ambos builds sin errores.

- [ ] **Step 2: E2E manual — ciclo completo de la INE**

Con `INE_REQUIRED_FOR_RESERVATION=false` en `.env`:

1. **Apartar sin INE** → OK (flag off, no fricción en dev).
2. **Apartar otro lote con INE (JPG)** → OK; verificar archivo en `storage/private/ine/<lotId>/` y fila en `documents` (`relatedEntity='lot'`).
3. **Verificar acceso directo bloqueado**: `curl http://localhost:4000/uploads/...` no expone nada de `storage/` (directorios distintos), y `GET /api/v1/documents/<docId>/file` sin token → 401; con token de AGENT → 403; con token ADMIN → archivo.
4. **Liberar el apartado del paso 2** (`DELETE /lots/:id/reserve`) → fila de `documents` eliminada Y archivo físico eliminado.
5. **Apartar con INE de nuevo y formalizar contrato** en `/nuevo-contrato` sobre ese lote → en `documents`, la fila ahora tiene `relatedEntity='client'` y `relatedEntityId=<clientId>`; el detalle del cliente muestra "Ver INE".

Con `INE_REQUIRED_FOR_RESERVATION=true` y `NEXT_PUBLIC_INE_REQUIRED=true` (reiniciar ambos servers):

6. **Apartar sin INE desde la UI** → bloqueado client-side con mensaje.
7. **Apartar sin INE vía curl** (saltando la UI) → 400 `{"code":"INE_REQUIRED"}` — el backend es la fuente de verdad.

- [ ] **Step 3: Restaurar flags de dev**

Dejar `INE_REQUIRED_FOR_RESERVATION=false` y `NEXT_PUBLIC_INE_REQUIRED=false` en los `.env` locales.

- [ ] **Step 4: Commit final si quedó algo suelto**

Run: `git status`
Expected: working tree limpio respecto a esta feature (los archivos previos no relacionados — README, .codegraph — quedan como estaban).
