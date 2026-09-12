/**
 * Estado del envío del recibo por correo.
 *
 * Hasta ahora, si el correo del recibo fallaba, el error se escribía en el log
 * del servidor y ahí moría: la secretaria veía el pago registrado, el cliente
 * nunca recibía nada, y no quedaba forma de saberlo. Guardar el desenlace hace
 * visible el problema y permite reenviar lo que falló.
 *
 * Se usan literales en vez del enum de Prisma a propósito: importar
 * @prisma/client desde aquí obligaría a cada test que mockea este módulo a
 * exportar también el enum.
 */
export type EstadoEnvio = 'ENVIADO' | 'FALLO' | 'SIN_CORREO';

/** Sin correo NO es un fallo: muchos clientes migrados no tienen, y el cobro
 *  quedó registrado igual. Distinguirlo evita perseguir errores inexistentes. */
export function decidirEstadoEnvio(destino: string | null | undefined, error: unknown): EstadoEnvio {
  if (!destino?.trim()) return 'SIN_CORREO';
  return error ? 'FALLO' : 'ENVIADO';
}

const MAX = 500;

/** El mensaje del error, acotado: la columna es para diagnosticar de un vistazo,
 *  no para guardar un stack trace completo. */
export function resumirError(error: unknown): string | null {
  if (!error) return null;
  const texto = error instanceof Error ? error.message
    : typeof error === 'string' ? error
    : (() => { try { return JSON.stringify(error); } catch { return String(error); } })();
  return texto.length > MAX ? `${texto.slice(0, MAX - 1)}…` : texto;
}
