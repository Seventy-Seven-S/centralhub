# Auditoría de cobertura: CentralHub vs. Especificación Técnica v1.0 y Arquitectura de Sistema v1.0

**Fecha del análisis:** 2026-08-15
**Fuentes pactadas:** `03 Especificacion Tecnica Detallada.docx` (v1.0, 07-abr-2026), `04 Arquitectura Sistema.docx` (v1.0, 07-abr-2026)
**Método:** lectura de ambos documentos + exploración directa del código en `src/`, `frontend/src/`, `prisma/`, `src/scripts/`, `src/jobs/`, configuración de despliegue y logs reales de migración. No se ejecutó código, no se corrieron pruebas manuales de UI — este documento es análisis estático de lo que existe en el repositorio, no confirmación funcional en producción.

**Convención:** "Existe el código" ≠ "está cableado y funciona". Se marca explícitamente cuando algo es un script suelto, un stub vacío, o lógica no conectada a un endpoint/UI real.

---

## FASE 1 — Core ERP, Data Engineering y Motor Legal

### RF1.1 — Importación de Datos Históricos

**Estado: Parcial**

| Sub-requisito | Evidencia | Estado |
|---|---|---|
| Importar 1,500+ clientes desde Excel/Sheets | `src/scripts/migrate-project.ts`, `src/scripts/lib/jsaSheets.ts`, `src/scripts/lib/installments.ts` | Existe, pero es un **script CLI** (`tsx src/scripts/migrate-project.ts --excel ... --confirm`) operado por un desarrollador desde terminal. No hay endpoint API ni pantalla en `frontend/` para que el equipo importe por sí mismo. |
| Validación: nombre, teléfono, email, INE, estado civil, lugar de nacimiento | `validateRow()` en `migrate-project.ts` (~línea 1021) | Solo valida `codigo`, `nombreCompleto`, `precioTotal`, `manzana/lote`. **No valida** teléfono, email, INE, estado civil ni lugar de nacimiento, aunque esos campos existen en `prisma/schema.prisma` (líneas 177-180, algunos nullable). |
| Detección/corrección de duplicados | `findOrCreateClient()` (~línea 669) | Heurística simple por nombre normalizado (`contains`, insensible a mayúsculas); no usa INE/teléfono/email como llave de dedupe. |
| Mapeo automático de tipos | `migrate-project.ts` (parseo con `xlsx`) | Implementado para fechas y montos. |
| Auditoría (qué, cuándo, quién) | `class MigrationLogger` (línea 157), archivos reales en `logs/migration_*.log` | Registra qué se creó/reutilizó y timestamp. **No registra "quién"** — no hay tabla `AuditLog` en el schema ni captura de usuario autenticado. Es log de archivo plano, no auditoría de sistema. |
| Reporte de errores/warnings | `logger.logError`/`logWarning`, `writeReconciliationCSV()` (línea 1032) | Implementado; corre en modo `dry-run` por defecto, con CSV de reconciliación real (`logs/reconciliacion_*.csv`). |

**Qué falta para completo:** UI/endpoint de importación autoservicio para el equipo (hoy depende de un desarrollador); validación de INE/teléfono/email/estado civil/lugar de nacimiento; dedupe multi-campo; tabla de auditoría con usuario responsable en BD (no solo log de archivo).

**Clasificación:** Diferible. El ETL ya se usó operativamente para migrar 12 proyectos reales (evidencia: `logs/migration_*.log`); no bloquea el go-live del piloto porque la migración inicial de datos ya ocurrió por esta vía. Si el negocio quiere que el equipo importe sin depender de un desarrollador, eso sí es una brecha de producto pendiente.

---

### RF1.2 — Panel de Socios (Dashboard Directivo en Tiempo Real)

**Estado: Parcial**

Cableado end-to-end vía `src/services/dashboard.service.ts` + `src/controllers/dashboard.controller.ts` + `src/routes/dashboard.routes.ts` (`GET /summary`, `GET /mora`, protegido para ADMIN/MANAGER) → consumido en `frontend/src/app/(admin)/dashboard/page.tsx`.

| Sub-requisito | Estado | Detalle |
|---|---|---|
| Ingresos totales por proyecto | Completo | `ingresosTotal` filtrable por `projectId`. |
| Desglose al día/pendiente/mora 1-3 meses/rescisión | Parcial | Existe `cuotasPorStatus` y un booleano `moraMonthsCount > 0`; **no hay bucketización por 1/2/3 meses** ni estado "rescisión" en el dashboard. |
| Proyecciones de flujo de caja mensual | Parcial (no cumple la intención) | `ingresosPorMes` es **histórico** (pagos ya confirmados), no una proyección de cobros futuros. |
| Alertas automáticas de riesgo de rescisión | Ausente | No hay lógica de alertas ligada a mora hacia el panel directivo. |
| Tasa de conversión apartados→contratos | Ausente | No encontrado. |
| Comisiones por vendedor | Parcial | `src/services/commission.service.ts` (`GET /api/v1/commissions?agentId=`) existe y funciona, pero es lista individual, no un agregado dentro del panel de socios. |
| Disponibilidad de lotes por proyecto | Completo | `lotesDisponibles/reservados/vendidos`, `porcentajeVendido`. |
| Reportes exportables a PDF/Excel | Ausente | Sin generación de PDF/Excel para reportes del dashboard (las libs `xlsx`/`exceljs` del repo son para scripts de importación, no exportación de reportes). |

**Qué falta:** desglose de mora por rango y rescisión, proyección real de flujo de caja futuro, alertas automáticas, tasa de conversión, agregación de comisiones en el panel, exportación PDF/Excel.

**Clasificación:** Parcialmente bloqueante. Lo básico (ingresos, cuotas, disponibilidad) es verificable hoy y cubre el criterio de aceptación "dashboard muestra datos correctos". Alertas, proyección de flujo de caja y exportables son valor agregado esperado por los socios pero diferible sin romper el piloto.

---

### RF1.3 — Motor de Cálculo de Financiamiento

**Estado: Parcial**

| Sub-requisito | Evidencia | Estado |
|---|---|---|
| Entrada (monto, plazo, fecha) y cálculo de mensualidad | `frontend/src/app/(admin)/nuevo-contrato/page.tsx:189` | **El cálculo se hace en el frontend**, no en el backend; `src/services/contract.service.ts:147-148` solo almacena lo que recibe, sin recalcular ni validar server-side. |
| Tabla de amortización (60/72/84 cuotas) | `src/services/contract.service.ts:195-211` | Genera N cuotas iguales sin interés. El plazo es libre en el frontend; **no hay validación server-side** de que sea exactamente 5/6/7 años. |
| Validación: suma de cuotas = monto total | — | **No existe.** No hay chequeo de `installmentAmount * installmentCount + upfront == totalPrice`. Existe un script de reparación `src/scripts/fix-installment-schedules.ts` que sugiere que este descuadre ya ocurrió en datos reales. |
| Reglas de mora: 3 cuotas vencidas → gracia de 3 cuotas | `src/jobs/mora.job.ts`, `src/services/payment.service.ts:96` | Cuenta cuotas vencidas y marca `ContractStatus.IN_MORA` directo. **No existe ningún concepto de período de gracia de 3 cuotas** en schema ni código. |
| Flag de rescisión legal post-gracia | `prisma/schema.prisma:268-276` (enum `ContractStatus` incluye `RESCISSION`) | El estado existe en el enum pero **nunca se usa** (`grep -rn "RESCISSION" src` sin resultados fuera de la definición). |
| Ajustes por promoción/descuentos | — | No encontrado. |

**Qué falta:** cálculo y validación server-side (hoy el backend confía ciegamente en lo que envía el frontend — riesgo de integridad de datos financieros), período de gracia real, activación efectiva del flag de rescisión, lógica de promociones.

**Clasificación:** Bloqueante parcial. La ausencia de validación server-side de montos es un riesgo de integridad financiera real (ya se materializó, de ahí el script de reparación). La falta de período de gracia y de activación de rescisión son divergencias funcionales del proceso de cobranza pactado — decisión de negocio si son go/no-go para el piloto, pero deben marcarse como conocidas antes de operar con datos reales.

---

### RF1.4 — Generador Legal Automatizado (Contratos PDF)

**Estado: Parcial**

| Sub-requisito | Evidencia | Estado |
|---|---|---|
| Renderizado de PDF | `frontend/src/components/pdf/ContratoCompraventa.tsx` (`@react-pdf/renderer`, `PDFDownloadLink`) | **Se genera en el navegador del cliente**, no en el backend. El backend solo recibe y almacena un PDF ya firmado (`src/controllers/contract.controller.ts:165-168`). |
| Datos incluidos (INE, estado civil, lugar nacimiento) | `ContratoCompraventa.tsx:203-220` | Completo. |
| Tabla de amortización embebida | `ContratoCompraventa.tsx:312-317` | Completo. |
| QR de verificación | — | **Ausente.** Sin librería `qrcode` ni componente equivalente. |
| Generación en <3 segundos | — | No medible: al generarse client-side no hay instrumentación de tiempo ni SLA server-side. |
| Almacenamiento en AWS S3 con versionado | `src/services/storage/local-disk-storage.ts`, `src/services/storage/index.ts` | **Ausente.** Solo `LocalDiskStorage`; el código lanza error si `STORAGE_DRIVER !== 'local'` — la abstracción está preparada pero no hay driver S3 ni versionado. |
| Auditoría (quién generó, cuándo) | — | Ausente para el contrato. Existe algo similar (`verificarFolio`) para "estado de cuenta", pero es un módulo distinto. |

**Qué falta:** mover la generación/validación a backend (o al menos firmarla ahí), QR de verificación, driver S3 real con versionado, registro de auditoría de generación de contrato.

**Clasificación:** Diferible para almacenamiento S3/versionado (local disk funciona operativamente hoy). El QR de verificación y la auditoría de generación son razonables de diferir. Generar el PDF en cliente en vez de servidor no bloquea el piloto pero es una divergencia arquitectónica a decidir conscientemente (afecta integridad: el PDF final depende de datos que ya viajaron al navegador, no de una fuente única server-side).

---

## FASE 2 — GIS, Inventario Dinámico y App de Asesores

### RF2.1 — Mapa Interactivo de Lotes (GIS Web)

**Estado: Ausente**

| Sub-requisito | Evidencia | Estado |
|---|---|---|
| Conversión PDF/DWG → SVG vectorial | — | Sin implementación. Sin dependencias ni scripts relacionados. |
| Motor Mapbox/Leaflet.js | — | Sin implementación. `grep` de `mapbox\|leaflet` sin resultados en todo el repo. |
| Componente de plano | `frontend/src/components/lotes/PlanoManzana.tsx` | **Stub vacío**: `export default function PlanoManzana() { return null; }`. |
| Colores por estado, tooltips, click→ficha | `frontend/src/app/(admin)/lotes/page.tsx` (`STATUS_CONFIG`, `LoteModal`) | Existe pero como **grid de tarjetas agrupadas por manzana**, no como mapa geoespacial. El color de "Apartado" es dorado, no amarillo exacto como pide el RF. |
| Proyectos (Magnolia, Roble, Monarca, Bugambilias, Puerta del Sol, Santander) | `prisma/seeds/seed.ts`, scripts de migración | Existen como entidades de negocio, sin vínculo a mapa. |
| Performance 500 lotes, zoom 14-20, tiles, fallback, caché | — | No aplica: no existe el motor de mapas. |

**Qué falta:** todo el requisito tal como fue pactado (GIS real). Lo que existe es un catálogo tradicional funcional, no un mapa interactivo.

**Clasificación:** Diferible para el piloto, siempre que se comunique explícitamente al cliente que "mapa interactivo" no es lo que hoy ve el usuario — es un catálogo en grid. Es una divergencia visible y vendida en el contrato original; conviene decidir con el cliente si se re-alcanza (scope real work) o se re-negocia el entregable antes de presentarlo como "completado".

---

### RF2.2 — App para Vendedores (Tablets/Smartphones)

**Estado: Parcial**

| Sub-requisito | Evidencia | Estado |
|---|---|---|
| Login para 20 vendedores | `frontend/src/app/(auth)/login/page.tsx`, rol `AGENT` en schema | Funciona, pero es el login genérico de la app web, no una app dedicada. |
| App móvil dedicada (React Native/PWA) | — | **Ausente.** Sin manifest PWA, service worker, Capacitor ni React Native — es solo Next.js responsive, mismo código que admin/manager. |
| Lotes disponibles en tiempo real | `useLotes` (TanStack Query) | Parcial — invalidación al mutar, no push real-time; sin sockets. |
| Apartado (lote→cliente→confirma) | `LoteModal` → `POST /lots/:id/reserve` → `src/services/lot.service.ts:reserveLot()` | Completo y cableado. |
| Liberación automática si no se firma en 2 semanas | `src/jobs/liberarApartados.job.ts` (cron real, diario 00:15) | Implementado, **pero el plazo no es 2 semanas fijo** — es 3 semanas hábiles si hay depósito, 1 semana si no (cambio documentado en comentario del propio job, divergencia consciente de spec). |
| Notificaciones push de vencimiento | `src/services/notification.service.ts` | **Ausente como push real** (sin Web Push/FCM). Es un buzón in-app; además `NotificationAudience` solo soporta `ADMIN\|MANAGER\|CLIENT`, no vendedores, y se dispara después de liberar el lote, no como alerta previa. |
| Cálculo automático de comisiones | `src/services/commission.service.ts` | Parcial — la aritmética es automática, pero el % se captura **manualmente** por venta (cambio de negocio documentado en el código: ya no es 4% fijo automático). |
| Offline capability | — | Ausente. Sin service worker/IndexedDB/PWA. |

**Qué falta:** app dedicada o PWA con soporte offline, notificaciones push reales dirigidas a vendedores, alineación del plazo de liberación a 2 semanas (o decisión de negocio explícita de mantener el esquema actual), regla automática de comisión (hoy es manual).

**Clasificación:** Parcialmente bloqueante. El flujo core (login, apartado, liberación automática) funciona y cubre el caso de uso crítico 7.1 de la especificación. App nativa/PWA offline y push son diferibles. El plazo de liberación distinto a "2 semanas" es una divergencia de negocio ya tomada — debe confirmarse con el cliente que el esquema actual (1 o 3 semanas según depósito) es el acordado, no un defecto.

---

## FASE 3 — Portal PropTech B2C y Checkout

### RF3.1 — Portal de Clientes

**Estado: Parcial**

| Sub-requisito | Evidencia | Estado |
|---|---|---|
| Login email + contraseña | `src/controllers/clientAuth.controller.ts` (`loginClient`, bcrypt + JWT) | Completo. |
| 2FA | `auth.controller.ts` (líneas 85-116, ruta `/verify-2fa`) | **Ausente para clientes.** El 2FA vía OTP por email existe solo para el modelo `User` (staff interno); `clientAuth.controller.ts` no tiene ningún paso de 2FA. Además, el 2FA de staff se **omite completamente en `NODE_ENV=development`** (línea 72-80). |
| Resumen de contrato | `GET /api/v1/portal/contratos/:id` (`portal.routes.ts:40-72`) | Completo. |
| Histórico de pagos | `GET /api/v1/portal/contratos/:id/pagos` (`portal.routes.ts:90-107`) | Completo. |
| Estado de cuenta mensual descargable | `portal.routes.ts:47-65`, `estadoCuenta.service.ts` | **Parcial/placeholder** — genera folio + hash SHA-256 y devuelve JSON, no un PDF descargable. No hay librería PDF server-side en el proyecto. |
| Próxima fecha de corte / % pagado visual | — | **Ausente.** No existe endpoint ni campo `porcentajePagado`/`fechaCorte` en el portal backend. |
| Soporte con formulario/tickets | — | **Ausente.** Sin rutas, controladores ni modelos de "ticket"/"soporte" en `src/`. |

**Qué falta:** 2FA real para clientes, estado de cuenta como PDF descargable, cálculo y exposición de % pagado y fecha de corte, módulo de soporte/tickets.

**Clasificación:** Bloqueante en el punto de 2FA — es un requisito de seguridad explícito del RF3.1 para acceso B2C con datos personales (INE, contratos, pagos), y hoy no existe para clientes. El resto (estado de cuenta PDF, % visual, tickets) es diferible sin bloquear el acceso básico al portal.

---

### RF3.2 — Integración FinTech (Pagos en Línea)

**Estado: Ausente**

| Sub-requisito | Evidencia | Estado |
|---|---|---|
| Stripe (tarjeta) | — | **Ausente.** Sin SDK de Stripe en dependencias ni código. Los pagos hoy se registran manualmente vía `POST /api/v1/payments` por staff backoffice. |
| SPEI | `PaymentMethod` enum (`CASH, TRANSFER, CHECK, CARD`) | **Ausente como integración real.** "TRANSFER" es solo un tipo de dato libre, sin cliente de API bancaria/CLABE/STP. |
| Recibos digitales automáticos | — | No encontrados, ligados a un flujo de pago real. |
| Conciliación automática | `src/scripts/apply-payments-to-cuotas.ts`, lógica de reconciliación en `migrate-project.ts` | **Parcial y offline** — son scripts CLI contra Excel/CSV, no un proceso automático ligado a un gateway de pago en tiempo real. |
| Encriptación PCI-DSS | `src/utils/fieldCrypto.ts` (AES-256-GCM) | No aplica a datos de tarjeta (se usa para INE/CURP); no hay flujo de pago con tarjeta que requiera PCI-DSS todavía. |
| Webhook en tiempo real | — | Ausente. Sin rutas de webhook entrante ni verificación de firma de PSP. |

**Qué falta:** literalmente toda la integración de pagos en línea — es 0% implementado contra un procesador de pagos real. Hoy el sistema opera 100% con registro manual de pagos por backoffice.

**Clasificación:** Bloqueante si el piloto incluye la promesa de "pagos en línea" al cliente final. Si el piloto opera con cobranza manual/backoffice como proceso puente, esto es diferible — pero debe decidirse y comunicarse explícitamente, porque hoy no hay ni siquiera un sandbox de Stripe conectado.

---

## Arquitectura Técnica — Real vs. Pactada

| Componente pactado | Estado real | Evidencia |
|---|---|---|
| Frontend: React 18+, Next.js, Tailwind | **Coincide** (versión mayor: React 19.2, Next 16.2, Tailwind 4) | `frontend/package.json` |
| Backend: Node 18+, Express, TypeScript | **Coincide** (Node ≥20, Express 4.19, TS 5.5) | `package.json` raíz |
| PostgreSQL 14+ | **Coincide** | `prisma/schema.prisma` (`provider = "postgresql"`), `docker-compose.yml` (`postgres:16-alpine`) |
| Redis (cache/sesiones) | **Ausente** | Sin `redis`/`ioredis` en ningún `package.json`, sin referencias en código |
| ORM: Sequelize o TypeORM | **Diverge** (se usa Prisma) | `@prisma/client`, `prisma/migrations/` — funcionalmente equivalente, migraciones vía Prisma Migrate en vez de Liquibase |
| AWS S3 con versionado | **Ausente** | Solo `LocalDiskStorage`; README documenta explícitamente "Driver S3 (pendiente)" |
| Cloud AWS (EC2, RDS, Lambda, CloudFront, Route53, ALB, SQS/SNS, WAF, Shield, IAM, VPC) | **Ausente por completo** — despliegue real es **Railway** | `railway.json`, comentarios en `Dockerfile` ("imagen de producción para Railway"), README: "Cloud: por definir (AWS/Vercel/Railway)" |
| Stripe / SPEI | **Ausente** | Ver RF3.2. README lo marca como roadmap pendiente ("📅") |
| SendGrid / Twilio | **Diverge** (se usa Resend para email; sin SMS/WhatsApp) | `resend` en dependencias, `RESEND_API_KEY` |
| Monitoreo: CloudWatch, Sentry | **Ausente** | Sin `@sentry/*`; solo `winston`/`morgan` como logging básico |
| CI/CD: GitHub Actions + Docker | **Parcial** | Docker real y bien construido (multi-stage, Prisma); **sin `.github/workflows`** — no hay pipeline automatizado |
| Tests automatizados | **Presentes, cobertura moderada** | Backend: Vitest, 17 archivos de test sobre servicios de negocio. Frontend: 1 solo archivo de test |
| NFR rendimiento (<3s carga, <200ms API p95, 50+ usuarios concurrentes) | **No verificable desde código** | Sin tooling de load/performance testing en el repo |
| NFR disponibilidad (99.9% uptime, RTO 4h/RPO 1h, backups 30 días) | **No verificable / no automatizado** | Carpeta `backups/` local sugiere proceso manual, no política automatizada con retención definida |

**Nota:** el propio `README.md` del proyecto documenta abiertamente varias de estas brechas (Stripe/SPEI/S3/Cloud marcadas "📅 pendiente"), es decir, el equipo ya es consciente de la divergencia frente al documento de arquitectura pactado — no es un hallazgo oculto, es deuda reconocida y no cerrada.

**Clasificación:** La divergencia de nube (Railway en vez de AWS) es la más significativa porque toca directamente NFRs contractuales (RTO/RPO, auto-scaling, WAF/Shield) — es una decisión de negocio a formalizar con el cliente (¿se re-negocia el documento de arquitectura, o se migra antes de escalar?), no bloquea el piloto en sí si Railway sostiene la carga actual. Redis, Sentry, CI/CD son diferibles. Stripe/SPEI y S3-con-versionado dependen de si el piloto promete pagos en línea y RTO real (ver RF3.2).

---

## Síntesis 1 — Listo para go-live: completo y verificable hoy

- **Autenticación y RBAC de staff**: login, JWT, roles ADMIN/MANAGER/AGENT/VIEWER (`src/config/jwt.ts`, `auth.controller.ts`).
- **Gestión de lotes e inventario básico**: catálogo en grid con estado por color, ficha de detalle (`frontend/src/app/(admin)/lotes/page.tsx`).
- **Apartado de lotes**: flujo completo lote→cliente→confirmación (`lot.service.ts:reserveLot`).
- **Liberación automática de apartados**: cron real diario (`src/jobs/liberarApartados.job.ts`), con plazo distinto al pactado (1 o 3 semanas según depósito, no 2 semanas fijas — confirmar con cliente si es aceptado).
- **Dashboard directivo básico**: ingresos por proyecto, cuotas por status, disponibilidad de lotes — cableado end-to-end y consumido en frontend real.
- **Gestión de contratos y tabla de amortización**: generación de cuotas, PDF con datos legales completos (INE, estado civil, lugar de nacimiento, amortización embebida), aunque generado client-side.
- **Portal de clientes (funcionalidad base)**: login, resumen de contrato, histórico de pagos, con verificación de ownership por endpoint (sin 2FA).
- **Comisiones**: cálculo aritmético automático sobre % capturado manualmente por venta.
- **Detección de mora**: cron nocturno real que marca `IN_MORA` (sin período de gracia ni escalamiento a rescisión).
- **Migración de datos**: 12 proyectos reales ya migrados vía script ETL con logs de auditoría de archivo.
- **Despliegue funcional en Railway**: Docker multi-stage, Postgres gestionado, pipeline de build operativo (sin CI/CD automatizado en GitHub Actions).

---

## Síntesis 2 — Mínimo innegociable de seguridad antes de datos personales reales

Estándar exigido por Miguel (ya aplicado en otro proyecto). Estado actual verificado en código:

| # | Requisito | Estado | Evidencia |
|---|---|---|---|
| 1 | Rate-limiting por identidad (no por IP) | **AUSENTE** | `src/middlewares/rateLimiter.ts:3-13` usa `express-rate-limit` con la clave por defecto (`req.ip`); el propio mensaje de error dice "Too many requests from this IP". Sin `keyGenerator` por `userId`. |
| 2 | Validación de archivos por magic bytes (no por Content-Type declarado) | **AUSENTE** | `src/services/ineDocument.ts:34` (`validateIneUpload`) y `src/routes/contract.routes.ts:14-15` (`fileFilter` de multer) validan contra `mimetype` declarado por el cliente. Sin librería tipo `file-type` ni lectura de firma binaria — el buffer ya está en memoria (`multer.memoryStorage()`), es viable agregarlo. |
| 3 | Ownership verificado endpoint por endpoint (IDOR) en portal de clientes | **IMPLEMENTADO** (en el alcance auditado) | `src/routes/portal.routes.ts` resuelve `clientId` desde el token y compara contra el owner en `GET /contratos/:id` (línea 44), `/cuotas` (línea 79) y `/pagos` (línea 95). No se auditó el 100% de otros controladores fuera del portal B2C. |
| 4 | Secretos reales con fail-fast | **PARCIAL** | `JWT_SECRET`/`JWT_REFRESH_SECRET` y `CORS_ORIGIN` sí revientan el arranque en producción si faltan (`src/config/jwt.ts:5-12`, `src/app.ts:41-43`). `RESEND_API_KEY` (usado para 2FA de staff) **no** es fail-fast — inicialización perezosa, el server arranca sin él y solo falla al enviar el correo. `DATABASE_URL` solo falla indirectamente al intentar conectar. |
| 5 | X-Powered-By desactivado en ambos servicios | **IMPLEMENTADO (indirecto)** | No hay `app.disable('x-powered-by')` explícito, pero `helmet()` (montado en `src/app.ts:36`) lo remueve por default vía `hidePoweredBy`. Recomendable hacerlo explícito para no depender de la config default de una dependencia. |
| 6 | CORS fail-closed | **IMPLEMENTADO** | `src/app.ts:44-49` usa whitelist explícita desde `CORS_ORIGIN`, sin `origin: true`/`*`; obligatorio en producción. |
| 7 | INEs fuera del directorio público, con acceso controlado | **IMPLEMENTADO** | `LocalDiskStorage('./storage/private')` (`src/services/storage/index.ts:12`); mount estático de `/uploads` eliminado explícitamente (`src/app.ts:62-65`); acceso solo vía `GET /documents/:id/file` con `authenticate` + `authorize('ADMIN','MANAGER')`. Bloqueo de path traversal en `local-disk-storage.ts:9-16`. |

**Resumen:** 3 de 7 completos (ownership IDOR, CORS fail-closed, INE fuera de público), 1 indirecto pero funcional (X-Powered-By), 1 parcial (secretos fail-fast — falta cerrar `RESEND_API_KEY`), 2 ausentes y bloqueantes antes de manejar INEs/datos personales reales a escala (rate-limiting por identidad, validación de magic bytes en uploads de INE/contratos).

---

## Síntesis 3 — Diferible post-lanzamiento

- Mapa GIS interactivo (Leaflet/Mapbox) — hoy hay catálogo en grid funcional como sustituto operativo.
- App móvil nativa o PWA con soporte offline para vendedores.
- Notificaciones push reales (Web Push/FCM) — hoy hay buzón in-app.
- Migración de Railway a infraestructura AWS (EC2/RDS Multi-AZ/Lambda/CloudFront/WAF/Shield) — requiere decisión de negocio explícita, no solo trabajo técnico.
- Redis para cache/sesiones.
- Driver S3 con versionado (la abstracción ya está lista para el swap).
- QR de verificación en contratos PDF.
- Monitoreo con Sentry/CloudWatch — hoy solo logging básico (winston/morgan).
- CI/CD con GitHub Actions (hoy Docker funciona pero sin pipeline automatizado).
- Exportación de reportes del dashboard a PDF/Excel.
- Proyección real de flujo de caja, alertas automáticas de riesgo de rescisión, tasa de conversión apartados→contratos, agregación de comisiones en el panel de socios.
- Período de gracia de 3 cuotas y activación real del estado de rescisión legal.
- Estado de cuenta descargable como PDF real (hoy es JSON con folio/hash).
- Módulo de soporte/tickets en el portal de clientes.
- Integración SendGrid/Twilio para SMS/WhatsApp (hoy solo email vía Resend).

---

## Notas de honestidad del análisis

- Este documento no ejecutó pruebas de UI ni de carga; los estados de "completo" para flujos cableados están basados en trazar código de endpoint a frontend, no en verificación funcional en navegador.
- La auditoría de ownership/IDOR (punto 3 del mínimo de seguridad) cubrió explícitamente `portal.routes.ts`; no se revisó el 100% de los demás controladores del backend en busca del mismo patrón — se recomienda una pasada específica de IDOR sobre todos los endpoints antes de go-live con datos reales.
- Los NFR de rendimiento y disponibilidad (sección 4 de la Especificación) no son verificables desde el código estático — requieren pruebas de carga y una definición operativa de backups/RTO/RPO que hoy no existe en el repo.
