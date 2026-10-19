// Recibos cuyo correo no le llegó al cliente. El backend deja constancia del
// desenlace de cada envío (ENVIADO / FALLO / SIN_CORREO); esta pantalla lista
// los FALLO para reenviarlos, a la misma dirección o a una corregida.

export type EstadoEnvio = 'ENVIADO' | 'FALLO' | 'SIN_CORREO';

export interface ReciboFallido {
  id: string;
  folio: string;
  clienteNombre: string;
  codigoLegado: string | null;
  proyecto: string;
  loteLabel: string | null;
  montoPagado: number;
  fechaPago: string;
  issuedAt: string;
  envioDestino: string | null;
  envioError: string | null;
  envioAt: string | null;
  envioIntentos: number;
}

/** Lo que se le dice a quien reenvió, según cómo terminó el reenvío. */
export const RESULTADO_REENVIO: Record<EstadoEnvio, { texto: string; tono: 'ok' | 'error' | 'aviso' }> = {
  ENVIADO:    { texto: 'Enviado', tono: 'ok' },
  FALLO:      { texto: 'Volvió a fallar', tono: 'error' },
  // El backend lo marca así cuando no hay a dónde mandarlo: el recibo deja de
  // contarse como fallido, pero el cliente sigue sin recibirlo.
  SIN_CORREO: { texto: 'Sin correo: no se envió', tono: 'aviso' },
};

// Validación de forma, no de existencia: solo atrapa lo obvio (espacios, sin
// arroba, sin dominio) antes de gastar un intento contra Resend.
const FORMA_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function correoValido(correo: string): boolean {
  return FORMA_CORREO.test(correo.trim());
}

/**
 * El correo a mandar al reenviar: `undefined` si es el mismo de siempre (el
 * backend reusa el destino guardado), o el nuevo ya recortado si lo corrigieron.
 */
export function destinoParaReenvio(original: string | null, editado: string): string | undefined {
  const limpio = editado.trim();
  if (!limpio || limpio === (original ?? '').trim()) return undefined;
  return limpio;
}
