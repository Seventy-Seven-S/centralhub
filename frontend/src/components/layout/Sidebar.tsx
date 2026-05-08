'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Building2, Users, FileText,
  Calendar, Map, LogOut, Home, X, UserCog, Sun, Moon,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useTheme } from '@/app/providers';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Dashboard',  href: '/dashboard',  icon: LayoutDashboard },
  { label: 'Proyectos',  href: '/proyectos',  icon: Building2 },
  { label: 'Clientes',   href: '/clientes',   icon: Users },
  { label: 'Contratos',  href: '/contratos',  icon: FileText },
  { label: 'Cuotas',     href: '/cuotas',     icon: Calendar },
  { label: 'Lotes',      href: '/lotes',      icon: Map },
  { label: 'Usuarios',   href: '/usuarios',   icon: UserCog },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN:   'Administrador',
  MANAGER: 'Gerente',
  AGENT:   'Agente',
  CLIENT:  'Cliente',
};

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout } = useAuthStore();
  const { theme, toggle } = useTheme();

  function handleLogout() {
    logout();
    document.cookie = 'auth_token=; path=/; max-age=0';
    document.cookie = 'user_role=; path=/; max-age=0';
    router.push('/login');
  }

  function getInitials(name: string) {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  }

  const sidebar = (
    <aside
      className="flex flex-col h-full"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        width: 260,
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-between px-5 py-5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Home className="w-5 h-5 text-white" />
          </div>
          <span
            className="font-semibold text-lg tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            CentralHub
          </span>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-1 transition-colors duration-150"
          style={{ color: 'var(--text-tertiary)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Badge proyecto activo */}
      <div
        className="flex items-center gap-2 px-5 py-2.5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: 'var(--accent)' }}
        />
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Monarca II
        </span>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {(() => {
          const AGENT_HIDDEN = ['/dashboard', '/clientes', '/contratos', '/cuotas'];
          const ADMIN_ONLY   = ['/usuarios'];
          return NAV_ITEMS.filter(item => {
            if (user?.role === 'AGENT' && AGENT_HIDDEN.includes(item.href)) return false;
            if (user?.role !== 'ADMIN' && ADMIN_ONLY.includes(item.href)) return false;
            return true;
          });
        })().map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150"
              style={
                active
                  ? {
                      backgroundColor: 'var(--accent-pale)',
                      color: 'var(--accent-hover)',
                      borderLeft: '2px solid var(--accent)',
                      paddingLeft: 'calc(0.75rem - 2px)',
                      paddingRight: '0.75rem',
                    }
                  : {
                      color: 'var(--text-secondary)',
                      paddingLeft: '0.75rem',
                      paddingRight: '0.75rem',
                    }
              }
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)';
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = '';
              }}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Usuario + Tema + Logout */}
      <div
        className="px-3 pb-4 pt-3"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        {user && (
          <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-full text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: 'var(--accent-pale)', color: 'var(--accent)' }}
            >
              {getInitials(user.name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {user.name}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                {ROLE_LABELS[user.role] ?? user.role}
              </p>
            </div>
          </div>
        )}

        {/* Toggle tema */}
        <button
          onClick={toggle}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors duration-150"
          style={{ color: 'var(--text-tertiary)' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)';
            (e.currentTarget as HTMLElement).style.backgroundColor = '';
          }}
        >
          {theme === 'light'
            ? <Moon className="w-5 h-5 flex-shrink-0" />
            : <Sun  className="w-5 h-5 flex-shrink-0" />
          }
          {theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
        </button>

        {/* Cerrar sesión */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors duration-150"
          style={{ color: 'var(--text-tertiary)' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)';
            (e.currentTarget as HTMLElement).style.backgroundColor = '';
          }}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:flex flex-col h-screen sticky top-0 flex-shrink-0" style={{ width: 260 }}>
        {sidebar}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="flex flex-col h-full" style={{ width: 260 }}>
            {sidebar}
          </div>
          <div className="flex-1 bg-black/50" onClick={onClose} />
        </div>
      )}
    </>
  );
}
