// Validación pública de recibos (anti-falsificación). Ver el modelo
// ReciboLog en schema.prisma para el porqué del diseño (snapshot
// inmutable, id como token de validación en vez del folio).
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

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

export async function verificarRecibo(id: string) {
  return prisma.reciboLog.findUnique({ where: { id } });
}
