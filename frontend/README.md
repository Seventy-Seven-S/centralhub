# CentralHub — frontend

La interfaz de CentralHub: el panel del equipo (ADMIN, MANAGER, AGENT) y el
portal de clientes. Next.js 16 (App Router) + React 19 + Tailwind CSS 4; habla
con la API del backend (`src/` en la raíz del repo).

> Esta versión de Next trae cambios incompatibles con versiones anteriores.
> Antes de usar una API poco común, lee la guía en
> `node_modules/next/dist/docs/` (ver `AGENTS.md`).

## Arrancar

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL apunta a la API local
npm run dev
```

La API y la base local se levantan desde la raíz; ver
[`docs/DESARROLLO-LOCAL.md`](../docs/DESARROLLO-LOCAL.md).

## Comandos

```bash
npm run dev          # servidor de desarrollo
npm test             # pruebas (Vitest)
npx tsc --noEmit     # revisión de tipos
npm run build        # build de producción
npm run lint
```

## Dónde está cada cosa

- `src/app/(admin)/` — pantallas del equipo: dashboard, proyectos, lotes,
  contratos, cuotas, clientes, gastos, ingresos, cortes, usuarios…
- `src/app/(portal)/` y `src/app/(auth)/portal` — portal de clientes.
- `src/app/validar/` — página pública para validar el folio de un recibo.
- `src/components/` — componentes por módulo; `components/pdf/` genera los
  contratos, recibos y estados de cuenta.
- `src/hooks/` — consultas y mutaciones (TanStack Query) por recurso.
- `src/lib/` — lógica pura de la UI, con sus pruebas al lado (`*.test.ts`).
- `src/store/` — sesión (Zustand).

## Producción

Se despliega en Railway con Nixpacks (`railway.json` de esta carpeta); ver
[`docs/DEPLOY-RAILWAY.md`](../docs/DEPLOY-RAILWAY.md).
