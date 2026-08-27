import QRCode from 'qrcode';

// Formateador MANUAL de montos — a propósito no usa toLocaleString/Intl:
// el entorno donde se renderiza el PDF (@react-pdf/renderer) corre con
// ICU incompleto, así que Intl silenciosamente ignora el locale/las
// opciones y los recibos reales salían como "$3667" sin coma ni
// decimales. Split de miles por regex, sin depender de locale data.
export function formatMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const fixed = Math.abs(n).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${withThousands}.${decPart}`;
}

// Folio derivado (no persiste, no es secuencial) — REC-{código}-{cuota}de{plazoTotal}
export function buildReciboFolio(codigo: string, numeroCuota: number, plazoTotal: number): string {
  return `REC-${codigo}-${numeroCuota}de${plazoTotal}`;
}

// El Arq pidió ambos teléfonos en todos los recibos, sin condición por
// proyecto ni etiquetas — ya no depende del proyecto.
export const TELEFONOS_RECIBO = '868 156 1069 / 868 363 0211';

// Agrega el número de cuota a la descripción si no aparece ya como
// número suelto (evita duplicarlo si el concepto ya lo trae, ej. "#19").
export function buildDescripcion(concepto: string, numeroCuota: number): string {
  const trimmed = concepto.trim();
  const yaTieneNumero = new RegExp(`\\b${numeroCuota}\\b`).test(trimmed);
  if (yaTieneNumero) return trimmed;
  return trimmed ? `${trimmed} — Cuota #${numeroCuota}` : `Cuota #${numeroCuota}`;
}

// URL pública de validación del recibo — lo que codifica el QR. Detrás de
// una env var para que local/staging/producción apunten cada uno a su
// propio dominio; por ahora el default es la URL real de Railway.
export function buildValidacionUrl(reciboId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://frontend-production-96a0.up.railway.app';
  return `${base}/validar/${reciboId}`;
}

// Genera el QR real como data-uri PNG. La librería `qrcode` tiene build
// para navegador (canvas) y para Node (pngjs, sin canvas) — funciona en
// ambos sin configuración extra, por eso es segura de usar tanto en los
// modales (browser) como en scripts/tests (Node).
export async function buildQrDataUri(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 1, width: 256 });
}
