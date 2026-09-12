#!/usr/bin/env bash
# Refresca la base LOCAL con una copia de producción.
#
# Producción se abre SOLO en lectura (pg_dump). Lo único que se destruye es la
# base local. Sirve para ensayar migraciones de datos y scripts contra datos
# reales antes de tocar producción.
#
#   ./scripts/refrescar-local.sh
set -euo pipefail

PG18="${PG18:-/opt/homebrew/opt/postgresql@18/bin}"   # prod corre PostgreSQL 18
LOCAL_HOST="127.0.0.1"; LOCAL_PORT="5434"; LOCAL_DB="centralhub"
LOCAL_ADMIN="postgresql://postgres:postgres@${LOCAL_HOST}:${LOCAL_PORT}/postgres"
LOCAL_URL="postgresql://postgres:postgres@${LOCAL_HOST}:${LOCAL_PORT}/${LOCAL_DB}"
DUMP="$(mktemp -t centralhub-prod).dump"
trap 'rm -f "$DUMP"' EXIT

echo "→ Levantando Postgres local (puerto ${LOCAL_PORT})…"
docker compose up -d postgres >/dev/null
for i in $(seq 1 30); do
  docker exec centralhub-postgres pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

echo "→ Leyendo la URL de producción desde Railway…"
# El CLI a veces devuelve vacío; sin esta validación psql se iría a la base
# LOCAL y los resultados parecerían de producción sin serlo.
PGURL="$(railway variables --service Postgres --json 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).DATABASE_PUBLIC_URL||"")}catch(e){console.log("")}})')"
if [ -z "$PGURL" ]; then
  echo "✗ Railway no devolvió DATABASE_PUBLIC_URL. Corre 'railway link' y reintenta." >&2
  exit 1
fi

echo "→ Copiando producción (solo lectura)…"
"$PG18/pg_dump" "$PGURL" --no-owner --no-acl --format=custom --file="$DUMP"

echo "→ Reemplazando la base local…"
psql "$LOCAL_ADMIN" -q -c "DROP DATABASE IF EXISTS ${LOCAL_DB} WITH (FORCE);" -c "CREATE DATABASE ${LOCAL_DB};"
"$PG18/pg_restore" --no-owner --no-acl --dbname="$LOCAL_URL" "$DUMP"

echo "→ Aplicando migraciones pendientes…"
DATABASE_URL="$LOCAL_URL" npx prisma migrate deploy

echo ""
psql "$LOCAL_URL" -t -c "
SELECT 'proyectos: '||count(*) FROM projects
UNION ALL SELECT 'contratos: '||count(*) FROM contracts
UNION ALL SELECT 'pagos:     '||count(*) FROM payments
UNION ALL SELECT 'cortes:    '||count(*) FROM cortes
UNION ALL SELECT 'gastos:    '||count(*) FROM \"Expense\";"
echo "✓ Local listo. Recuerda: EMAIL_TRANSPORT=console evita mandar correos reales."
