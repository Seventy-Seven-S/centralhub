# Edición de datos del contrato por ADMIN + rediseño de la vista del cliente

Fecha: 2026-09-19 · Aprobado por Miguel Machuca en conversación.

## Por qué

El arquitecto y su equipo dependen de Miguel para cualquier corrección de un
contrato. La decisión de negocio es darles los datos editables para que cuadren
ellos mismos: manzana y lote, precio total, mensualidad y el mes en que arranca
el calendario de mensualidades.

Dos hallazgos que definen el alcance:

1. **Ya existe un agujero abierto.** `PUT /contracts/:id` permite hoy a un
   MANAGER cambiar `downPayment`, `financingAmount`, `installmentCount`,
   `installmentAmount` y **`balance` directamente**, sin recalcular una sola
   cuota y sin dejar rastro. Es la corrupción silenciosa que `payment.service`
   se esfuerza en impedir (ahí editar o cancelar un pago está prohibido
   justamente por esto). Esta spec no abre una puerta nueva: cierra esta y pone
   una con reglas.

2. **No existe ninguna bitácora de auditoría** en el sistema. Hay `ReciboLog` y
   `EstadoCuentaLog`, nada más. Si se va a editar dinero, hay que crearla.

### El desfase de mensualidades, medido

`buildCuotaRows` ancla el calendario en `contract.startDate`: la cuota *i* vence
en `startDate + i meses`. Si `startDate` quedó mal en la migración, **todas** las
etiquetas de mes se corren, los pagos caen en el mes equivocado y el contrato
aparece en mora falsa.

Medición en producción (2026-09-19), comparando el vencimiento de la cuota 1
contra la fecha del primer pago INSTALLMENT de cada contrato vivo:

| Desfase | Contratos |
|---|---|
| 2 meses o más | 88 |
| Dentro de un mes | 1,248 |

Los 1,248 son ruido de fechas de cobro. Los 88 son el defecto, concentrados en
Valle del Roble (33) y Monarca II (20).

H038 (Antelmo) es un caso distinto y aparte: su mensualidad se migró como
precio ÷ 60 cuando su plazo real es de 72 meses. Lo cubre el mismo endpoint.

## Decisiones tomadas

| Pregunta | Decisión |
|---|---|
| Calendario al cambiar precio o mensualidad | Rehacer completo y reaplicar todos los pagos reales en orden |
| Mora ya acumulada | Recalcular desde cero; la bitácora guarda el valor anterior |
| "Primer pago" editable | Es el **mes en que arranca el calendario de mensualidades**, no el enganche |
| Editar manzana y lote | Corregir una captura equivocada; el lote destino debe estar libre |
| Motivo del cambio | Obligatorio |
| Los 88 desfasados | Script con dry-run, revisados por proyecto; nunca automático |

## Arquitectura

### Un solo camino para el dinero

- `PUT /contracts/:id` deja de aceptar campos monetarios. Queda para `notes` y
  `agentId`.
- Nuevo `PATCH /contracts/:id/datos`, **solo ADMIN**. Acepta: `totalPrice`,
  `installmentAmount`, `installmentCount`, `mesInicioCalendario`, `lotIds`,
  `motivo` (obligatorio). Todos opcionales salvo el motivo.

### Qué hace, en una transacción

1. **Validar.** El precio nuevo no puede ser menor a lo ya pagado. El lote
   destino no puede estar vendido a otro contrato. El mes de arranque no puede
   ser posterior al primer pago real.
2. **Rehacer el calendario** con los valores nuevos (`buildCuotaRows`).
3. **Reaplicar los pagos confirmados** en orden (`recomponerCuotas`).
4. **Recalcular balance y mora** desde cero (`estadoDelContrato`).
5. **Escribir la bitácora**, una fila por campo que cambió.

Los pasos 3 y 4 usan piezas ya escritas y probadas el 2026-09-19 al corregir los
pagos de V018→V108 y de V005 Teresa. No se inventa motor nuevo.

### Bitácora

```
model CambioContrato {
  id            String   @id @default(uuid())
  contractId    String
  userId        String
  campo         String   // "totalPrice", "installmentAmount", ...
  valorAnterior String?
  valorNuevo    String?
  motivo        String
  createdAt     DateTime @default(now())
}
```

Una fila por campo, no por edición: así la vista puede responder "¿por qué
cambió la mensualidad?" sin desenterrar un blob. `moraMonthsCount` y `balance`
también se registran aunque el ADMIN no los toque directamente, porque son el
efecto visible del cambio.

### Rediseño de la vista del contrato

Hoy la sección 1 acumula diez botones de acción en fila y compite con la
información que la secretaria necesita de un golpe.

- **Encabezado:** identidad (cliente, contrato, lote, estatus) y tres cifras
  (precio, pagado, saldo). Las acciones se van a un menú.
- **Datos del contrato:** bloque con los campos editables y el botón Editar,
  visible solo para ADMIN.
- **Cuotas**, **Pagos**, **Historial de cambios**.

### Los 88 desfasados

Script con `--dry-run` por omisión, filtrable por proyecto, que usa el mismo
servicio. Se revisan por proyecto empezando por Valle del Roble.

## Riesgo asumido

Al recalcular la mora desde cero, varios de los 88 dejarán de aparecer en mora
de un día para otro. Si alguien del equipo ya les cobró con ese dato, el cambio
se notará. Por eso la bitácora conserva el valor anterior.
