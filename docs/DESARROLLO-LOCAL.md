# Ambiente local

Todo lo que se pruebe aquí corre contra **una copia de producción**, no contra
producción. Es el ensayo antes de tocar la base real.

## Levantar

```bash
npm run local:up      # Postgres 18 en el puerto 5434 (docker)
npm run dev           # API en http://localhost:4000
cd frontend && npm run dev   # UI en http://localhost:3001
```

## Refrescar los datos desde producción

```bash
npm run local:refresh
```

Abre producción **solo en lectura** (`pg_dump`), destruye la base local y la
reemplaza. Tarda menos de un minuto.

## Por qué el puerto 5434 y no el 5432

En el 5432 vive el `postgresql@17` de Homebrew, que otros proyectos usan. El
contenedor de CentralHub tiene puerto propio para que nunca haya duda de a qué
base le está pegando un script. Además la versión coincide con producción
(PostgreSQL 18), porque `pg_dump` no puede leer un servidor más nuevo que él.

## Los correos NO salen en local

`EMAIL_TRANSPORT=console` en `.env`. La copia local trae los correos **reales**
de los clientes: sin esto, probar el recibo o el correo de bienvenida le
llegaría de verdad a un cliente. Con el transporte de consola el correo se
registra en la terminal — de ahí se lee el código 2FA para poder entrar.

Nunca aplica en producción: ahí el correo siempre sale.

## Cómo ensayar un script de datos

`.env` apunta a local, así que por omisión todo script pega en local:

```bash
npx tsx src/scripts/<script>.ts ... --confirm     # local
```

Para producción hay que pasar la URL a propósito:

```bash
PGURL=$(railway variables --service Postgres --json | jq -r .DATABASE_PUBLIC_URL)
DATABASE_URL="$PGURL" npx tsx src/scripts/<script>.ts ... --confirm
```

Si `railway variables` devuelve vacío (pasa de vez en cuando), `DATABASE_URL`
queda vacía y el script se iría a la base local dando resultados que parecen de
producción sin serlo. Siempre valida que la URL no venga vacía.
