# Servicios que CentralHub necesita para funcionar

Si alguno de estos se cae o se vence, la app deja de operar. Anotado el
2026-09-12.

Los montos y fechas de cobro **no** aparecen aquí: viven en el panel de cada
proveedor y solo los ve quien tenga acceso a la facturación. Lo que sí está
verificado es qué se usa, para qué, y qué pasa si falta.

## Críticos — si fallan, la app se cae

| Servicio | Para qué | Si falla |
|---|---|---|
| **Railway** | Hospeda los 3 servicios: backend, frontend y PostgreSQL | La app deja de existir: ni secretarias ni clientes entran |
| **Resend** | Todos los correos: 2FA de staff, recibos de pago, bienvenida | Nadie puede iniciar sesión (el 2FA llega por correo) |
| **seventyss.com** | Dominio desde el que se envían los correos (`send.seventyss.com`) | Los correos dejan de salir |
| **Google Cloud DNS** | Resuelve `seventyss.com` (nameservers `ns-cloud-d*.googledomains.com`) | Se cae el correo y cualquier subdominio |

### Railway — detalle verificado

- Proyecto `centralhub`, entorno `production`, región **sfo**
- **backend** — volumen `/data` usando 0.8 GB de 48.8 GB
- **frontend**
- **Postgres** — base de **65 MB**, con volumen propio

El cobro de Railway es **por uso** (CPU, RAM, red, almacenamiento), no una
mensualidad fija: crece si crece el tráfico o la base. Si la tarjeta falla,
Railway suspende el proyecto y la app se apaga.

### seventyss.com — detalle verificado

- Registrador: **Squarespace Domains II LLC**
- **Vence: 10 de abril de 2027**
- DNS en Google Cloud DNS
- El correo del dominio raíz va por **Google Workspace** (MX `smtp.google.com`,
  SPF `include:_spf.google.com`) — o sea que Workspace también se paga aparte

## Pendiente de arreglar en el DNS

El subdominio `send.seventyss.com` tiene el DKIM pero **le faltan el SPF y el
MX** que pide Resend. El dominio aparece como verificado y los correos salen,
pero sin SPF cargan peor reputación y es más fácil que caigan en spam, sobre
todo en Hotmail y Outlook. Los registros exactos los muestra Resend en su
panel de dominios.

## Otros

| Servicio | Nota |
|---|---|
| **GitHub** (`Seventy-Seven-S/centralhub`) | Guarda el código. Si se pierde el acceso no se cae la app, pero no se puede volver a desplegar |
| **centralinmob.com** | Registrado en **Neubox**, vence el **15 de septiembre de 2027**. Apunta a 65.99.205.90 y **no lo usa CentralHub** — solo aparece como dato de ejemplo en los tests |

## Qué revisar en cada panel

Esto no se puede ver desde el código; hay que entrar:

1. **Railway** — que la tarjeta esté vigente y revisar el consumo del mes
2. **Resend** — plan y límite de correos por mes; si se pasa, deja de enviar
3. **Squarespace Domains** — que la renovación automática de `seventyss.com`
   esté encendida (vence 10-abr-2027)
4. **Google Workspace** — las cuentas de correo del dominio
5. **Neubox** — `centralinmob.com` (vence 15-sep-2027), solo si todavía se usa
   para algo fuera de esta app
