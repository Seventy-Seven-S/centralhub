// Llave compuesta para el rate-limiter de auth: identidad (email normalizado)
// + IP. Evita que un atacante bloquee deliberadamente la cuenta de otro
// usuario (denegación de servicio dirigida vía intentos fallidos con su
// email), sin perder la protección de identidad frente a rotación de IP.
export function buildAuthRateLimitKey(email: string | undefined, ip: string): string {
  const normalized = (email ?? '').trim().toLowerCase();
  return normalized ? `${normalized}|${ip}` : `noemail|${ip}`;
}
