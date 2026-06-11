# Diseño: INE del cliente en el flujo de apartado

**Fecha:** 2026-06-10
**Solicitado por:** Arq. Alberto (vía Miguel)
**Estado:** Aprobado en brainstorming

## Contexto de negocio

El apartado de un lote debe incluir la captura de la INE del cliente que aparta, para
formalizar el expediente desde el primer contacto. La INE es dato personal sensible
(LGPD México): su almacenamiento, acceso y borrado se diseñan con minimización de datos.

## Decisiones cerradas (no renegociables en implementación)

1. **Ciclo de vida del documento:** la INE se sube al apartar y se guarda asociada al
   `Lot` reservado como archivo temporal. Al formalizar el contrato en el wizard de
   nuevo contrato, el registro migra automáticamente al `Client` creado en ese paso.
   "La INE pertenece al Client" es el **estado final**, no el inicial.
2. **Borrado al liberar:** si el apartado se libera sin llegar a contrato, se elimina
   el registro `Document` y el archivo físico. No hay base legal para retener
   identificaciones de personas que no son clientes. Sin job de purga ni retención.
3. **Modelado:** se reutiliza el modelo `Document` existente (polimórfico). Nada de
   tablas nuevas ni campos sueltos en `Lot`/`Client`.
4. **Transporte:** multipart en el `POST /lots/:id/reserve` existente, un solo submit.
   Dos requests encadenados quedó descartado por el estado inconsistente que genera.
5. **UI:** campo de archivo al final del form de apartado actual (misma vista del modal).
6. **Flag de obligatoriedad:** solo aplica a apartados nuevos; los existentes sin INE
   nunca se bloquean.
7. **RBAC:** solo ADMIN y MANAGER pueden ver/descargar la INE. Quien puede apartar
   puede subirla (hoy la ruta de reserva es ADMIN/MANAGER; si AGENT gana ese permiso
   en el futuro, el upload viaja con él — subir ≠ consultar).

### Fuera de scope (esta iteración)

- Configuración real de S3/AWS (solo la abstracción).
- OCR/validación de contenido de la INE (documentado como iteración futura de alto
  valor: pre-poblar el wizard de nuevo contrato con datos extraídos).
- OTP de verificación de teléfono vía SMS/WhatsApp (backlog post-producción).
- Vencimiento/renovación de INEs.
- Bug del input "Anticipo" del modal (deuda ya registrada).
- Job de expiración automática de reservas (no existe hoy; la liberación es manual).

## 1. Modelo de datos

Cambios en `prisma/schema.prisma`:

- Enum `DocumentType`: agregar valor `INE`.
- Modelo `Document`: agregar `@@index([relatedEntity, relatedEntityId])`.

Ciclo de vida del registro `Document` de una INE:

| Momento | relatedEntity | relatedEntityId | Acción |
|---|---|---|---|
| Apartar con archivo | `'lot'` | lotId | `document.create` |
| Formalizar contrato | `'client'` | clientId | `document.updateMany` (2 campos; archivo no se mueve) |
| Liberar sin contrato | — | — | `document.delete` + `deleteFile` |

`Document.fileUrl` almacena la **key de storage** (ej. `ine/{lotId}/{uuid}.jpg`),
nunca una URL pública. `uploadedBy` = userId del JWT que apartó.

Si un contrato formaliza varios lotes y más de uno tiene INE, todos los Documents
migran al mismo Client; para visualización se toma el más reciente (`createdAt desc`).

## 2. Abstracción de storage

Nuevo módulo `src/services/storage/`:

```ts
// src/services/storage/file-storage.ts
export interface FileStorage {
  saveFile(key: string, data: Buffer, mimeType: string): Promise<void>;
  getFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
}
```

- `local-disk-storage.ts`: implementación con `fs/promises`. Base dir desde env
  `FILE_STORAGE_DIR` (default `./storage/private`). Crea subdirectorios según la key.
  **Deliberadamente fuera de `/uploads`**, que se sirve público vía `express.static`
  (`src/app.ts:55`). La INE jamás toca un directorio estático.
- `index.ts`: factory `getFileStorage(): FileStorage` que resuelve por env
  `STORAGE_DRIVER` (`local` único valor hoy; `s3` futuro implementa la misma interfaz
  sin tocar consumidores).
- `getFile` de key inexistente lanza error (mapea a 404 en el endpoint de serving).
- El directorio `storage/` se agrega a `.gitignore`.

## 3. Backend — flujo de apartado

`POST /api/v1/lots/:id/reserve` acepta `multipart/form-data`:

- Campos de texto: los actuales de `ReserveLotDto` (deposit, clientName, clientPhone,
  clientEmail?, agentId?). `deposit` llega como string en multipart → parsear a número.
- Campo de archivo: `ineFile` (opcional a nivel HTTP).

Middleware multer en `lot.routes.ts`, **`memoryStorage`** (no diskStorage como
contratos — el buffer pasa por la abstracción para que el swap a S3 no toque multer):

- `limits.fileSize`: 10 MB (consistente con upload de contratos).
- `fileFilter`: solo `image/jpeg`, `image/png`, `application/pdf`.

Orden interno en `lot.service.reserveLot` (extendido con el archivo y `uploadedBy`):

1. Validaciones actuales (lote existe, status AVAILABLE, nombre y teléfono).
2. Flag: si `INE_REQUIRED_FOR_RESERVATION === 'true'` y no llegó archivo →
   `ApiError 400` código `INE_REQUIRED`.
3. Si llegó archivo: `saveFile(key, buffer, mimeType)` con key `ine/{lotId}/{uuid}.{ext}`.
4. Transacción Prisma: update del lote (campos de reserva actuales) +
   `document.create` (`documentType: 'INE'`, `relatedEntity: 'lot'`,
   `relatedEntityId: lotId`, fileName original, fileSize, mimeType, uploadedBy).
5. Si la transacción falla después de guardar el archivo: `deleteFile(key)` como
   compensación y re-throw. **Invariantes:** nunca queda apartado sin INE con flag
   activo; nunca queda archivo sin registro en DB.

## 4. Backend — serving seguro, migración y borrado

### Serving

Nuevo `GET /api/v1/documents/:id/file` (`src/routes/document.routes.ts` +
controller). Protección: `authenticate` + `authorize('ADMIN', 'MANAGER')`. Lee el
`Document`, `getFile(fileUrl)` y responde con `Content-Type: {mimeType}` y
`Content-Disposition: inline; filename="{fileName}"`. 404 si no existe el registro o
el archivo. Un solo endpoint cubre INE colgada de lote y de cliente.

### Exposición de metadata

- `GET /lots/:id` y `GET /clients/:id` incluyen:
  - Para ADMIN/MANAGER: `ineDocument: { id, fileName, mimeType } | null`.
  - Para otros roles: solo `hasIne: boolean` (la UI puede mostrar "INE adjunta ✓"
    sin exponer nada consultable).
- Lookup: `document.findFirst({ relatedEntity, relatedEntityId, documentType: 'INE' },
  orderBy createdAt desc)`.

### Migración al formalizar contrato

Dentro de la transacción existente de `createContract`
(`src/services/contract.service.ts:127`), junto a la limpieza de campos `reservedBy*`:

```ts
await tx.document.updateMany({
  where: { relatedEntity: 'lot', relatedEntityId: { in: lotIds }, documentType: 'INE' },
  data: { relatedEntity: 'client', relatedEntityId: data.clientId },
});
```

Esto cumple el mínimo viable de reutilización: el wizard de nuevo contrato **no pide
INE** — si el lote apartado ya la tiene, migra sola; nadie re-sube nada. El campo
string `ine` del paso 1 del wizard (clave de elector) no se toca.

### Borrado al liberar

En `releaseReservation` (`src/services/lot.service.ts:213`):

1. Buscar Document INE del lote.
2. Transacción: liberar lote + `document.delete`.
3. Tras el commit: `deleteFile(key)`. Si el borrado físico falla, log de error con la
   key (el registro ya no existe; un archivo huérfano en disco es recuperable por ops,
   un registro sin archivo no).

No existe job de expiración: la liberación manual es el único camino hoy y este hook
lo cubre. Si algún día se automatiza la expiración, debe pasar por este mismo método.

## 5. Flag de obligatoriedad

| Variable | Lado | Rol | Default |
|---|---|---|---|
| `INE_REQUIRED_FOR_RESERVATION` | backend | **Fuente de verdad** — validación en service | `false` |
| `NEXT_PUBLIC_INE_REQUIRED` | frontend | Solo UX: asterisco + validación client-side | `false` |

Si divergen, manda el backend (el form muestra el mensaje del 400 `INE_REQUIRED`).
Ambas documentadas en `.env.example` (y el equivalente del frontend). Default `false`
en desarrollo para no friccionar pruebas (pedido explícito de Miguel); en producción
se activa y aplica **solo a apartados nuevos**.

## 6. Frontend

Todo en `frontend/src/app/(admin)/lotes/page.tsx` (`LoteModal`) salvo lo indicado.

### Form de apartado

- Campo de archivo al final, debajo de "Anticipo":
  `<input type="file" accept=".jpg,.jpeg,.png,.pdf">` con estilo consistente con los
  inputs actuales. Label "INE del cliente" (+ `*` si `NEXT_PUBLIC_INE_REQUIRED`).
- Muestra nombre del archivo seleccionado y control para quitarlo.
- Validación client-side antes de submit: tipo permitido y ≤ 10 MB.
- Submit arma `FormData` (campos actuales + `ineFile`); `useReserveLot` manda
  multipart en lugar de JSON.

### Visualización (solo admin/manager)

- Vista detalle de lote `RESERVED`: junto a "Apartado por:", botón "Ver INE" si la
  respuesta trae `ineDocument` (solo admin/manager la reciben). El endpoint requiere
  JWT → el botón hace fetch del blob con el cliente `api` y abre un object URL en
  pestaña nueva (no `<a href>` directo).
- Detalle de cliente: mismo botón cuando el cliente tiene INE migrada.

> Nota de implementación: `frontend/AGENTS.md` exige leer las guías en
> `node_modules/next/dist/docs/` antes de escribir código Next — la versión instalada
> tiene breaking changes respecto a lo conocido.

## 7. Manejo de errores

| Caso | Respuesta | Código | UI |
|---|---|---|---|
| Flag activo, sin archivo | 400 | `INE_REQUIRED` | "La INE del cliente es obligatoria para apartar" |
| Mimetype inválido | 400 | `INVALID_FILE_TYPE` | "Solo se aceptan JPG, PNG o PDF" |
| Archivo > 10 MB | 400 | `FILE_TOO_LARGE` | "El archivo no debe superar 10 MB" |
| Fallo DB tras saveFile | 500 | — | Error genérico; compensación borró el archivo y el lote no quedó reservado |
| Document/archivo no existe en serving | 404 | — | — |
| Consulta sin rol ADMIN/MANAGER | 403 | — | El botón "Ver INE" ni siquiera se renderiza |

Los errores de multer (`LIMIT_FILE_SIZE`, fileFilter) se mapean a los códigos de la
tabla en `errorHandler`.

## 8. Testing (vitest, TDD)

- **`LocalDiskStorage`** (unit, dir temporal): round-trip saveFile → getFile →
  deleteFile; getFile de key inexistente lanza; saveFile crea subdirectorios.
- **Helper puro `validateIneUpload(file, required)`** (estilo
  `computeDepositSplit.test.ts`): flag on sin archivo → error `INE_REQUIRED`;
  mimetype inválido; tamaño excedido; happy path JPG/PNG/PDF; flag off sin archivo OK.
- **`reserveLot`** (prisma mockeado con `vi.mock`): con archivo crea Document INE
  asociado al lote; si la transacción falla, llama `deleteFile` (compensación) y
  re-lanza; flag on sin archivo no toca storage ni DB.
- **`createContract`**: la migración `updateMany` corre dentro de la transacción con
  los `lotIds` y `clientId` correctos.
- **`releaseReservation`**: borra el Document y llama `deleteFile`; sin INE no toca
  storage.

## Iteraciones futuras documentadas

- **OCR de INE** (alto valor): extraer datos del documento para pre-poblar el paso 1
  del wizard de nuevo contrato.
- **OTP SMS/WhatsApp** para verificación de teléfono en apartado.
- **Driver S3** implementando `FileStorage` (la interfaz ya queda lista).
- **Expiración automática de reservas** (si se construye, debe reutilizar
  `releaseReservation` para heredar el borrado de INE).
