#!/usr/bin/env bash
# Postgres LOCAL de CentralHub sin Docker: el postgresql@18 de Homebrew
# corriendo en su propio directorio de datos y en el puerto 5434.
#
# No usa el servicio de Homebrew (`brew services`), que vive en el 5432 y lo
# comparten otros proyectos. Este es un servidor aparte, solo para CentralHub.
#
#   ./scripts/pg-local.sh start | stop | status
set -euo pipefail

PG18="${PG18:-/opt/homebrew/opt/postgresql@18/bin}"   # prod corre PostgreSQL 18
PORT=5434
DATA="${CENTRALHUB_PGDATA:-$HOME/.local/share/centralhub-pg18}"
LOG="$DATA/server.log"

case "${1:-start}" in
  start)
    if [ ! -f "$DATA/PG_VERSION" ]; then
      echo "→ Creando el directorio de datos en ${DATA}…"
      mkdir -p "$DATA"
      # Usuario postgres y auth "trust" en localhost: es una copia de ensayo que
      # solo escucha en 127.0.0.1, igual que el contenedor que reemplaza.
      "$PG18/initdb" -D "$DATA" -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null
    fi
    if "$PG18/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
      echo "✓ Postgres local ya corre en el puerto $PORT"
    else
      "$PG18/pg_ctl" -D "$DATA" -l "$LOG" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -w start >/dev/null
      echo "✓ Postgres local arriba en el puerto $PORT"
    fi
    psql "postgresql://postgres@127.0.0.1:$PORT/postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='centralhub'" | grep -q 1 \
      || psql "postgresql://postgres@127.0.0.1:$PORT/postgres" -q -c "CREATE DATABASE centralhub;"
    ;;
  stop)
    "$PG18/pg_ctl" -D "$DATA" -w stop >/dev/null && echo "✓ Postgres local detenido"
    ;;
  status)
    "$PG18/pg_ctl" -D "$DATA" status
    ;;
  *)
    echo "uso: $0 start|stop|status" >&2; exit 1
    ;;
esac
