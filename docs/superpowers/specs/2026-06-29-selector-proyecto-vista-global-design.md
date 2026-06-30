# Selector de proyecto + vista "Todos los proyectos" — Diseño

**Fecha:** 2026-06-29
**Estado:** Aprobado (pendiente de plan de implementación)

## Problema

El Dashboard, Lotes, Contratos y Cuotas están **hardcodeados a Monarca II**
(ID `74b9deb6-a793-408d-8087-0e30ef0f288d`). Quedó así de cuando MON2 era el
único proyecto migrado y servía de demo. Ahora hay 12 proyectos con datos y el
usuario no puede ver información de otros proyectos ni una vista consolidada.

Lugares con el ID hardcodeado:
- `frontend/src/hooks/useDashboard.ts` (constante `MONARCA_II_ID`; `useDashboardSummary` default + `useMoraDetail` fijo)
- `frontend/src/app/(admin)/lotes/page.tsx` (constante `PROJECT_ID`)
- `frontend/src/hooks/useContratos.ts`
- `frontend/src/app/(admin)/cuotas/page.tsx`

Textos fijos relacionados: el badge "Monarca II" del sidebar
(`Sidebar.tsx` ~94-104), el subtítulo "Monarca II — datos actualizados"
(`dashboard/page.tsx`) y el título "Lotes — Monarca II" (`lotes/page.tsx`).

## Objetivo

Agregar un **selector de proyecto** en el sidebar, con opción **"Todos los
proyectos"** (vista consolidada) como default, que controle las 4 pantallas:
Dashboard, Lotes, Contratos y Cuotas.

## Hecho clave: el backend ya lo soporta

Todos los endpoints relevantes ya aceptan `projectId` **opcional** y, cuando no
se envía, **agregan/devuelven todos los proyectos**:
- `dashboard.service.getSummary(projectId?)` → `projectId ? { projectId } : {}`
- `dashboard.service.getMoraDetail(projectId?)` → mismo patrón
- `lot.controller.getAll`, `contract.controller.getAll`, `cuota.controller.getAll`
  → `projectId` opcional desde `req.query`

**Conclusión: este cambio es solo frontend. Cero cambios de backend.**

## Enfoque elegido

**React Context + persistencia en `localStorage`** (Enfoque A). Sin dependencias
nuevas; encaja con el stack actual (Next.js 16 App Router + React Query).
Descartados: parámetro en URL (más frágil, arrastrar el query en cada
navegación) y librería de estado tipo Zustand (innecesaria, YAGNI).

## Arquitectura

### Nuevo: `ProjectContext`
Archivo: `frontend/src/contexts/ProjectContext.tsx`

Estado y API expuesta:
- `selectedProjectId: string | null` — `null` significa "Todos los proyectos".
- `setSelectedProjectId(id: string | null): void`
- `selectedProject: Proyecto | null` — el objeto del proyecto seleccionado (o `null` en "Todos"), derivado de la lista.
- `projects: Proyecto[]` — lista de proyectos (reusa el hook existente `useProyectos`).
- `isLoading: boolean` — mientras carga la lista.

Comportamiento:
- **Default**: `null` ("Todos los proyectos").
- **Persistencia**: lee/escribe `localStorage` con la clave
  `centralhub.selectedProjectId`. Al montar, hidrata desde `localStorage`.
- **Fallback**: si el ID guardado no existe en la lista cargada (proyecto
  borrado/renombrado), cae a `null` ("Todos") y limpia el `localStorage`.
- El `Provider` se monta en `frontend/src/app/(admin)/layout.tsx` para envolver
  todas las pantallas de admin. Un hook `useProjectSelection()` expone el contexto.

### Nuevo: `ProjectSelector`
Archivo: `frontend/src/components/layout/ProjectSelector.tsx`

- Dropdown renderizado en el sidebar, **reemplazando el badge fijo "Monarca II"**
  (`Sidebar.tsx` ~94-104).
- Opciones: **"Todos los proyectos"** (primera) + los proyectos de `projects`.
- Al seleccionar, llama `setSelectedProjectId`.
- Mientras `isLoading`, muestra "Todos los proyectos" (o un placeholder).

## Conexión de las 4 pantallas

**Patrón uniforme:** los **hooks siguen siendo puros** (reciben `projectId` por
argumento, como hoy). Las **páginas** leen `useProjectSelection()` del contexto y
le pasan `selectedProjectId` al hook. Así los hooks quedan testeables y no
dependen del contexto. `null`/`undefined` se pasa como "sin filtro" → el backend
agrega todos los proyectos.

1. **Dashboard** — `useDashboard.ts` + `dashboard/page.tsx`
   - `useDashboardSummary(selectedProjectId)` y `useMoraDetail(selectedProjectId)`
     toman el ID del contexto (o `undefined` en "Todos"). Se elimina la constante
     `MONARCA_II_ID`.
   - Subtítulo dinámico: `"Todos los proyectos — datos actualizados"` o
     `"<Nombre del proyecto> — datos actualizados"`.

2. **Contratos** — `useContratos.ts`
   - Usa `selectedProjectId` del contexto en vez del ID fijo.

3. **Cuotas** — `cuotas/page.tsx`
   - Usa `selectedProjectId` del contexto en vez del ID fijo.

4. **Lotes** — `lotes/page.tsx`
   - Se elimina la constante `PROJECT_ID`.
   - Si hay proyecto seleccionado → muestra su mapa de manzanas; título dinámico
     `"Lotes — <Nombre>"`.
   - Si está en **"Todos" (`null`) → estado vacío**: mensaje
     *"Elige un proyecto para ver su lotificación"* (el selector queda a la mano
     en el sidebar). No se intenta dibujar un mapa global revuelto.

## Flujo de datos

Contexto (`selectedProjectId`) → hooks → React Query. El `queryKey` de cada
query **incluye el `projectId`** (las claves actuales ya lo incluyen), por lo que
cambiar de proyecto —o a "Todos"— **refresca y cachea por selección**
automáticamente. Sin cambios de backend.

## Casos borde

- **"Todos" + Lotes** → estado vacío con prompt para elegir proyecto.
- **ID persistido inexistente** → fallback a "Todos" + limpiar `localStorage`.
- **Lista de proyectos cargando** → selector muestra "Todos"; las queries de
  "Todos" no dependen de la lista, así que funcionan de inmediato.
- **`mora` en "Todos"** → el backend ya devuelve todos; funciona.

## Pruebas

- **Unit (Vitest):** lógica del contexto — default `null`, persistencia
  (lee/escribe `localStorage`), fallback cuando el ID guardado no existe.
- **QA visual manual:**
  - Cambiar de proyecto en el selector → Dashboard, Contratos y Cuotas se
    actualizan a ese proyecto; el subtítulo del Dashboard refleja el nombre.
  - Seleccionar "Todos los proyectos" → Dashboard muestra totales consolidados
    (sumas de los 12); Contratos y Cuotas listan de todos.
  - Lotes en "Todos" → muestra el prompt; al elegir un proyecto, muestra su mapa.
  - Recargar la página → se mantiene el proyecto seleccionado.

## Fuera de alcance

- **Gastos**: ya maneja proyectos por su cuenta (selector por gasto). Sin cambios.
- **Clientes / Comisiones**: no son por proyecto. Sin cambios.
- **Compartir selección por URL** (bookmarkable). Se descartó (Enfoque B).
- **Mapa de lotes consolidado** (agrupado por proyecto). Se descartó a favor del
  prompt "elige un proyecto".

## Archivos afectados (resumen)

| Archivo | Acción |
|---|---|
| `frontend/src/contexts/ProjectContext.tsx` | **Nuevo** — contexto + provider + hook |
| `frontend/src/components/layout/ProjectSelector.tsx` | **Nuevo** — dropdown |
| `frontend/src/app/(admin)/layout.tsx` | Montar el `Provider` |
| `frontend/src/components/layout/Sidebar.tsx` | Reemplazar badge fijo por `ProjectSelector` |
| `frontend/src/hooks/useDashboard.ts` | Quitar `MONARCA_II_ID`; usar el ID del contexto |
| `frontend/src/app/(admin)/dashboard/page.tsx` | Pasar ID del contexto; subtítulo dinámico |
| `frontend/src/hooks/useContratos.ts` | Usar ID del contexto |
| `frontend/src/app/(admin)/cuotas/page.tsx` | Usar ID del contexto |
| `frontend/src/app/(admin)/lotes/page.tsx` | Quitar `PROJECT_ID`; estado vacío en "Todos"; título dinámico |

**Total:** 2 nuevos, 7 modificados. Cero backend, cero migraciones.
