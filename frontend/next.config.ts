import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Origen de la API (p. ej. https://api.dominio.com). La CSP necesita el
// origen, no la ruta /api/v1. Si la variable falta o no es URL válida, la CSP
// se queda solo con 'self' y lo que falle se verá en la consola como reporte.
function origenApi(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "").origin;
  } catch {
    return "";
  }
}
const api = origenApi();

// CSP en modo Report-Only: el navegador avisa en la consola de lo que
// bloquearía, pero no bloquea nada. Se pasa a Content-Security-Policy
// (bloqueante) cuando se revise la consola en producción y no haya avisos.
// - blob: los PDFs (recibos, cortes, estados de cuenta) se abren como blob
//   en otra pestaña, y @react-pdf puede usar workers/fuentes en blob.
// - data: los QR de validación de recibos son data: URLs.
// - 'unsafe-inline' en scripts: sin nonces, Next inyecta scripts en línea
//   para hidratar; 'unsafe-eval' solo en desarrollo (React lo usa ahí).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${api}`,
  "font-src 'self' data:",
  `connect-src 'self' blob: data: ${api}${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]
  .map((d) => d.trim())
  .join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La app no usa cámara, micrófono, ubicación ni pagos desde el navegador
  // (las fotos de INE se suben como archivo, no con la cámara en vivo).
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Los navegadores la ignoran sobre http (localhost), así que es seguro
  // mandarla siempre; en producción (https) obliga a usar https por 2 años.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig: NextConfig = {
  turbopack: {
    // El repo tiene dos package-lock.json (backend en la raíz y este del
    // frontend). Sin esto Next adivina la raíz del workspace, toma la del
    // backend y avisa en cada build. El frontend no importa nada de fuera de
    // esta carpeta, así que su raíz es ella misma.
    root: path.join(__dirname),
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
