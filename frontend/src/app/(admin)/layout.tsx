'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Menu, Home } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/store/auth.store';
import { ProjectProvider } from '@/contexts/ProjectContext';

// El AGENT sí entra a /comisiones (el backend le sirve solo las suyas)
const AGENT_RESTRICTED = ['/dashboard', '/clientes', '/contratos', '/nuevo-contrato', '/cuotas', '/gastos'];
const ADMIN_ONLY       = ['/usuarios'];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  const router   = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Cerrar el drawer al navegar (el onClose de los links del Sidebar también
  // lo hace, pero esto cubre navegaciones programáticas)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    } else if (user?.role === 'CLIENT') {
      router.replace('/mis-contratos');
    } else if (user?.role === 'AGENT' && AGENT_RESTRICTED.some(r => pathname.startsWith(r))) {
      router.replace('/lotes');
    } else if (user?.role !== 'ADMIN' && ADMIN_ONLY.some(r => pathname.startsWith(r))) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, user, router, pathname]);

  if (!isAuthenticated || user?.role === 'CLIENT') return null;

  return (
    <ProjectProvider>
      <div className="flex flex-col lg:flex-row h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>

        {/* Topbar móvil: en pantallas chicas el sidebar vive en un drawer y
            este botón es la única forma de abrirlo */}
        <header
          className="lg:hidden flex items-center gap-3 px-4 h-14 flex-shrink-0 sticky top-0 z-40"
          style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-lg"
            style={{ color: 'var(--text-primary)' }}
            aria-label="Abrir menú"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Home className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>CentralHub</span>
        </header>

        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
          {children}
        </main>
      </div>
    </ProjectProvider>
  );
}
