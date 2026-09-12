// Validación pública de recibos (anti-falsificación). Ver el modelo
// ReciboLog en schema.prisma para el porqué del diseño (snapshot
// inmutable, id como token de validación en vez del folio).
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { sendReciboEmail, type DatosRecibo } from './email.service';
import { decidirEstadoEnvio, resumirError, type EstadoEnvio } from './lib/envioRecibo';

export interface ReciboLogSnapshot {
  paymentId:      string;
  folio:          string;
  clienteNombre:  string;
  codigoLegado:   string | null;
  proyecto:       string;
  loteLabel:      string | null;
  numeroCuota:    number;
  mes:            string;
  plazoTotal:     number;
  montoPagado:    number;
  fechaPago:      Date;
  concepto:       string;
  balanceDespues: number;
}

// El pago es lo sagrado; el recibo es secundario. Se llama DESPUÉS de que
// la transacción del pago ya hizo commit, nunca dentro de ella — así un
// bug aquí (o la BD caída) nunca puede tumbar un pago real. Nunca lanza:
// si falla, se loguea fuerte (mismo criterio que sendWelcomeEmail en
// email.service.ts) y se devuelve null; el caller sigue sin QR, no sin pago.
export async function crearReciboLog(data: ReciboLogSnapshot): Promise<string | null> {
  try {
    const recibo = await prisma.reciboLog.create({ data });
    return recibo.id;
  } catch (err: any) {
    logger.error(`Fallo al crear ReciboLog para payment ${data.paymentId}: ${err.message} (${err.code ?? err.name})`);
    return null;
  }
}

/**
 * Envía el recibo al cliente y DEJA CONSTANCIA del desenlace.
 *
 * Nunca lanza ni se espera con await desde el cobro: el pago ya hizo commit y
 * la secretaria tiene al cliente enfrente. Lo que cambia respecto a antes es
 * que el resultado ya no se pierde en el log — queda en el recibo, así que se
 * puede ver cuáles fallaron y reenviarlos.
 */
export async function enviarYRegistrarRecibo(
  reciboId: string,
  destino: string | null | undefined,
  datos: DatosRecibo,
): Promise<EstadoEnvio> {
  let error: unknown = null;
  if (destino?.trim()) {
    try {
      await sendReciboEmail(destino, datos);
    } catch (err) {
      error = err;
      logger.error(`Recibo ${reciboId}: falló el envío a ${destino} — ${resumirError(err)}`);
    }
  }

  const estado = decidirEstadoEnvio(destino, error);
  try {
    await prisma.reciboLog.update({
      where: { id: reciboId },
      data: {
        envioEstado:   estado,
        envioDestino:  destino?.trim() || null,
        envioError:    resumirError(error),
        envioAt:       new Date(),
        envioIntentos: { increment: 1 },
      },
    });
  } catch (err: any) {
    // Si ni siquiera se puede anotar el resultado, al log — pero el pago y el
    // correo ya ocurrieron, así que no se propaga.
    logger.error(`Recibo ${reciboId}: no se pudo registrar el envío — ${err.message}`);
  }
  return estado;
}

/** Recibos cuyo correo falló, para revisarlos o reenviarlos. */
export async function recibosConEnvioFallido(limite = 100) {
  return prisma.reciboLog.findMany({
    where: { envioEstado: 'FALLO' },
    orderBy: { issuedAt: 'desc' },
    take: limite,
    select: {
      id: true, folio: true, clienteNombre: true, codigoLegado: true, proyecto: true,
      montoPagado: true, fechaPago: true, issuedAt: true,
      envioDestino: true, envioError: true, envioAt: true, envioIntentos: true,
    },
  });
}

/**
 * Reenvía un recibo ya emitido. `destino` permite corregir el correo cuando el
 * fallo fue por una dirección mal capturada, que es el caso más común.
 *
 * Se reconstruye desde el snapshot del recibo, no desde el pago: el snapshot es
 * lo que el cliente vio la primera vez y debe seguir viendo igual.
 */
export async function reenviarRecibo(reciboId: string, destino?: string | null): Promise<EstadoEnvio> {
  const r = await prisma.reciboLog.findUnique({ where: { id: reciboId } });
  if (!r) throw new Error('El recibo no existe');

  return enviarYRegistrarRecibo(reciboId, destino?.trim() || r.envioDestino, {
    reciboId:       r.id,
    folio:          r.folio,
    clienteNombre:  r.clienteNombre,
    proyecto:       r.proyecto,
    loteLabel:      r.loteLabel,
    numeroCuota:    r.numeroCuota,
    plazoTotal:     r.plazoTotal,
    mes:            r.mes,
    montoPagado:    r.montoPagado,
    fechaPago:      r.fechaPago,
    concepto:       r.concepto,
    balanceDespues: r.balanceDespues,
  });
}

export async function verificarRecibo(id: string) {
  return prisma.reciboLog.findUnique({ where: { id } });
}

// Reimpresión: el snapshot emitido para un pago (null si nunca se generó
// recibo, p. ej. pagos migrados o cuando el log falló al emitir).
export async function obtenerReciboPorPago(paymentId: string) {
  return prisma.reciboLog.findUnique({ where: { paymentId } });
}
