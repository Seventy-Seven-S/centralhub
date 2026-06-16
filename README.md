# 🏢 CentralHub

Sistema integral de gestión inmobiliaria desarrollado para **Central Inmobiliaria**.

[![License](https://img.shields.io/badge/license-UNLICENSED-red.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-v24.13.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.5.4-blue.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-16-blue.svg)](https://www.postgresql.org/)
[![Next.js](https://img.shields.io/badge/next.js-16-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/react-19-61dafb.svg)](https://react.dev/)

---

## 📋 Descripción

CentralHub es un sistema **PropTech** diseñado para digitalizar y automatizar la gestión de **12+ proyectos inmobiliarios**, **12,000+ clientes** y **20,000+ transacciones**. Reemplaza múltiples hojas de Excel descentralizadas con una plataforma unificada, segura y escalable.

### 🎯 Objetivos del Proyecto

- Centralizar la información de todos los proyectos en una base de datos relacional
- Automatizar cálculos de financiamiento (5, 6 y 7 años)
- Generar contratos notariados en PDF automáticamente
- Control de mora y rescisiones (3 cuotas + 3 gracia)
- Dashboard en tiempo real para socios
- Portal B2C para clientes
- Sistema de apartados con liberación automática (2 semanas)
- Integración con pasarelas de pago (Stripe, SPEI)

---

## 🚀 Estado Actual del Proyecto (~75%)

> Auditoría basada en código al commit `2dc3a5d` (16-jun-2026).

### ✅ Completado

**Infraestructura y base de datos**
- ✅ Docker Compose con PostgreSQL 16 + pgAdmin
- ✅ 22 modelos Prisma normalizados (usuarios, proyectos, clientes, lotes, contratos, pagos, cuotas, gastos, compromisos terreno, estados de cuenta, documentos, etc.)
- ✅ Migraciones versionadas en `prisma/migrations/`

**Autenticación y seguridad**
- ✅ Auth equipo interno (JWT + refresh tokens + 2FA por email)
- ✅ Auth clientes (Portal B2C) con `ClientUser` y refresh tokens separados
- ✅ Roles RBAC: ADMIN, MANAGER, AGENT, VIEWER + CLIENT
- ✅ Bcrypt, Helmet, CORS configurable, Rate limiting, Express Validator

**Módulos de negocio (backend)**
- ✅ Usuarios — CRUD restringido a ADMIN
- ✅ Proyectos — CRUD + configuración de comisión
- ✅ Clientes — CRUD + código único global (CLI-000001) + creación automática de `ClientUser` al firmar contrato
- ✅ Lotes — CRUD + apartado/reserva con depósito, agente responsable, expiración y **captura de INE del cliente al apartar** (multipart)
- ✅ Contratos — CRUD + co-titulares + upload de PDF firmado → status ACTIVE
- ✅ Cuotas — generación automática al crear contrato (numeroCuota, mes, fechaVencimiento)
- ✅ Pagos — tipos (DOWN_PAYMENT, INSTALLMENT, EXTRA_PAYMENT, RESERVATION_DEPOSIT, etc.); **depósito de apartado y enganche se registran como pagos al formalizar (semántica "pago separado")**
- ✅ **INE de clientes** — captura al apartar, almacenamiento vía abstracción de storage (privado, fuera de `/uploads`), asociación al `Client` al formalizar contrato, descarga restringida a ADMIN/MANAGER (`GET /documents/:id/file`), borrado al liberar (minimización LGPD) y flag de obligatoriedad
- ✅ Gastos — categorías + expenses + summary por proyecto
- ✅ Dashboard directivo — KPIs (contratos totales / en mora, ingresos, lotes, distribución por plazo, cuotas por status, ingresos por mes)
- ✅ Portal B2C — endpoints read-only para contratos, cuotas y pagos del cliente
- ✅ Estado de cuenta con folio único y hash de contenido (auditoría)
- ✅ Verificación pública (`/api/v1/verificar`)

**Frontend (Next.js 16 App Router)**
- ✅ Layout admin con sidebar y guards por rol (AGENT_RESTRICTED, ADMIN_ONLY)
- ✅ Login admin + 2FA (paso 2 con código 6 dígitos)
- ✅ Dashboard directivo con 5 KPIs y 5 tabs de gráficos (Recharts)
- ✅ Proyectos: list (cards con barra de progreso) + detail con contratos paginados
- ✅ Clientes: list con búsqueda debounced, sort y conteo batch de contratos; detalle con "Ver INE" (admin/manager)
- ✅ Lotes: grid por manzana, filtros, modal de apartado (regla 1/3 semanas según anticipo) con **subida de INE** (validación de tipo/tamaño) e **input de anticipo con formato MXN**; "Ver INE" en lote reservado (admin/manager)
- ✅ Contratos: list filtrable, detail con cuotas y pagos, **wizard de creación de 3 pasos** (cliente → términos → confirmación)
- ✅ Cuotas: vista global con filtros y detección de vencidas
- ✅ PDFs con `@react-pdf/renderer`: **ContratoCompraventa** (5 cláusulas legales, firmas), **EstadoDeCuenta**, **ReciboContrato**
- ✅ Portal cliente: login en design system, mis-contratos (list + detail con PDF), mis-pagos, mi-cuenta
- ✅ Design system: tokens CSS (Tailwind 4) con tema light/dark, skeletons, animaciones premium

**Comunicaciones**
- ✅ Email transaccional vía **Resend** (código 2FA, bienvenida con credenciales del portal)

**Automatización**
- ✅ Cron nocturno (node-cron) para recálculo de mora

**Lógica de negocio**
- ✅ **Motor de financiamiento (5/6/7 años)** — interés 0%, cuota fija = `saldo / plazo` (la fórmula correcta acordada con el cliente). Default 60 meses
- ✅ **Numeración K###** por proyecto (`K001..K###`, pad de 3 dígitos) — `generateContractNumber()` en `contract.service.ts`
- ✅ Precio total editable manualmente al crear contrato (override sobre suma de lotes)
- ✅ **Depósito de apartado como pago ("pago separado")** — `computeDepositSplit` reparte depósito de apartado + enganche al formalizar; el depósito se registra como Payment `RESERVATION_DEPOSIT`
- ✅ **Abstracción de storage de archivos** (`FileStorage`: `saveFile`/`getFile`/`deleteFile`) con driver de disco local; lista para swap a S3 sin refactor

### ⚠️ Parcial

- ⚠️ **Apartados con liberación automática** (1 semana sin anticipo / 3 semanas con anticipo) — `Lot.reservationExpiry` se setea, pero no hay cron que libere lotes expirados
- ⚠️ **Control de mora "3 cuotas + 3 gracia"** — el cron marca IN_MORA al primer atraso; falta lógica de periodo de gracia de 3 cuotas y "flag" para rescisión legal
- ⚠️ **Activación manual de contrato** — hoy el único camino a ACTIVE es subir PDF firmado; falta opción manual
- ⚠️ **Comisiones automáticas 4%** — modelo existe, falta auto-creación al firmar contrato + módulo de seguimiento
- ⚠️ **Edición de cliente post-creación** — campos como CURP/estado civil no editables después de creado
- ⚠️ **Cambio de contraseña en portal cliente** — la contraseña temporal generada al crear contrato no se puede cambiar
- ⚠️ **Buzón de notificaciones in-app** — para secretaria (nuevo apartado) y cliente (pago registrado)
- ⚠️ **Migración masiva desde Excel** — scripts CLI listos (`scripts/seed-lots-monarca2.ts`, `apply-payments-to-cuotas.ts`, etc.); falta endpoint API
- ⚠️ **PDF generation server-side** — los PDFs los renderiza el frontend (auditoría y almacenamiento server-side son brechas)

### 📅 Pendiente

- 📅 Integración Stripe (cobros con tarjeta)
- 📅 Integración SPEI (transferencias bancarias)
- 📅 Integración Google APIs (Sheets/Drive — librería instalada, sin uso)
- 📅 Endurecimiento de seguridad pre-producción: RLS en backend, CORS restrictivo a app propia, Security Headers anti-hackeo
- 📅 Middleware de rutas server-side en Next (hoy protección solo client-side)
- 📅 Mejora de contraseña temporal (hoy 4 letras + 4 dígitos)
- 📅 **Driver S3** para storage de archivos — la abstracción `FileStorage` ya está lista (hoy disco local: `uploads/contratos/` para contratos, `storage/private/` para INE)
- 📅 App móvil para vendedores
- 📅 GIS / Vectorización de planos / Mapa interactivo

---

## 🛠️ Stack Tecnológico

### Backend

| Capa | Tecnología |
|------|------------|
| Runtime | Node.js v24 |
| Framework | Express 4 |
| Lenguaje | TypeScript 5.5 |
| ORM | Prisma 5.18 |
| Base de datos | PostgreSQL 16 |
| Auth | JWT + bcrypt + 2FA propio |
| Email | Resend |
| Jobs | node-cron |
| Uploads | multer (memoryStorage para INE) |
| Storage | abstracción `FileStorage` (disco local; S3-ready) |
| Tests | Vitest |
| Logs | Winston + Morgan |
| Seguridad | Helmet, CORS, express-rate-limit, express-validator |
| Importación | xlsx, csv-parser |
| Integración | googleapis (instalado, no usado aún) |

### Frontend

| Capa | Tecnología |
|------|------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 |
| Estilos | Tailwind CSS 4 |
| Estado | Zustand 5 |
| Data fetching | TanStack Query 5 + Axios |
| Gráficas | Recharts 3 |
| PDF | @react-pdf/renderer 4 |
| Iconos | lucide-react |

### Infraestructura

- Docker Compose (PostgreSQL + pgAdmin)
- Migraciones versionadas (`prisma migrate`)
- Variables de entorno con `.env`

### Pendiente

- **Pagos**: Stripe, SPEI
- **Cloud**: por definir (AWS / Vercel / Railway)
- **Móvil**: por definir (React Native / Expo)

---

## 📦 Instalación

### Requisitos Previos

- Node.js >= 20 (recomendado v24)
- npm >= 9
- Docker Desktop
- Git

### 1. Clonar el Repositorio

```bash
git clone git@github.com:Seventy-Seven-S/centralhub.git
cd centralhub
```

### 2. Instalar Dependencias

```bash
# Backend
npm install

# Frontend
cd frontend && npm install && cd ..
```

### 3. Configurar Variables de Entorno

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/centralhub?schema=public"
JWT_SECRET=tu-clave-super-segura
JWT_REFRESH_SECRET=tu-clave-refresh-super-segura
CORS_ORIGIN=http://localhost:3000
RESEND_API_KEY=re_xxxxxxxxxxxxxxx
NODE_ENV=development

# INE / Documentos de cliente
INE_REQUIRED_FOR_RESERVATION=false   # obligar INE al apartar (en producción: true)
STORAGE_DRIVER=local                 # driver de storage ('local' hoy; 's3' futuro)
FILE_STORAGE_DIR=./storage/private   # NUNCA dentro de /uploads (se sirve público)
```

> El frontend usa su propio `.env.local` (ver `frontend/.env.example`), con `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_INE_REQUIRED` (espejo de UX del flag del backend).

### 4. Levantar Base de Datos

```bash
docker-compose up -d
```

### 5. Ejecutar Migraciones

```bash
npx prisma migrate dev
```

### 6. Iniciar Servidores

```bash
# Terminal 1: Backend (puerto 4000)
npm run dev

# Terminal 2: Frontend (puerto 3000)
cd frontend && npm run dev
```

- API: **http://localhost:4000**
- App: **http://localhost:3000**

---

## 🗄️ Arquitectura de Base de Datos

### Modelos (22 totales)

**Identidad y acceso**
- `users`, `refresh_tokens` — equipo interno
- `client_users`, `client_refresh_tokens` — clientes del portal B2C

**Negocio core**
- `projects`, `client_projects`
- `clients` (con `globalCode` CLI-000001)
- `lots` (con reserva: `reservedAt`, `reservationExpiry`, `reservedByAgent`)
- `contracts`, `contract_lots`, `co_owners`

**Cobranza**
- `payments`, `payment_schedules`
- `cuotas` (calendario mensual: numeroCuota, mes, fechaVencimiento, status)
- `commissions`

**Operación**
- `expenses`, `expense_categories`
- `compromisos_terreno`, `pagos_terreno` (pagos a propietarios de tierra)
- `activities` (CRM: llamadas, visitas, notas)
- `documents` (INE de clientes y otros adjuntos; polimórfico `relatedEntity`/`relatedEntityId`)
- `estado_cuenta_logs` (folios con hash de contenido para auditoría)

### Diagrama ER (alto nivel)

```
users ──┬─> activities
        ├─> payments(creadoPor)
        ├─> expenses
        ├─> commissions
        ├─> documents
        └─> lots(agenteApartador)

projects ──┬─> lots
           ├─> contracts
           ├─> client_projects
           ├─> expenses
           └─> compromisos_terreno ──> pagos_terreno

clients ──┬─> client_users (1:1, portal B2C)
          ├─> contracts
          ├─> payments
          ├─> activities
          └─> client_projects

contracts ──┬─> contract_lots ──> lots
            ├─> co_owners
            ├─> payments
            ├─> payment_schedules
            ├─> cuotas
            ├─> commissions
            └─> estado_cuenta_logs
```

> **Documentos (INE):** el modelo `documents` es polimórfico. La INE del cliente nace asociada al `lot` al apartar (`relatedEntity='lot'`) y migra al `client` al formalizar el contrato (`relatedEntity='client'`), quedando como parte permanente del expediente.

---

## 🔌 API Endpoints

Todos bajo `/api/v1`.

### Identidad

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| POST | `/auth/register` | ❌ | Registrar usuario interno |
| POST | `/auth/login` | ❌ | Login (dispara 2FA) |
| POST | `/auth/verify-2fa` | ❌ | Verificar código 2FA |
| POST | `/client-auth/*` | ❌ | Auth clientes portal B2C |

### Recursos

| Recurso | Ruta | Operaciones |
|---------|------|-------------|
| Usuarios | `/users` | List, Create, Update, Patch status (ADMIN) |
| Proyectos | `/projects` | CRUD (lectura abierta, mutación ADMIN/MANAGER) |
| Clientes | `/clients` | CRUD (ADMIN/MANAGER) |
| Lotes | `/lots` | CRUD + `POST :id/reserve` (multipart, campo `ineFile`), `DELETE :id/reserve` |
| Contratos | `/contracts` | CRUD + `POST :id/coowners` + `POST :id/upload-signed` |
| Documentos | `/documents` | `GET :id/file` (ADMIN/MANAGER) — sirve INE y adjuntos privados |
| Cuotas | `/cuotas` | List + `PATCH :id/pay` |
| Pagos | `/payments` | CRUD (ADMIN/MANAGER) |
| Gastos | `/expenses` | Categorías + expenses + summary por proyecto |
| Dashboard | `/dashboard` | `GET /summary`, `GET /mora` |
| Portal B2C | `/portal` | `GET /contratos`, `GET /contratos/:id` (con folio opcional), `/cuotas`, `/pagos` |
| Verificación | `/verificar` | Endpoint público de verificación de folios |

### Health Check

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/health` | Estado del servidor |
| GET | `/api/v1` | Info de la API |

---

## 🔒 Seguridad

- ✅ Passwords con **bcrypt** (10 rounds)
- ✅ JWT con expiración (access corto + refresh tokens persistidos)
- ✅ 2FA por email (código 6 dígitos, 10 min de expiración) en login admin
- ✅ Rate limiting global + más estricto en `/auth`
- ✅ Helmet (headers de seguridad)
- ✅ CORS con orígenes configurables
- ✅ Validación de inputs con express-validator
- ✅ RBAC: ADMIN / MANAGER / AGENT / VIEWER + CLIENT (portal)
- ✅ Aislamiento de datos en portal B2C: cada endpoint verifica `clientId` del token
- ✅ Estados de cuenta con folio + hash de contenido (no-repudio)
- ✅ Documentos sensibles (INE) servidos solo a ADMIN/MANAGER vía endpoint autenticado; archivos privados en `storage/private` (fuera del estático público) con guard de path traversal

---

## 📊 Scripts Disponibles

```bash
# Desarrollo
npm run dev              # Backend en watch mode (puerto 4000)
cd frontend && npm run dev  # Frontend Next.js (puerto 3000)

# Build / Producción
npm run build
npm start

# Tests
npm test                 # Vitest (run)
npm run test:watch       # Vitest (watch)

# Prisma
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
npm run prisma:seed

# Importación de datos
npm run migrate              # tsx src/scripts/migrate-project.ts
# Scripts auxiliares en src/scripts/:
#   seed-lots-monarca2.ts
#   link-contracts-lots-monarca2.ts
#   apply-payments-to-cuotas.ts
```

---

## 🗂️ Estructura del Proyecto

```
centralhub/
├── src/                          # Backend
│   ├── config/                   # DB, JWT
│   ├── controllers/              # auth, user, project, client, lot, contract, document, payment, cuota, dashboard, expense, portal, verificacion
│   ├── services/                 # contract.service, lot.service, document.service, ineDocument, email.service, dashboard.service, estadoCuenta.service, storage/, ...
│   ├── routes/                   # 14 route groups (incluye documents)
│   ├── middlewares/              # auth, clientAuth, errorHandler, rateLimiter
│   ├── jobs/                     # mora.job (cron nocturno)
│   ├── scripts/                  # migración Excel, seeding, reconciliación
│   ├── utils/                    # logger, errors, helpers
│   ├── types/                    # tipos compartidos
│   ├── app.ts
│   └── index.ts
├── frontend/                     # Next.js 16 + React 19
│   ├── src/
│   │   ├── app/
│   │   │   ├── (admin)/          # dashboard, proyectos, clientes, lotes, contratos, nuevo-contrato, cuotas, gastos, usuarios
│   │   │   ├── (auth)/           # login, portal
│   │   │   └── (portal)/         # mis-contratos, mis-pagos, mi-cuenta
│   │   ├── components/
│   │   │   ├── dashboard/        # KPICard, LotesDisponibles, DistribucionPlazo
│   │   │   ├── layout/           # Sidebar admin + portal
│   │   │   ├── contratos/        # PagarCuotaModal
│   │   │   └── pdf/              # ContratoCompraventa, EstadoDeCuenta, ReciboContrato
│   │   ├── hooks/                # useAuth, useClientes, useContratos, useCuotas, useDashboard, useGastos, useLotes, usePagos, useProyectos, useRole
│   │   └── stores/               # auth.store (Zustand)
│   └── package.json
├── prisma/
│   ├── schema.prisma             # 22 modelos
│   └── migrations/               # versionadas en git
├── logs/                         # Winston
├── uploads/                      # archivos públicos servidos vía /uploads (contratos firmados)
├── storage/                      # (gitignored) archivos privados — INE en storage/private
├── credentials/                  # (gitignored) llaves de Google APIs
├── docker-compose.yml            # PostgreSQL + pgAdmin
├── .env.example
└── README.md
```

---

## 🧭 Roadmap

### Fase 1: Core ERP — ✅ **100% Completado**

- [x] Infraestructura y base de datos
- [x] Autenticación y autorización (con 2FA)
- [x] Módulo de usuarios
- [x] Módulo de proyectos
- [x] Módulo de clientes
- [x] Módulo de lotes (con apartado)
- [x] Módulo de contratos (con PDF en frontend y upload firmado)
- [x] Módulo de pagos (manual)
- [x] Generación de cuotas
- [x] Dashboard directivo
- [x] Portal B2C cliente (read-only)
- [x] Sistema de apartados (manual)
- [x] Control de mora (cron diario)

### Sprint actual (orden acordado con el cliente)

1. [x] Precio editable en nuevo contrato
2. [x] Anticipo del apartado como pago registrado ("pago separado")
3. [x] Captura de INE del cliente en el flujo de apartado
4. [ ] Activación manual de contrato (sin requerir PDF firmado)
5. [ ] Buzón de notificaciones in-app (secretaria + cliente)
6. [ ] Control de comisiones (auto 4% configurable + módulo de seguimiento)
7. [ ] Edición de datos del cliente post-creación
8. [ ] Cambio de contraseña en portal cliente

### Pre-producción (crítico, paralelo)

- [ ] RLS (Row Level Security) en backend
- [ ] CORS restrictivo (solo app propia)
- [ ] Security headers endurecidos
- [ ] Middleware server-side de rutas en Next
- [ ] Endurecimiento de contraseña temporal
- [ ] Limpieza de contratos de prueba (K095–K098)

### Fase: Automatización pendiente

- [ ] Auto-liberación de apartados expirados (cron)
- [ ] Lógica "3+3 gracia" + flag para rescisión legal
- [ ] PDF generation server-side
- [ ] Endpoint API para migración Excel

### Fase: Pagos y comunicaciones — 📅 0%

- [ ] Integración Stripe (tarjeta)
- [ ] Integración SPEI (transferencia bancaria)
- [ ] Notificaciones automáticas (vencimientos, mora) por email/WhatsApp
- [ ] Integración Google APIs (Sheets/Drive)
- [ ] Migración de los 11 proyectos restantes desde Excel

### Fase: GIS & App Asesores — 📅 0%

- [ ] Vectorización de planos
- [ ] Mapa interactivo de lotes
- [ ] App móvil para vendedores

---

## 👥 Equipo

- **Desarrollador**: Miguel Machuca Mata — miguel@seventyss.com
- **Empresa**: Seventy Seven Studio — info@seventyss.com
- **Cliente**: Central Inmobiliaria
- **Contacto Cliente**: Arq. Alberto Simone García

---

## 📄 Licencia

**UNLICENSED** — Proyecto **PRIVADO** de uso exclusivo de Central Inmobiliaria.  
© 2026 Seventy Seven Studio. Todos los derechos reservados.

---

**Última actualización**: 16 de junio de 2026 (commit `2dc3a5d`)
