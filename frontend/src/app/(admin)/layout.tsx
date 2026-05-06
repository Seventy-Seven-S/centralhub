'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Navbar  from '@/components/layout/Navbar';
import { useAuthStore } from '@/store/auth.store';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuthenticated, user } = useAuthStore();
  const router = useRouter();

  // Guard: redirige si no está autenticado o es cliente
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    } else if (user?.role === 'CLIENT') {
      router.replace('/mis-contratos');
    }
  }, [isAuthenticated, user, router]);

  if (!isAuthenticated || user?.role === 'CLIENT') return null;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Navbar */}
        <Navbar onMenuClick={() => setSidebarOpen(true)} />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>

      </div>
    </div>
  );
}
