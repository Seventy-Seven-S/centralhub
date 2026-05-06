'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Building2, Users, FileText,
  Calendar, Map, LogOut, Home, X,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Dashboard',  href: '/dashboard',  icon: LayoutDashboard },
  { label: 'Proyectos',  href: '/proyectos',  icon: Building2 },
  { label: 'Clientes',   href: '/clientes',   icon: Users },
  { label: 'Contratos',  href: '/contratos',  icon: FileText },
  { label: 'Cuotas',     href: '/cuotas',     icon: Calendar },
  { label: 'Lotes',      href: '/lotes',      icon: Map },
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
      style={{ backgroundColor: '#0F1F3D', width: 260 }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b" style={{ borderColor: '#1E3A5F' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0"
               style={{ backgroundColor: '#C9972C' }}>
            <Home className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">CentralHub</span>
        </div>
        {/* Botón cerrar en mobile */}
        <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white p-1">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                active
                  ? 'text-white'
                  : 'text-gray-400 hover:text-white'
              )}
              style={active ? { backgroundColor: '#C9972C' } : undefined}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(201,151,44,0.12)';
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = '';
              }}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Usuario + Logout */}
      <div className="px-3 pb-4 pt-3 border-t" style={{ borderColor: '#1E3A5F' }}>
        {user && (
          <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
            <div className="flex items-center justify-center w-9 h-9 rounded-full text-white text-xs font-bold flex-shrink-0"
                 style={{ backgroundColor: '#C9972C' }}>
              {getInitials(user.name)}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs truncate" style={{ color: '#9BB0D0' }}>
                {ROLE_LABELS[user.role] ?? user.role}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white transition-colors duration-150"
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,80,80,0.12)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop: fijo */}
      <div className="hidden lg:flex flex-col h-screen sticky top-0 flex-shrink-0"
           style={{ width: 260 }}>
        {sidebar}
      </div>

      {/* Mobile: overlay */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="flex flex-col h-full" style={{ width: 260 }}>
            {sidebar}
          </div>
          {/* Backdrop */}
          <div className="flex-1 bg-black/50" onClick={onClose} />
        </div>
      )}
    </>
  );
}
