'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/store/auth.store';

const AGENT_RESTRICTED = ['/dashboard', '/clientes', '/contratos', '/nuevo-contrato', '/cuotas', '/gastos', '/comisiones'];
const ADMIN_ONLY       = ['/usuarios'];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  const router   = useRouter();
  const pathname = usePathname();

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
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Sidebar open={false} onClose={() => {}} />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
        {children}
      </main>
    </div>
  );
}
