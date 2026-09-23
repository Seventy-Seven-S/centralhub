#!/bin/sh
set -e

# Railway monta el volumen persistente en /data AL ARRANCAR el contenedor, y
# eso tapa la carpeta que el Dockerfile creó al construir la imagen. El volumen
# montado pertenece a root, así que el usuario `node` no podía crear
# /data/storage: todo guardado de archivos fallaba con EACCES y en producción
# nunca se almacenó un solo contrato firmado ni documento de rescisión.
#
# Por eso el contenedor arranca como root, arregla los permisos del volumen ya
# montado, y recién entonces baja a `node` para correr la aplicación.
DIR="${FILE_STORAGE_DIR:-/data/storage}"

if mkdir -p "$DIR" 2>/dev/null; then
  chown -R node:node "$DIR" 2>/dev/null || true
  echo "[entrypoint] storage listo en $DIR"
else
  # No se pudo preparar: se avisa fuerte pero NO se tumba el arranque. La app
  # sirve para cobrar aunque no pueda guardar documentos; caerse aquí dejaría
  # a las secretarias sin sistema por algo que solo afecta a los adjuntos.
  echo "[entrypoint] AVISO: no se pudo preparar $DIR — los adjuntos fallarán" >&2
fi

exec setpriv --reuid=node --regid=node --init-groups -- "$@"
