# 🏢 CentralHub

Sistema integral de gestión inmobiliaria desarrollado para **Central Inmobiliaria**.

[![License](https://img.shields.io/badge/license-UNLICENSED-red.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-v24.13.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.5.4-blue.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-16-blue.svg)](https://www.postgresql.org/)

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

## 🚀 Estado Actual del Proyecto

### ✅ Completado (35%)

- ✅ Infraestructura: Docker + PostgreSQL 16
- ✅ Base de Datos: 12 modelos normalizados
- ✅ Autenticación: JWT con refresh tokens
- ✅ API REST: Usuarios, Proyectos, Clientes
- ✅ Seguridad: Bcrypt, Rate Limiting, CORS, Helmet
- ✅ Sistema de Roles: Admin, Manager, Agent, Viewer
- ✅ Códigos Únicos: Sistema global CLI-000001

### ⏳ En Desarrollo

- ⏳ Módulo de Lotes (Inventario dinámico)
- ⏳ Módulo de Contratos (Generación PDF)
- ⏳ Sistema de Pagos
- ⏳ Motor de Financiamiento
- ⏳ Dashboard Directivo

### 📅 Próximamente

- 📅 Sistema de Apartados
- 📅 Control de Mora
- 📅 Migración masiva de datos desde Excel
- 📅 Portal B2C para clientes
- 📅 App móvil para vendedores

---

## 🛠️ Stack Tecnológico

### Backend

- **Runtime**: Node.js v24.13.0
- **Framework**: Express.js 4
- **Lenguaje**: TypeScript 5.5
- **ORM**: Prisma 5.18
- **Autenticación**: JWT + bcrypt

### Base de Datos

- **Motor**: PostgreSQL 16
- **Admin**: pgAdmin 4
- **Migración**: Prisma Migrate

### Infraestructura

- **Containerización**: Docker
- **Logs**: Winston
- **Seguridad**: Helmet, CORS, Rate Limiting

### Futuro

- **Frontend**: React 18 + Next.js + Tailwind CSS
- **Cloud**: AWS (EC2, RDS, S3)
- **Pagos**: Stripe, SPEI
- **Comunicaciones**: SendGrid, Twilio

---

## 📦 Instalación

### Requisitos Previos

- Node.js >= 20.0.0
- Docker Desktop
- Git

### 1. Clonar el Repositorio

```bash
git clone https://github.com/seventy-seven-s/centralhub.git
cd centralhub
```

### 2. Instalar Dependencias

```bash
npm install
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
```

### 4. Levantar Base de Datos

```bash
docker-compose up -d
```

### 5. Ejecutar Migraciones

```bash
npx prisma migrate dev
```

### 6. Iniciar Servidor

```bash
npm run dev
```

El servidor estará disponible en: **http://localhost:4000**

---

## 🗄️ Arquitectura de Base de Datos

### Modelos Principales

| Modelo              | Descripción                                          | Registros Actuales |
| ------------------- | ---------------------------------------------------- | ------------------ |
| `users`             | Usuarios del sistema (Admin, Manager, Agent, Viewer) | 1                  |
| `projects`          | Desarrollos inmobiliarios                            | 1                  |
| `clients`           | Clientes con códigos únicos globales                 | 1                  |
| `client_projects`   | Relación cliente ↔ proyecto (muchos a muchos)        | 1                  |
| `lots`              | Inventario de lotes por proyecto                     | 0                  |
| `contracts`         | Contratos de compra-venta                            | 0                  |
| `payments`          | Bitácora de pagos                                    | 0                  |
| `payment_schedules` | Calendario de mensualidades                          | 0                  |
| `commissions`       | Comisiones de vendedores                             | 0                  |
| `expenses`          | Gastos operativos                                    | 0                  |
| `activities`        | Seguimiento de clientes                              | 0                  |
| `documents`         | Gestión documental                                   | 0                  |

### Diagrama ER

users ──┬─> activities
├─> expenses
├─> commissions
└─> documents
projects ──┬─> lots
├─> contracts
├─> client_projects
└─> expenses
clients ──┬─> contracts
├─> payments
├─> activities
└─> client_projects
contracts ──┬─> contract_lots
├─> payments
├─> payment_schedules
└─> commissions
lots ──> contract_lots

---

## 🔌 API Endpoints

### Autenticación

| Método | Endpoint                | Descripción       | Auth |
| ------ | ----------------------- | ----------------- | ---- |
| POST   | `/api/v1/auth/register` | Registrar usuario | ❌   |
| POST   | `/api/v1/auth/login`    | Iniciar sesión    | ❌   |

### Proyectos

| Método | Endpoint               | Descripción         | Auth             |
| ------ | ---------------------- | ------------------- | ---------------- |
| GET    | `/api/v1/projects`     | Listar proyectos    | ✅               |
| GET    | `/api/v1/projects/:id` | Ver proyecto        | ✅               |
| POST   | `/api/v1/projects`     | Crear proyecto      | ✅ Admin/Manager |
| PUT    | `/api/v1/projects/:id` | Actualizar proyecto | ✅ Admin/Manager |
| DELETE | `/api/v1/projects/:id` | Eliminar proyecto   | ✅ Admin         |

### Clientes

| Método | Endpoint              | Descripción        | Auth     |
| ------ | --------------------- | ------------------ | -------- |
| GET    | `/api/v1/clients`     | Listar clientes    | ✅       |
| GET    | `/api/v1/clients/:id` | Ver cliente        | ✅       |
| POST   | `/api/v1/clients`     | Crear cliente      | ✅       |
| PUT    | `/api/v1/clients/:id` | Actualizar cliente | ✅       |
| DELETE | `/api/v1/clients/:id` | Eliminar cliente   | ✅ Admin |

### Health Check

| Método | Endpoint  | Descripción         | Auth |
| ------ | --------- | ------------------- | ---- |
| GET    | `/health` | Estado del servidor | ❌   |
| GET    | `/api/v1` | Info de la API      | ❌   |

---

## 🧪 Testing

### Crear Usuario Admin

```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@centralhub.com",
    "password": "Admin123!@#",
    "firstName": "Admin",
    "lastName": "Sistema",
    "role": "ADMIN"
  }'
```

### Login

```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@centralhub.com",
    "password": "Admin123!@#"
  }'
```

Guarda el `accessToken` de la respuesta.

### Crear Proyecto

```bash
curl -X POST http://localhost:4000/api/v1/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "code": "VDR",
    "name": "Valle del Roble",
    "location": "Carretera Nacional Km 5",
    "city": "Heroica Matamoros",
    "state": "Tamaulipas",
    "totalLots": 450
  }'
```

---

## 🔒 Seguridad

- ✅ Passwords hasheados con **bcrypt** (10 rounds)
- ✅ JWT con expiración (15min access, 7 días refresh)
- ✅ Rate limiting: 100 req/15min general, 5 req/15min auth
- ✅ Helmet: Headers de seguridad HTTP
- ✅ CORS: Orígenes permitidos configurables
- ✅ Validación de inputs con express-validator
- ✅ Sistema de roles (RBAC)

---

## 📊 Scripts Disponibles

```bash
npm run dev              # Desarrollo con hot-reload
npm run build            # Compilar TypeScript
npm start                # Producción
npm run prisma:generate  # Generar cliente Prisma
npm run prisma:migrate   # Ejecutar migraciones
npm run prisma:studio    # Abrir Prisma Studio (GUI)
```

---

## 🗂️ Estructura del Proyecto

centralhub/
├── src/
│ ├── config/ # Configuraciones (DB, JWT)
│ │ ├── database.ts
│ │ └── jwt.ts
│ ├── controllers/ # Lógica de controladores
│ │ ├── auth.controller.ts
│ │ ├── project.controller.ts
│ │ └── client.controller.ts
│ ├── middlewares/ # Middlewares personalizados
│ │ ├── auth.ts
│ │ ├── errorHandler.ts
│ │ └── rateLimiter.ts
│ ├── routes/ # Definición de rutas
│ │ ├── auth.routes.ts
│ │ ├── project.routes.ts
│ │ └── client.routes.ts
│ ├── utils/ # Utilidades
│ │ └── logger.ts
│ ├── app.ts # Configuración de Express
│ └── index.ts # Punto de entrada
├── prisma/
│ ├── schema.prisma # Schema de base de datos
│ └── migrations/ # Historial de migraciones
├── logs/ # Archivos de log
├── uploads/ # Archivos subidos
├── .env # Variables de entorno
├── .env.example # Plantilla de variables
├── docker-compose.yml # PostgreSQL + pgAdmin
├── package.json # Dependencias
├── tsconfig.json # Config de TypeScript
└── README.md # Este archivo

---

## 👥 Equipo

- **Desarrollador**: Miguel Machuca Mata
- **Email**: miguel@seventyss.com
- **Empresa**: Seventy Seven Studio
- **Cliente**: Central Inmobiliaria
- **Contacto Cliente**: Arq. Alberto Simone García

---

## 📄 Licencia

Este proyecto es **PRIVADO** y de uso exclusivo de Central Inmobiliaria.

**UNLICENSED** - Todos los derechos reservados © 2026 Seventy Seven Studio

---

## 🆘 Soporte

Para soporte técnico, contactar a:

- **Email**: info@seventyss.com
- **Desarrollador**: miguel@seventyss.com

---

## 📈 Roadmap

### Fase 1: Core ERP (Semanas 1-6) - 60% Completado

- [x] Infraestructura y base de datos
- [x] Autenticación y autorización
- [x] Módulo de usuarios
- [x] Módulo de proyectos
- [x] Módulo de clientes
- [ ] Módulo de lotes
- [ ] Módulo de contratos
- [ ] Módulo de pagos
- [ ] Motor de financiamiento
- [ ] Dashboard directivo

### Fase 2: GIS & App Asesores (Semanas 7-9) - 0% Completado

- [ ] Vectorización de planos
- [ ] Mapa interactivo de lotes
- [ ] App móvil para vendedores
- [ ] Sistema de apartados

### Fase 3: Portal B2C (Semanas 10-12) - 0% Completado

- [ ] Portal de clientes
- [ ] Integración con Stripe/SPEI
- [ ] Generación de recibos
- [ ] Notificaciones automáticas

---

**Última actualización**: 14 de Abril de 2026
