# Deploy a Railway — CentralHub (piloto)

Arquitectura del piloto: **backend (Docker) + PostgreSQL + volumen persistente + frontend (Nixpacks)**, todo en un proyecto de Railway. La spec AWS completa queda como migración futura.

## 1. Proyecto y servicios

```bash
railway login                 # interactivo (browser)
railway init                  # crear proyecto "centralhub"
railway add --database postgres
```

Crear DOS servicios desde el repo GitHub (`Seventy-Seven-S/centralhub`):
- **backend** — Root Directory: `/` (usa el `Dockerfile` de la raíz; `railway.json` ya define healthcheck `/health`).
- **frontend** — Root Directory: `frontend` (Nixpacks detecta Next.js; `npm run build` / `npm run start`).

## 2. Variables de entorno — backend

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al plugin) |
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `JWT_SECRET` | `openssl rand -hex 32` (NUEVO, no reusar el local) |
| `JWT_REFRESH_SECRET` | `openssl rand -hex 32` |
| `FIELD_ENCRYPTION_KEY` | `openssl rand -hex 32` — ⚠ respaldar: sin ella los datos cifrados son irrecuperables |
| `CORS_ORIGIN` | URL pública del frontend (p.ej. `https://centralhub-frontend.up.railway.app`) — sin ella el backend NO arranca (fail-fast) |
| `RESEND_API_KEY` | API key real de Resend |
| `EMAIL_FROM` | remitente verificado en Resend |
| `FILE_STORAGE_DIR` | `/data/storage` |
| `STORAGE_DRIVER` | `local` |
| `INE_REQUIRED_FOR_RESERVATION` | decisión de negocio (`true`/`false`) |

## 3. Volumen persistente (documentos legales)

Backend service → **Volumes** → montar en `/data`. Los INEs y contratos firmados viven en `FILE_STORAGE_DIR=/data/storage` y sobreviven redeploys. Sin el volumen, cada deploy borra los documentos.

## 4. Variables — frontend

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<backend-domain>/api/v1` — ⚠ se hornea en BUILD time: cambiar ⇒ rebuild |
| `NEXT_PUBLIC_INE_REQUIRED` | igual que el backend |

## 5. Importar los datos

```bash
# dump fresco local (después del refresh final con Excels actualizados)
pg_dump postgresql://postgres:postgres@localhost:5432/centralhub -Fc -f centralhub-launch.dump

# restaurar en Railway (usar la DATABASE_URL pública del plugin)
pg_restore --no-owner --no-privileges -d "<DATABASE_URL_PUBLICA>" centralhub-launch.dump
```

Nota: el backend corre `prisma migrate deploy` en cada arranque (idempotente); restaurar el dump ANTES del primer deploy o después es indistinto porque el dump ya trae `_prisma_migrations`.

## 6. Backups (requisito spec: diarios, retención 30 días)

Railway Postgres incluye backups automáticos **según plan** (Hobby: diarios con retención limitada; Pro: retención mayor). Verificar en el dashboard del plugin → Backups que la retención cumpla los 30 días; si el plan no llega, complementar con un cron local de `pg_dump` (script pendiente) o subir de plan.

## 7. Post-deploy (orden)

1. Backend healthcheck verde (`/health`).
2. Restaurar dump de datos.
3. Frontend desplegado apuntando al backend.
4. `CORS_ORIGIN` actualizado con el dominio real del frontend (y rebuild del frontend si cambió su URL).
5. Entrar con el usuario ADMIN existente (viene en el dump) y crear los usuarios del equipo desde `/usuarios`. Nota: `POST /auth/register` ahora exige token de ADMIN (se cerró el registro abierto).
6. Smoke de flujos críticos (ver checklist del roadmap).

## Pendientes conocidos

- Driver S3 sobre `FileStorage`: mejora futura; el volumen cubre el piloto.
