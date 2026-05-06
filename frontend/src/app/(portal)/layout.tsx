'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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
    <div className="min-h-screen bg-gray-100">

      {/* Navbar */}
      <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                 style={{ backgroundColor: '#C9972C' }}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75H3.75A.75.75 0 013 21V9.75z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 21V12h6v9" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-gray-900 text-sm">CentralHub</span>
              <span className="hidden sm:inline text-xs text-gray-400 ml-2">Portal de Clientes</span>
            </div>
          </div>

          {/* Usuario + logout */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900 leading-tight">{user.name}</p>
              <p className="text-xs text-gray-400">{user.email}</p>
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                 style={{ backgroundColor: '#0F1F3D' }}>
              {user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>

    </div>
  );
}
