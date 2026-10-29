// Clasificación de rutas para el proxy (src/proxy.ts). Vive aparte para poder
// probarla sin levantar Next: la prueba compara estas listas contra las
// carpetas reales de app/(admin) y app/(portal), así que si alguien agrega
// una página nueva y olvida protegerla, la prueba lo avisa.

// Una entrada por carpeta de app/(admin). Los guards por rol (AGENT, solo
// ADMIN) siguen viviendo en (admin)/layout.tsx; aquí solo se decide si hace
// falta sesión y que un cliente del portal no entre al panel.
export const ADMIN_ROUTES = [
  '/clientes',
  '/contratos',
  '/cortes',
  '/cortes-diarios',
  '/cuotas',
  '/dashboard',
  '/dinero-retenido',
  '/gastos',
  '/informe',
  '/ingresos',
  '/lotes',
  '/mi-corte',
  '/nuevo-contrato',
  '/proyectos',
  '/recibos-fallidos',
  '/usuarios',
];

// Una entrada por carpeta de app/(portal).
export const PORTAL_ROUTES = ['/mi-cuenta', '/mis-contratos', '/mis-pagos'];

// /validar: página pública de validación de recibos (el QR del recibo
// apunta aquí) — cualquiera, con sesión o sin ella, debe poder verla.
export const PUBLIC_ROUTES = ['/login', '/portal', '/validar'];

// Coincidencia por segmento completo: "/cortes" cubre "/cortes/abc" pero no
// una ruta que solo empiece igual (p. ej. "/cortes-diarios" ya tiene su propia
// entrada; con startsWith a secas cualquier prefijo colaba).
export function coincideRuta(pathname: string, rutas: readonly string[]): boolean {
  return rutas.some(r => pathname === r || pathname.startsWith(r + '/'));
}
