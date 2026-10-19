/**
 * Piezas puras de la verificación diaria del correo (jobs/verificarCorreo.job).
 *
 * Separadas del job para probarlas sin Resend ni base de datos.
 */

/** El dominio del remitente, venga como "a@b.com" o como "Nombre <a@b.com>". */
export function dominioDeRemitente(from: string | null | undefined): string | null {
  if (!from) return null;
  const dentro = from.match(/<([^>]+)>/)?.[1] ?? from;
  const arroba = dentro.lastIndexOf('@');
  if (arroba < 0) return null;
  const dominio = dentro.slice(arroba + 1).trim().toLowerCase();
  return dominio || null;
}

export interface DominioResend { name: string; status: string }

/**
 * ¿El dominio del remitente está listo para enviar? Solo 'verified' cuenta:
 * cualquier otro estado (pending, failed, partially_*) significa que Resend
 * está rechazando o puede rechazar los correos de ese remitente.
 */
export function evaluarDominio(
  dominios: DominioResend[],
  dominio: string,
): { ok: true } | { ok: false; motivo: string } {
  const d = dominios.find(x => x.name.toLowerCase() === dominio);
  if (!d) return { ok: false, motivo: `el dominio ${dominio} no está dado de alta en Resend` };
  if (d.status !== 'verified') return { ok: false, motivo: `el dominio ${dominio} está en estado "${d.status}" en Resend` };
  return { ok: true };
}

/** Resend responde así cuando la llave solo puede enviar (no leer dominios). */
export function esLlaveSoloEnvio(error: { name?: string } | null | undefined): boolean {
  return error?.name === 'restricted_api_key';
}
