# Selector de proyecto + vista "Todos los proyectos" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quitar el hardcode de Monarca II en Dashboard/Lotes/Contratos/Cuotas y agregar un selector de proyecto global (con opción "Todos los proyectos") manejado por React Context + localStorage.

**Architecture:** Un `ProjectProvider` (React Context) montado en el layout de admin guarda `selectedProjectId` (`null` = "Todos"), lo persiste en `localStorage`, y expone `useProjectSelection()`. Un `ProjectSelector` (dropdown) en el sidebar lo controla. Las páginas leen el contexto y pasan el `projectId` a sus hooks (que siguen siendo puros). El backend ya agrega cuando no recibe `projectId`, así que no se toca.

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript 5 + @tanstack/react-query 5. Tests: Vitest (nuevo en el frontend).

## Global Constraints

- **Solo frontend.** Cero cambios de backend, cero migraciones.
- Todo el trabajo ocurre en `frontend/` y se commitea en la rama `feat/selector-proyecto-vista-global`.
- Alias de imports del frontend: `@/*` → `frontend/src/*`.
- `selectedProjectId === null` significa "Todos los proyectos" (no se manda `projectId` al backend → agrega).
- Componentes que usan hooks/estado del cliente deben llevar `'use client';` al inicio.
- Los archivos de test de la lógica pura usan **import relativo** (`./projectSelection`), no el alias `@/`, para no requerir configuración extra de Vitest.

---

### Task 0: Configurar Vitest en el frontend

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`

**Interfaces:**
- Produces: el comando `npm test` (alias de `vitest run`) disponible en `frontend/`.

- [ ] **Step 1: Instalar Vitest**

```bash
cd /Users/miguelmachuca/centralhub/frontend
npm i -D vitest
```

Expected: `vitest` agregado a `devDependencies`. Verificar: `grep vitest package.json`.

- [ ] **Step 2: Crear `frontend/vitest.config.ts`**

Contenido exacto:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Agregar scripts a `frontend/package.json`**

En el bloque `"scripts"` (que hoy es `dev`/`build`/`start`/`lint`), agregar después de `"lint": "eslint"` (recordando la coma):

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verificar que Vitest arranca (sin tests aún)**

```bash
cd /Users/miguelmachuca/centralhub/frontend
npm test
```

Expected: Vitest arranca y reporta `No test files found` (exit 0 o 1 — cualquiera confirma que el binario está instalado).

- [ ] **Step 5: Commit**

```bash
cd /Users/miguelmachuca/centralhub
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts
git commit -m "chore(frontend): setup Vitest como test runner"
```

---

### Task 1: Lógica pura de selección (TDD)

**Files:**
- Create: `frontend/src/contexts/projectSelection.ts`
- Test: `frontend/src/contexts/projectSelection.test.ts`

**Interfaces:**
- Produces:
  - `STORAGE_KEY: string` = `'centralhub.selectedProjectId'`
  - `readStoredProjectId(storage: Pick<Storage,'getItem'>): string | null`
  - `writeStoredProjectId(storage: Pick<Storage,'setItem'|'removeItem'>, id: string | null): void`
  - `resolveStoredSelection(projects: { id: string }[], storedId: string | null): string | null`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/contexts/projectSelection.test.ts` con este contenido EXACTO:

```ts
import { describe, it, expect } from 'vitest';
import {
  STORAGE_KEY,
  readStoredProjectId,
  writeStoredProjectId,
  resolveStoredSelection,
} from './projectSelection';

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    _dump: () => Object.fromEntries(m),
  };
}

describe('readStoredProjectId', () => {
  it('devuelve null cuando no hay nada guardado', () => {
    expect(readStoredProjectId(fakeStorage())).toBeNull();
  });
  it('devuelve el id guardado', () => {
    const s = fakeStorage({ [STORAGE_KEY]: 'abc' });
    expect(readStoredProjectId(s)).toBe('abc');
  });
});

describe('writeStoredProjectId', () => {
  it('guarda el id', () => {
    const s = fakeStorage();
    writeStoredProjectId(s, 'xyz');
    expect(s._dump()[STORAGE_KEY]).toBe('xyz');
  });
  it('borra la clave cuando el id es null', () => {
    const s = fakeStorage({ [STORAGE_KEY]: 'xyz' });
    writeStoredProjectId(s, null);
    expect(STORAGE_KEY in s._dump()).toBe(false);
  });
});

describe('resolveStoredSelection', () => {
  const projects = [{ id: 'a' }, { id: 'b' }];
  it('null se queda en null (Todos)', () => {
    expect(resolveStoredSelection(projects, null)).toBeNull();
  });
  it('id existente se conserva', () => {
    expect(resolveStoredSelection(projects, 'b')).toBe('b');
  });
  it('id inexistente cae a null', () => {
    expect(resolveStoredSelection(projects, 'zzz')).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

```bash
cd /Users/miguelmachuca/centralhub/frontend
npx vitest run src/contexts/projectSelection.test.ts
```

Expected: FALLA con error de módulo no encontrado (`Cannot find module './projectSelection'`).

- [ ] **Step 3: Implementar el módulo**

Crear `frontend/src/contexts/projectSelection.ts` con este contenido EXACTO:

```ts
// Lógica pura de selección de proyecto (sin React, sin DOM).
// El storage se recibe por parámetro para poder testear sin jsdom.

export const STORAGE_KEY = 'centralhub.selectedProjectId';

type Readable = Pick<Storage, 'getItem'>;
type Writable = Pick<Storage, 'setItem' | 'removeItem'>;

/** Lee el id guardado; null si no hay nada. */
export function readStoredProjectId(storage: Readable): string | null {
  return storage.getItem(STORAGE_KEY);
}

/** Guarda el id; si es null, borra la clave (estado "Todos"). */
export function writeStoredProjectId(storage: Writable, id: string | null): void {
  if (id === null) {
    storage.removeItem(STORAGE_KEY);
  } else {
    storage.setItem(STORAGE_KEY, id);
  }
}

/**
 * Resuelve la selección contra la lista cargada:
 *   - null → null ("Todos los proyectos").
 *   - id presente en la lista → ese id.
 *   - id que ya no existe → null (fallback a "Todos").
 */
export function resolveStoredSelection(
  projects: { id: string }[],
  storedId: string | null,
): string | null {
  if (storedId === null) return null;
  return projects.some((p) => p.id === storedId) ? storedId : null;
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

```bash
cd /Users/miguelmachuca/centralhub/frontend
npx vitest run src/contexts/projectSelection.test.ts
```

Expected: PASS, 7 tests verdes.

- [ ] **Step 5: Commit**

```bash
cd /Users/miguelmachuca/centralhub
git add frontend/src/contexts/projectSelection.ts frontend/src/contexts/projectSelection.test.ts
git commit -m "feat(frontend): lógica pura de selección de proyecto + tests"
```

---

### Task 2: ProjectContext (provider + hook)

**Files:**
- Create: `frontend/src/contexts/ProjectContext.tsx`

**Interfaces:**
- Consumes: `readStoredProjectId`, `writeStoredProjectId`, `resolveStoredSelection` (Task 1); `useProyectos`/`Proyecto` de `@/hooks/useProyectos`.
- Produces:
  - `ProjectProvider({ children }): JSX.Element`
  - `useProjectSelection(): { selectedProjectId: string | null; setSelectedProjectId: (id: string | null) => void; selectedProject: Proyecto | null; projects: Proyecto[]; isLoading: boolean }`

- [ ] **Step 1: Crear el archivo**

Crear `frontend/src/contexts/ProjectContext.tsx` con este contenido EXACTO:

```tsx
'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useProyectos, type Proyecto } from '@/hooks/useProyectos';
import {
  readStoredProjectId,
  writeStoredProjectId,
  resolveStoredSelection,
} from './projectSelection';

interface ProjectSelectionValue {
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  selectedProject: Proyecto | null;
  projects: Proyecto[];
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectSelectionValue | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { data: projects = [], isLoading } = useProyectos();
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hidratar desde localStorage una vez que la lista de proyectos cargó,
  // resolviendo contra la lista (fallback a "Todos" si el id ya no existe).
  useEffect(() => {
    if (isLoading || hydrated) return;
    const stored = readStoredProjectId(window.localStorage);
    const resolved = resolveStoredSelection(projects, stored);
    if (resolved !== stored) writeStoredProjectId(window.localStorage, resolved);
    setSelectedProjectIdState(resolved);
    setHydrated(true);
  }, [isLoading, hydrated, projects]);

  const setSelectedProjectId = (id: string | null) => {
    setSelectedProjectIdState(id);
    writeStoredProjectId(window.localStorage, id);
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  return (
    <ProjectContext.Provider
      value={{ selectedProjectId, setSelectedProjectId, selectedProject, projects, isLoading }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectSelection(): ProjectSelectionValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProjectSelection debe usarse dentro de <ProjectProvider>');
  }
  return ctx;
}
```

- [ ] **Step 2: Verificar que compila (TypeScript)**

```bash
cd /Users/miguelmachuca/centralhub/frontend
npx tsc --noEmit
```

Expected: sin errores nuevos relacionados con `ProjectContext.tsx`.

- [ ] **Step 3: Commit**

```bash
cd /Users/miguelmachuca/centralhub
git add frontend/src/contexts/ProjectContext.tsx
git commit -m "feat(frontend): ProjectContext (provider + useProjectSelection)"
```

---

### Task 3: Componente ProjectSelector

**Files:**
- Create: `frontend/src/components/layout/ProjectSelector.tsx`

**Interfaces:**
- Consumes: `useProjectSelection` (Task 2).
- Produces: `export default function ProjectSelector(): JSX.Element` — un `<select>` con "Todos los proyectos" + un `<option>` por proyecto.

- [ ] **Step 1: Crear el archivo**

Crear `frontend/src/components/layout/ProjectSelector.tsx` con este contenido EXACTO:

```tsx
'use client';

import { useProjectSelection } from '@/contexts/ProjectContext';

export default function ProjectSelector() {
  const { selectedProjectId, setSelectedProjectId, projects, isLoading } = useProjectSelection();

  return (
    <select
      aria-label="Seleccionar proyecto"
      value={selectedProjectId ?? ''}
      onChange={(e) => setSelectedProjectId(e.target.value || null)}
      disabled={isLoading}
      className="w-full text-xs font-medium rounded-lg px-2 py-1.5 outline-none cursor-pointer transition"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
    >
      <option value="">Todos los proyectos</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd /Users/miguelmachuca/centralhub/frontend
npx tsc --noEmit
```

Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
cd /Users/miguelmachuca/centralhub
git add frontend/src/components/layout/ProjectSelector.tsx
git commit -m "feat(frontend): componente ProjectSelector (dropdown)"
```

---

### Task 4: Montar el provider + reemplazar el badge del sidebar

**Files:**
- Modify: `frontend/src/app/(admin)/layout.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `ProjectProvider` (Task 2), `ProjectSelector` (Task 3).

- [ ] **Step 1: Envolver el contenido del layout con `ProjectProvider`**

En `frontend/src/app/(admin)/layout.tsx`, agregar el import después de la línea `import { useAuthStore } from '@/store/auth.store';`:

```tsx
import { ProjectProvider } from '@/contexts/ProjectContext';
```

Reemplazar el bloque `return (...)` actual:

```tsx
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Sidebar open={false} onClose={() => {}} />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
        {children}
      </main>
    </div>
  );
```

por:

```tsx
  return (
    <ProjectProvider>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Sidebar open={false} onClose={() => {}} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
          {children}
        </main>
      </div>
    </ProjectProvider>
  );
```

- [ ] **Step 2: Reemplazar el badge fijo del sidebar por el selector**

En `frontend/src/components/layout/Sidebar.tsx`, agregar el import después de `import { cn } from '@/lib/utils';`:

```tsx
import ProjectSelector from '@/components/layout/ProjectSelector';
```

Reemplazar el bloque del badge:

```tsx
      {/* Badge proyecto activo */}
      <div
        className="flex items-center gap-2 px-5 py-2.5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: 'var(--accent)' }}
        />
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Monarca II
        </span>
      </div>
```

por:

```tsx
      {/* Selector de proyecto activo */}
      <div
        className="px-4 py-2.5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <ProjectSelector />
      </div>
```

- [ ] **Step 3: Verificar que compila**

```bash
cd /Users/miguelmachuca/centralhub/frontend
npx tsc --noEmit
```

Expected: sin errores nuevos.

- [ ] **Step 4: Verificación visual rápida**

Con backend (`:4000`) y frontend (`:3000`) corriendo, abrir `http://localhost:3000/dashboard`, login admin. El sidebar debe mostrar el dropdown con "Todos los proyectos" + los 12 proyectos. (El Dashboard aún muestra MON2 hasta Task 5 — es esperado.)

- [ ] **Step 5: Commit**

```bash
cd /Users/miguelmachuca/centralhub
git add "frontend/src/app/(admin)/layout.tsx" frontend/src/components/layout/Sidebar.tsx
git commit -m "feat(frontend): montar ProjectProvider y selector en el sidebar"
```

---

### Task 5: Conectar el Dashboard al selector

**Files:**
- Modify: `frontend/src/hooks/useDashboard.ts`
- Modify: `frontend/src/app/(admin)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useProjectSelection` (Task 2).
- Produces (firmas nuevas): `useDashboardSummary(projectId?: string)`, `useMoraDetail(projectId?: string, enabled?: boolean)`.

- [ ] **Step 1: Actualizar `useDashboard.ts`**

Reemplazar desde la constante `MONARCA_II_ID` hasta el final de `useMoraDetail` por:

```ts
async function fetchSummary(projectId?: string): Promise<DashboardSummary> {
  const { data } = await api.get('/dashboard/summary', { params: { projectId } });
  return data.data;
}

async function fetchMora(projectId?: string): Promise<any[]> {
  const { data } = await api.get('/dashboard/mora', { params: { projectId } });
  return data.data;
}

export function useDashboardSummary(projectId?: string) {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary', projectId ?? 'all'],
    queryFn:  () => fetchSummary(projectId),
    staleTime: 60_000,
  });
}

export function useMoraDetail(projectId?: string, enabled = true) {
  return useQuery<any[]>({
    queryKey: ['dashboard', 'mora', projectId ?? 'all'],
    queryFn:  () => fetchMora(projectId),
    staleTime: 60_000,
    enabled,
  });
}
```

Nota: se elimina la constante `MONARCA_II_ID`. Axios omite los params `undefined`, así que `projectId` undefined → no se manda → el backend agrega.

- [ ] **Step 2: Actualizar `dashboard/page.tsx`**

Agregar el import (junto a los demás imports del archivo):

```tsx
import { useProjectSelection } from '@/contexts/ProjectContext';
```

Reemplazar:

```tsx
  const { data, isLoading, isError, error } = useDashboardSummary();
  const { data: mora, isLoading: moraLoading } = useMoraDetail(activeTab === 'mora');
```

por:

```tsx
  const { selectedProjectId, selectedProject } = useProjectSelection();
  const { data, isLoading, isError, error } = useDashboardSummary(selectedProjectId ?? undefined);
  const { data: mora, isLoading: moraLoading } = useMoraDetail(selectedProjectId ?? undefined, activeTab === 'mora');
```

Reemplazar el subtítulo:

```tsx
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Monarca II — datos actualizados
        </p>
```

por:

```tsx
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {selectedProject ? selectedProject.name : 'Todos los proyectos'} — datos actualizados
        </p>
```

- [ ] **Step 3: Verificar que compila**

```bash
cd /Users/miguelmachuca/centralhub/frontend
npx tsc --noEmit
```

Expected: sin errores nuevos.

- [ ] **Step 4: Verificación visual**

En `http://localhost:3000/dashboard`: con "Todos los proyectos" el subtítulo dice "Todos los proyectos — datos actualizados" y los KPIs muestran totales grandes (sumas de los 12). Al elegir "Valle del Roble" en el selector, el subtítulo y los números cambian a ese proyecto.

- [ ] **Step 5: Commit**

```bash
cd /Users/miguelmachuca/centralhub
git add frontend/src/hooks/useDashboard.ts "frontend/src/app/(admin)/dashboard/page.tsx"
git commit -m "feat(frontend): dashboard usa el proyecto seleccionado (incluye Todos)"
```

---

### Task 6: Conectar Contratos al selector

**Files:**
- Modify: `frontend/src/hooks/useContratos.ts`
- Modify: `frontend/src/app/(admin)/contratos/page.tsx`

**Interfaces:**
- Consumes: `useProjectSelection` (Task 2).
- Produces (firma nueva): `useContratos(projectId?: string)`.

- [ ] **Step 1: Actualizar `useContratos.ts`**

Reemplazar:

```ts
const PROJECT_ID = '74b9deb6-a793-408d-8087-0e30ef0f288d';

async function fetchContratos(projectId: string): Promise<ContratoDetalle[]> {
  const { data } = await api.get('/contracts', { params: { projectId } });
  return data.data;
}
```

por:

```ts
async function fetchContratos(projectId?: string): Promise<ContratoDetalle[]> {
  const { data } = await api.get('/contracts', { params: { projectId } });
  return data.data;
}
```

Reemplazar:

```ts
export function useContratos(projectId = PROJECT_ID) {
  return useQuery<ContratoDetalle[]>({
    queryKey: ['contratos', 'list', projectId],
    queryFn:  () => fetchContratos(projectId),
    staleTime: 60_000,
  });
}
```

por:

```ts
export function useContratos(projectId?: string) {
  return useQuery<ContratoDetalle[]>({
    queryKey: ['contratos', 'list', projectId ?? 'all'],
    queryFn:  () => fetchContratos(projectId),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Actualizar `contratos/page.tsx`**

Agregar el import:

```tsx
import { useProjectSelection } from '@/contexts/ProjectContext';
```

Reemplazar:

```tsx
  const { data: contratos = [], isLoading, isError } = useContratos();
```

por:

```tsx
  const { selectedProjectId } = useProjectSelection();
  const { data: contratos = [], isLoading, isError } = useContratos(selectedProjectId ?? undefined);
```

- [ ] **Step 3: Verificar que compila**

```bash
cd /Users/miguelmachuca/centralhub/frontend
npx tsc --noEmit
```

Expected: sin errores nuevos.

- [ ] **Step 4: Verificación visual**

En `/contratos`: con "Todos" lista contratos de todos los proyectos; al elegir un proyecto, solo los de ese proyecto.

- [ ] **Step 5: Commit**

```bash
cd /Users/miguelmachuca/centralhub
git add frontend/src/hooks/useContratos.ts "frontend/src/app/(admin)/contratos/page.tsx"
git commit -m "feat(frontend): contratos usa el proyecto seleccionado (incluye Todos)"
```

---

### Task 7: Conectar Cuotas al selector

**Files:**
- Modify: `frontend/src/hooks/useCuotas.ts`
- Modify: `frontend/src/app/(admin)/cuotas/page.tsx`

**Interfaces:**
- Consumes: `useProjectSelection` (Task 2).
- Produces (firma nueva): `useCuotas(projectId?: string, status?: string)` — sin gate `enabled` (corre también en "Todos").

- [ ] **Step 1: Actualizar `useCuotas.ts`**

Reemplazar:

```ts
async function fetchCuotas(projectId: string, status?: string): Promise<Cuota[]> {
  const params: Record<string, string> = { projectId };
  if (status) params.status = status;
  const { data } = await api.get('/cuotas', { params });
  return data.data;
}

export function useCuotas(projectId: string, status?: string) {
  return useQuery<Cuota[]>({
    queryKey: ['cuotas', projectId, status ?? 'all'],
    queryFn:  () => fetchCuotas(projectId, status),
    staleTime: 60_000,
    enabled: !!projectId,
  });
}
```

por:

```ts
async function fetchCuotas(projectId?: string, status?: string): Promise<Cuota[]> {
  const params: Record<string, string> = {};
  if (projectId) params.projectId = projectId;
  if (status) params.status = status;
  const { data } = await api.get('/cuotas', { params });
  return data.data;
}

export function useCuotas(projectId?: string, status?: string) {
  return useQuery<Cuota[]>({
    queryKey: ['cuotas', projectId ?? 'all', status ?? 'all'],
    queryFn:  () => fetchCuotas(projectId, status),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Actualizar `cuotas/page.tsx`**

Eliminar la línea:

```tsx
const PROJECT_ID = '74b9deb6-a793-408d-8087-0e30ef0f288d';
```

Agregar el import:

```tsx
import { useProjectSelection } from '@/contexts/ProjectContext';
```

Reemplazar:

```tsx
  const { data: cuotas = [], isLoading, isError } = useCuotas(PROJECT_ID, statusFilter || undefined);
```

por:

```tsx
  const { selectedProjectId } = useProjectSelection();
  const { data: cuotas = [], isLoading, isError } = useCuotas(selectedProjectId ?? undefined, statusFilter || undefined);
```

- [ ] **Step 3: Verificar que compila**

```bash
cd /Users/miguelmachuca/centralhub/frontend
npx tsc --noEmit
```

Expected: sin errores nuevos.

- [ ] **Step 4: Verificación visual**

En `/cuotas`: con "Todos" muestra cuotas de todos los proyectos; al elegir un proyecto, solo las de ese proyecto.

- [ ] **Step 5: Commit**

```bash
cd /Users/miguelmachuca/centralhub
git add frontend/src/hooks/useCuotas.ts "frontend/src/app/(admin)/cuotas/page.tsx"
git commit -m "feat(frontend): cuotas usa el proyecto seleccionado (incluye Todos)"
```

---

### Task 8: Conectar Lotes al selector + estado vacío en "Todos"

**Files:**
- Modify: `frontend/src/hooks/useLotes.ts`
- Modify: `frontend/src/app/(admin)/lotes/page.tsx`

**Interfaces:**
- Consumes: `useProjectSelection` (Task 2).
- Produces (firma nueva): `useLotes(projectId?: string)` — conserva el gate `enabled: !!projectId` (Lotes requiere un proyecto).

- [ ] **Step 1: Actualizar `useLotes.ts`**

Reemplazar:

```ts
async function fetchLotes(projectId: string): Promise<Lote[]> {
  const { data } = await api.get('/lots', { params: { projectId } });
  return data.data;
}

export function useLotes(projectId: string) {
  return useQuery({
    queryKey:  ['lotes', projectId],
    queryFn:   () => fetchLotes(projectId),
    enabled:   !!projectId,
    staleTime: 60_000,
  });
}
```

por:

```ts
async function fetchLotes(projectId: string): Promise<Lote[]> {
  const { data } = await api.get('/lots', { params: { projectId } });
  return data.data;
}

export function useLotes(projectId?: string) {
  return useQuery({
    queryKey:  ['lotes', projectId ?? 'none'],
    queryFn:   () => fetchLotes(projectId as string),
    enabled:   !!projectId,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Actualizar `lotes/page.tsx` — imports y eliminación del hardcode**

Eliminar la línea:

```tsx
const PROJECT_ID = '74b9deb6-a793-408d-8087-0e30ef0f288d';
```

Agregar el import:

```tsx
import { useProjectSelection } from '@/contexts/ProjectContext';
```

- [ ] **Step 3: Actualizar `lotes/page.tsx` — leer el contexto y el hook**

Reemplazar:

```tsx
  const { data: lotes = [], isLoading, isError } = useLotes(PROJECT_ID);
```

por:

```tsx
  const { selectedProjectId, selectedProject } = useProjectSelection();
  const { data: lotes = [], isLoading, isError } = useLotes(selectedProjectId ?? undefined);
```

- [ ] **Step 4: Agregar el estado vacío para "Todos" (después de los `useMemo`, antes de `if (isLoading)`)**

Justo antes de la línea `if (isLoading) return (`, insertar:

```tsx
  if (!selectedProjectId) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <Map className="w-10 h-10" style={{ color: 'var(--text-tertiary)' }} />
      <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>
        Elige un proyecto para ver su lotificación
      </p>
      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
        Usa el selector de proyecto en la barra lateral.
      </p>
    </div>
  );
```

Nota: el ícono `Map` debe estar importado de `lucide-react`. Si no lo está, agregarlo al import de `lucide-react` existente en el archivo. (Si ya hay un ícono importado que prefieras, úsalo; lo importante es el mensaje.)

- [ ] **Step 5: Actualizar el título dinámico**

Reemplazar:

```tsx
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Lotes — Monarca II</h2>
```

por:

```tsx
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Lotes — {selectedProject?.name ?? ''}</h2>
```

- [ ] **Step 6: Verificar que compila**

```bash
cd /Users/miguelmachuca/centralhub/frontend
npx tsc --noEmit
```

Expected: sin errores nuevos.

- [ ] **Step 7: Verificación visual**

En `/lotes`: con "Todos los proyectos" muestra el mensaje "Elige un proyecto para ver su lotificación". Al elegir un proyecto, muestra su mapa de manzanas con el título "Lotes — <Nombre>".

- [ ] **Step 8: Commit**

```bash
cd /Users/miguelmachuca/centralhub
git add frontend/src/hooks/useLotes.ts "frontend/src/app/(admin)/lotes/page.tsx"
git commit -m "feat(frontend): lotes usa el proyecto seleccionado + estado vacío en Todos"
```

---

### Task 9: QA end-to-end manual

**Files:** Sin cambios de código. Solo verificación.

**Pre-requisito:** backend (`npm run dev`) y frontend (`cd frontend && npm run dev`) corriendo; Postgres arriba.

- [ ] **Step 1: Todos los tests pasan**

```bash
cd /Users/miguelmachuca/centralhub/frontend && npm test
cd /Users/miguelmachuca/centralhub && npm test
```

Expected: frontend 7 tests (selección) verdes; backend 89 verdes.

- [ ] **Step 2: Recorrido funcional** (login admin `info@seventyss.com` / `admin123`)

- [ ] El sidebar muestra el dropdown con "Todos los proyectos" + 12 proyectos.
- [ ] **Default**: al entrar, el selector está en "Todos los proyectos".
- [ ] **Dashboard / Todos**: subtítulo "Todos los proyectos — datos actualizados"; KPIs = totales consolidados.
- [ ] **Cambiar a un proyecto** (p.ej. Valle del Roble): Dashboard, Contratos y Cuotas se actualizan a ese proyecto; el subtítulo refleja el nombre.
- [ ] **Lotes / Todos**: muestra "Elige un proyecto para ver su lotificación".
- [ ] **Lotes / proyecto**: muestra el mapa de manzanas con título "Lotes — <Nombre>".
- [ ] **Persistencia**: elegir un proyecto, recargar la página (F5) → sigue seleccionado el mismo proyecto.
- [ ] **Fallback**: en DevTools, poner `localStorage['centralhub.selectedProjectId'] = 'id-inexistente'`, recargar → cae a "Todos los proyectos" sin romperse.

- [ ] **Step 3: Sign-off**

Si todos los checks pasan, reportar al usuario que la feature está lista para PR. Si algo falla, detenerse y reportar qué se observó vs lo esperado.

---

## Criterios de aceptación

1. [ ] `npm test` (frontend) pasa con los 7 tests de `projectSelection`.
2. [ ] El selector controla Dashboard, Contratos, Cuotas y Lotes.
3. [ ] "Todos los proyectos" consolida (Dashboard suma; Contratos/Cuotas listan todo).
4. [ ] Lotes en "Todos" muestra el prompt (no un mapa revuelto).
5. [ ] La selección persiste al recargar y cae a "Todos" si el id ya no existe.
6. [ ] Cero cambios de backend; `npx tsc --noEmit` sin errores nuevos.
