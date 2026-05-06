'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':  'Dashboard',
  '/proyectos':  'Proyectos',
  '/clientes':   'Clientes',
  '/contratos':  'Contratos',
  '/cuotas':     'Cuotas',
  '/lotes':      'Lotes',
};

function getPageTitle(pathname: string): string {
  // Exact match
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Prefix match for detail pages
  const prefix = Object.keys(PAGE_TITLES).find(k => pathname.startsWith(k + '/'));
  return prefix ? PAGE_TITLES[prefix] : 'CentralHub';
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

interface NavbarProps {
  onMenuClick: () => void;
}

export default function Navbar({ onMenuClick }: NavbarProps) {
  const pathname = usePathname();
  const user     = useAuthStore((s) => s.user);
  const title    = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-4 bg-white border-b border-gray-200 px-4 lg:px-6 h-16 shadow-sm flex-shrink-0">

      {/* Hamburguesa — solo mobile */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Título de página */}
      <h1 className="text-lg font-semibold text-gray-900 flex-1">{title}</h1>

      {/* Right section */}
      <div className="flex items-center gap-3">

        {/* Badge proyecto activo */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
             style={{ backgroundColor: '#FFF8EC', color: '#8A620A', border: '1px solid #F0D080' }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: '#C9972C' }} />
          Monarca II
        </div>

        {/* Avatar usuario */}
        {user && (
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-full text-white text-sm font-bold flex-shrink-0"
                 style={{ backgroundColor: '#C9972C' }}>
              {getInitials(user.name)}
            </div>
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium text-gray-900 leading-tight">{user.name}</p>
              <p className="text-xs text-gray-500 leading-tight">{user.email}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
