# CentralHub

Sistema de cobranza inmobiliaria desarrollado para **Central Inmobiliaria**:
venta de lotes a plazos, de punta a punta.

---

## Qué hace

- **Proyectos y lotes** — inventario por manzana, apartados con depósito y
  liberación automática de apartados vencidos.
- **Contratos** — alta con uno o varios lotes, enganche, plazo y calendario de
  cuotas; co-titulares, traspasos, edición y rescisión.
- **Cobranza** — pagos y recibos, cuotas, mora (cron nocturno), estado de cuenta
  con folio verificable en `/validar`.
- **Caja** — corte diario de cada cobradora y liquidaciones (cortes) al dueño
  del terreno.
- **Gastos e ingresos** — por proyecto; las comisiones de los asesores se
  registran como gastos de la categoría *Asesores*, con su recibo.
- **Portal de clientes** — contratos, cuotas y pagos de cada cliente.

Roles: `ADMIN` (el arquitecto y el desarrollador), `MANAGER` (secretarias y
cobradoras), `AGENT` (asesores) y los clientes del portal.

---

## Arranque

El ambiente local corre **sin Docker**, contra una copia de producción en un
Postgres propio (puerto 5434). Todo el detalle —levantar la base, refrescarla
desde producción, por qué los correos no salen y cómo ensayar un script— está
en **[docs/DESARROLLO-LOCAL.md](docs/DESARROLLO-LOCAL.md)**.

En corto:

```bash
npm install && (cd frontend && npm install)
cp .env.example .env              # y frontend/.env.example → frontend/.env.local
npm run local:up                  # Postgres local
npx prisma migrate deploy         # aplica las migraciones
npm run dev                       # API en http://localhost:4000
cd frontend && npm run dev        # UI
```

Producción vive en Railway (backend con el `Dockerfile` de la raíz, frontend con
Nixpacks, Postgres y un volumen para los documentos). Cómo se configura y se
despliega: **[docs/DEPLOY-RAILWAY.md](docs/DEPLOY-RAILWAY.md)**. Los servicios
externos de los que depende la app están en [docs/SERVICIOS.md](docs/SERVICIOS.md).

---

## Stack

| | |
|---|---|
| Backend | Node.js 20+, Express 4, TypeScript, Prisma 5, PostgreSQL 18 |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, TanStack Query, Zustand |
| PDF | `@react-pdf/renderer` (contratos, recibos, estados de cuenta) |
| Correo | Resend (`EMAIL_TRANSPORT=console` en local) |
| Pruebas | Vitest (backend y frontend) |
| Infraestructura | Railway |

---

## Scripts

```bash
npm run dev               # API en modo watch
npm run build             # compila a dist/ (tsconfig.build.json: sin scripts ni pruebas)
npm start                 # corre dist/index.js
npm test                  # pruebas del backend
npx tsc --noEmit -p .     # revisión de tipos, scripts incluidos

npm run local:up | local:down | local:refresh | local:psql

cd frontend && npm test && npm run build
```

Scripts de datos (se corren con `npx tsx`):

- `src/scripts/tools/` — herramientas que se reusan: migrar un proyecto
  (`npm run migrate`), cargar un proyecto nuevo, corregir pagos, fusionar
  contratos, cortes, etc. Lee el encabezado de cada una antes de correrla:
  muchas son dry-run hasta que se les pasa `--confirm`, pero no todas.
- `src/scripts/_historico/` — arreglos de una sola vez y auditorías ya
  corridas. Se guardan como referencia; no se vuelven a correr sin revisarlos.
- `src/scripts/lib/` — lectores de Excel y lógica compartida (con pruebas).

---

## Estructura

```
centralhub/
├── src/                  # Backend (Express)
│   ├── routes/ controllers/ services/ middlewares/
│   ├── jobs/             # mora, liberación de apartados, limpieza
│   ├── scripts/          # tools/, _historico/, lib/
│   └── app.ts, index.ts
├── prisma/
│   ├── schema.prisma
│   ├── migrations/       # versionadas; en producción se aplican al arrancar
│   └── seeds/            # seed de prueba (npm run prisma:seed)
├── frontend/             # Next.js — ver frontend/README.md
├── scripts/              # Postgres local (pg-local.sh, refrescar-local.sh)
├── docs/                 # guías de desarrollo, deploy y servicios
└── Dockerfile            # imagen del backend para Railway
```

---

## Equipo

- **Desarrollo**: Miguel Machuca Mata — miguel@seventyss.com (Seventy Seven Studio)
- **Cliente**: Central Inmobiliaria — Arq. Alberto Simone García

## Licencia

**UNLICENSED** — proyecto privado de uso exclusivo de Central Inmobiliaria.
© 2026 Seventy Seven Studio. Todos los derechos reservados.
