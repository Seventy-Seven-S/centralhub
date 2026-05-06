import { NextRequest, NextResponse } from 'next/server';

const ADMIN_ROUTES  = ['/dashboard', '/proyectos', '/clientes', '/contratos', '/cuotas', '/lotes'];
const PORTAL_ROUTES = ['/mi-cuenta', '/mis-contratos', '/mis-pagos'];
const PUBLIC_ROUTES = ['/login', '/portal'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token     = req.cookies.get('auth_token')?.value;
  const userRole  = req.cookies.get('user_role')?.value;

  const isAdminRoute  = ADMIN_ROUTES.some(r => pathname.startsWith(r));
  const isPortalRoute = PORTAL_ROUTES.some(r => pathname.startsWith(r));
  const isPublicRoute = PUBLIC_ROUTES.some(r => pathname.startsWith(r));

  if (isPublicRoute) return NextResponse.next();

  if (!token) {
    const loginUrl = isPortalRoute ? '/portal' : '/login';
    return NextResponse.redirect(new URL(loginUrl, req.url));
  }

  if (isAdminRoute && userRole === 'CLIENT') {
    return NextResponse.redirect(new URL('/mis-contratos', req.url));
  }

  if (isPortalRoute && userRole !== 'CLIENT') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
