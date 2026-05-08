'use client';

import { usePathname } from 'next/navigation';
import { Menu, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/app/providers';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':  'Dashboard',
  '/proyectos':  'Proyectos',
  '/clientes':   'Clientes',
  '/contratos':  'Contratos',
  '/cuotas':     'Cuotas',
  '/lotes':      'Lotes',
  '/usuarios':   'Usuarios',
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const prefix = Object.keys(PAGE_TITLES).find(k => pathname.startsWith(k + '/'));
  return prefix ? PAGE_TITLES[prefix] : 'CentralHub';
}

interface NavbarProps {
  onMenuClick: () => void;
}

export default function Navbar({ onMenuClick }: NavbarProps) {
  const pathname          = usePathname();
  const title             = getPageTitle(pathname);
  const { theme, toggle } = useTheme();

  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-4 px-4 lg:px-6 h-14 flex-shrink-0"
      style={{
        backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Hamburguesa — solo mobile */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg transition-colors duration-150"
        style={{ color: 'var(--text-secondary)' }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
          (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
          (e.currentTarget as HTMLElement).style.backgroundColor = '';
        }}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Título */}
      <h1
        className="text-lg font-semibold flex-1"
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
      </h1>

      {/* Right section */}
      <div className="flex items-center gap-2">

        {/* Badge proyecto activo */}
        <div
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: 'var(--accent-pale)',
            color: 'var(--accent)',
            border: '1px solid var(--accent-pale)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}
          />
          Monarca II
        </div>

        {/* Toggle tema */}
        <button
          onClick={toggle}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
            (e.currentTarget as HTMLElement).style.color = 'var(--accent)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
          }}
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>

      </div>
    </header>
  );
}
