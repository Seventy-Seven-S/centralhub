import { NextRequest, NextResponse } from 'next/server';

const ADMIN_ROUTES  = ['/dashboard', '/proyectos', '/clientes', '/contratos', '/cuotas', '/lotes'];
const PORTAL_ROUTES = ['/mi-cuenta', '/mis-contratos', '/mis-pagos'];
// /validar: página pública de validación de recibos (el QR del recibo
// apunta aquí) — cualquiera, con sesión o sin ella, debe poder verla.
const PUBLIC_ROUTES = ['/login', '/portal', '/validar'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token     = req.cookies.get('auth_token')?.value;
  const userRole  = req.cookies.get('user_role')?.value;

  const isAdminRoute  = ADMIN_ROUTES.some(r => pathname.startsWith(r));
  const isPortalRoute = PORTAL_ROUTES.some(r => pathname.startsWith(r));
  const isPublicRoute = PUBLIC_ROUTES.some(r => pathname.startsWith(r));

  // ── Ya autenticado intentando ir a login/portal ───────────────────────────
  if (isPublicRoute && token) {
    if (pathname.startsWith('/login') && userRole !== 'CLIENT') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    if (pathname.startsWith('/portal') && userRole === 'CLIENT') {
      return NextResponse.redirect(new URL('/mis-contratos', req.url));
    }
  }

  // ── Rutas públicas sin token → dejar pasar ────────────────────────────────
  if (isPublicRoute) return NextResponse.next();

  // ── Sin token → redirect a login correspondiente ─────────────────────────
  if (!token) {
    const loginUrl = isPortalRoute ? '/portal' : '/login';
    return NextResponse.redirect(new URL(loginUrl, req.url));
  }

  // ── Cliente intentando acceder a admin ────────────────────────────────────
  if (isAdminRoute && userRole === 'CLIENT') {
    return NextResponse.redirect(new URL('/mis-contratos', req.url));
  }

  // ── Admin/Manager/Agent intentando acceder al portal ─────────────────────
  if (isPortalRoute && userRole !== 'CLIENT') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
