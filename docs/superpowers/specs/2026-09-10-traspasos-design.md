# Traspasos y dinero retenido — diseño

Fecha: 2026-09-10 · Estado: aprobado, pendiente de plan de implementación

## El problema

Un lote cambia de manos y CentralHub no tiene cómo registrarlo. Hoy eso se
resuelve a mano: se edita el cliente, o se cancela por SQL, o se mete un pago
negativo. El resultado es que la app no sabe quién es el dueño actual de varios
contratos, y que el dinero que un cliente abonó antes de irse desaparece sin
explicación.

### Evidencia

Barrido del consolidado validado por las secretarias (`censo-traspasos.ts`):

| Señal en el archivo | Casos |
|---|---|
| Cliente anterior registrado | 61 contratos |
| Marcado `TRASPASO` | 8 |
| Cambio de proyecto | 4 |
| Rescisión | 3 |

De los 61 con dueño anterior, la app ya tiene al dueño correcto en 55. **En 6
quedó el anterior**: V047, V070, V171, V463, A049 y C037. A esos seis se les
está cobrando a nombre de quien ya no es dueño.

Las anotaciones del archivo muestran que el dinero se negocia caso por caso:

- `K016` — "SE CAMBIO DE MONARCA 1 **(Se le respetó lo pagado)**"
- `K095` — "SE CAMBIO DE BUGAMBILIAS **(se le respetarán solo $10,000 del enganche)**"
- `F170` — "(RESCISIÓN DE CONTRATO) se cambió a Monarca 2"

Y ya hay **$1,752,485** retenidos de 38 contratos cancelados, sin una sola
devolución registrada — el 1% de los ingresos del negocio.

### Las cuatro formas que existen en la realidad

1. **Cambio de titular** — mismo lote, mismo proyecto, otro dueño.
2. **Reubicación** — el cliente se mueve a otro lote o a otro proyecto
   (`E024` Bugambilias → `K095` Monarca 2).
3. **Cesión parcial de lotes** — `D073` compró 3, cedió 2, conservó 1. Hoy
   está registrado como un pago negativo de −$155,000 con el concepto
   "Ajuste por secion de lote".
4. **Rescisión con reventa** — `V348` se rescinde y el lote M13-29 se revende
   como `V463`.

## Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Modelo del contrato | Cambio de titular **o** cerrar-y-abrir, según el caso | Un solo modelo no cubre las cuatro formas |
| Quién elige la forma | **El sistema**, no la secretaria | Se deduce del destino: mismo lote y proyecto ⇒ titular; cualquier otra cosa ⇒ reubicación |
| El dinero | Lo captura quien hace el traspaso, con el total como sugerencia | El archivo muestra acuerdos distintos en cada caso |
| El bucket | **Vista derivada**, no un saldo guardado | Un contador a mano se desincroniza; calculado no puede mentir |

## Diseño

### Modelo de datos

```prisma
enum TraspasoTipo {
  CAMBIO_TITULAR   // mismo lote y proyecto: el contrato sigue, cambia el dueño
  REUBICACION      // otro lote u otro proyecto: se cierra uno y se abre otro
}

model Traspaso {
  id                String       @id @default(uuid())
  numero            Int          @unique
  fecha             DateTime
  tipo              TraspasoTipo

  contratoOrigenId  String
  contratoDestinoId String?      // null en CAMBIO_TITULAR: es el mismo contrato

  clienteAnteriorId String
  clienteNuevoId    String

  montoAbonado      Float        // lo que el origen tenía pagado al momento
  montoRespetado    Float        // lo que se le reconoce en el destino

  motivo            String?
  nota              String?      // OBLIGATORIA si montoRespetado <> montoAbonado
  documentoUrl      String?      // evidencia firmada, en el storage privado
  createdById       String
  createdAt         DateTime     @default(now())
}
```

Se agrega `TRASPASADO` a `ContractStatus` y `TRASPASO_ENTRADA` a `PaymentType`.

`montoAbonado − montoRespetado` **no se guarda**: se deriva. Guardar una resta
es invitar a que los tres números dejen de cuadrar.

### Cómo se mueve el dinero

**Los pagos del cliente que se va NO se tocan.** Si Daniel pagó $40,000, pagó
$40,000: es un hecho y sus recibos lo prueban. Restarle $30,000 con un
movimiento negativo volvería mentira su historial y rompería los recibos ya
emitidos — que son documentos con folio y validación pública.

En su lugar, un solo movimiento nuevo en el destino:

```
E024 Daniel Ramírez (Bugambilias)
  Pagos ............ $40,000   ← intactos
  Estado ........... TRASPASADO
  ⤷ traspaso #7 → K095

K095 Daniel Ramírez (Monarca 2)
  Abono por traspaso  $10,000   ← Payment tipo TRASPASO_ENTRADA
  ⤷ viene del traspaso #7

Traspaso #7
  Abonado ......... $40,000
  Respetado ....... $10,000
  Diferencia ...... $30,000
  Nota: "Se acordó respetar solo el enganche"
```

Los $30,000 que no pasaron quedan explicados en el acta, con quién lo autorizó
y por qué.

En `CAMBIO_TITULAR` no se mueve un peso: el contrato conserva su historial
completo y solo cambia de dueño.

### Flujo

| Paso | Quién | Qué |
|---|---|---|
| Abrir traspaso | ADMIN o MANAGER | Desde el detalle del contrato |
| Elegir destino | | Cliente nuevo (existente o alta) y lote destino |
| El sistema decide el tipo | | Mismo lote+proyecto ⇒ `CAMBIO_TITULAR`; si no ⇒ `REUBICACION` |
| Capturar el dinero | | Propone el total abonado; si se ajusta, exige nota |
| Adjuntar evidencia | | Documento firmado, al storage privado (como la rescisión) |
| Confirmar | | Todo en una transacción |

**Reglas duras**

- Un contrato `TRASPASADO` o `CANCELED` no se puede traspasar otra vez.
- `montoRespetado` no puede exceder `montoAbonado` ni ser negativo.
- El lote destino debe estar `AVAILABLE` (o ser el mismo, en cambio de titular).
- En `REUBICACION`, el lote origen se libera y el contrato origen queda
  `TRASPASADO` con balance 0.
- La nota es obligatoria cuando `montoRespetado <> montoAbonado`.

### El bucket: dinero retenido

Vista derivada, solo ADMIN, junto a Liquidaciones.

```
DINERO RETENIDO                            $1,752,485
  Por cancelación ....... 38 casos ....... $1,752,485
  Por traspaso ........... 0 casos ............... $0
  Equivale al 1.0% de los ingresos
```

Fórmula: `pagado − devuelto − respetado en traspaso`, por contrato cerrado.

**No es dinero nuevo.** Ya está contado como ingreso desde que el cliente pagó.
El bucket es una etiqueta sobre dinero que ya está en caja, y que dice: *esto
ya no respalda ninguna obligación con un cliente*. Presentarlo como una suma
aparte lo contaría dos veces.

Desglosa por proyecto, por año y por quién autorizó.

## Qué hacer con lo que ya existe

**Los 6 con dueño equivocado** (V047, V070, V171, V463, A049, C037) son los
primeros casos reales del módulo. Necesitan de las secretarias: fecha del
traspaso y cuánto se le respetó a cada uno.

**Los 38 cancelados con $1,752,485 retenidos** tienen dos huecos que el bucket
va a destapar el primer día:

1. **Ninguno tiene devolución registrada.** O no se devolvió nada —lo normal en
   una rescisión— o se devolvió por fuera y no se capturó.
2. **La mayoría no tiene `rescindedAt`**: se cancelaron por SQL en las
   migraciones, antes de que existiera el flujo de rescisión.

El usuario trabajará esto con las secretarias (cuándo y cuánto se devolvió).

**`D073`** es una cesión parcial ya resuelta a mano con un pago negativo. No se
migra: queda documentada como el precedente de por qué existe el módulo.

## Fuera de alcance

- Devoluciones de dinero al cliente (solo se registran, no se procesan pagos).
- Traspasos entre proyectos con precios distintos y recálculo automático del
  plan: el destino se captura como un contrato normal.
- Migrar los traspasos históricos que la app ya refleja correctamente (55).
