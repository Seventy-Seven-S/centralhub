'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import NotificationBell from '@/components/layout/NotificationBell';

const PORTAL_NAV = [
  { label: 'Mis contratos', href: '/mis-contratos' },
  { label: 'Mis pagos',     href: '/mis-pagos' },
  { label: 'Mi cuenta',     href: '/mi-cuenta' },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'CLIENT') {
      router.replace('/portal');
    }
  }, [isAuthenticated, user, router]);

  function handleLogout() {
    logout();
    document.cookie = 'auth_token=; path=/; max-age=0';
    document.cookie = 'user_role=; path=/; max-age=0';
    router.push('/portal');
  }

  if (!isAuthenticated || user?.role !== 'CLIENT') return null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>

      {/* Navbar */}
      <nav
        className="shadow-sm sticky top-0 z-40"
        style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--gold)' }}
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75H3.75A.75.75 0 013 21V9.75z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 21V12h6v9" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>CentralHub</span>
              <span className="hidden sm:inline text-xs ml-2" style={{ color: 'var(--text-tertiary)' }}>Portal de Clientes</span>
            </div>
          </div>

          {/* Navegación */}
          <div className="hidden md:flex items-center gap-1">
            {PORTAL_NAV.map(({ label, href }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition"
                  style={{
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    backgroundColor: active ? 'var(--bg-secondary)' : 'transparent',
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Usuario + logout */}
          <div className="flex items-center gap-3">
            <NotificationBell scope="portal" />
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{user.email}</p>
            </div>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: 'var(--portal-navy)' }}
            >
              {user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-secondary)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>

        {/* Navegación móvil (los clientes entran mayormente desde el teléfono) */}
        <div className="md:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
          {PORTAL_NAV.map(({ label, href }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition"
                style={{
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  backgroundColor: active ? 'var(--bg-secondary)' : 'transparent',
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>

    </div>
  );
}
