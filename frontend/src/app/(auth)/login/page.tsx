'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

export default function LoginPage() {
  const router = useRouter();
  const login  = useAuthStore((s) => s.login);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/login', { email, password });
      const { accessToken, user } = data.data;

      // Persistir en Zustand + localStorage (lo hace el store internamente)
      login(accessToken, {
        id:    user.id,
        email: user.email,
        name:  user.firstName ? `${user.firstName} ${user.lastName}` : user.email,
        role:  user.role,
      });

      // Persistir en cookies para que el middleware de Next.js pueda leerlas
      document.cookie = `auth_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}`;
      document.cookie = `user_role=${user.role}; path=/; max-age=${60 * 60 * 24 * 7}`;

      router.push('/dashboard');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Credenciales incorrectas. Intenta de nuevo.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#0F1F3D' }}>
      <div className="w-full max-w-md">

        {/* Logo / Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
               style={{ backgroundColor: '#C9972C' }}>
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75H3.75A.75.75 0 013 21V9.75z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 21V12h6v9" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">CentralHub</h1>
          <p className="text-sm mt-1" style={{ color: '#9BB0D0' }}>
            Sistema de Gestión Inmobiliaria
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8 shadow-2xl" style={{ backgroundColor: '#162847' }}>
          <h2 className="text-xl font-semibold text-white mb-6">Iniciar sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#9BB0D0' }}>
                Correo electrónico
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@centralhub.com"
                className="w-full rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition focus:ring-2"
                style={{
                  backgroundColor: '#0F1F3D',
                  border: '1px solid #2A4A70',
                  // @ts-ignore
                  '--tw-ring-color': '#C9972C',
                }}
              />
            </div>

            {/* Contraseña */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#9BB0D0' }}>
                Contraseña
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition focus:ring-2"
                style={{
                  backgroundColor: '#0F1F3D',
                  border: '1px solid #2A4A70',
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg px-4 py-3 text-sm flex items-center gap-2"
                   style={{ backgroundColor: '#3B1A1A', color: '#F87171', border: '1px solid #7F2020' }}>
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" clipRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9V5h2v4H9zm0 2h2v2H9v-2z" />
                </svg>
                {error}
              </div>
            )}

            {/* Botón */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#C9972C' }}
              onMouseEnter={(e) => { if (!loading) (e.currentTarget.style.backgroundColor = '#B5851F'); }}
              onMouseLeave={(e) => { (e.currentTarget.style.backgroundColor = '#C9972C'); }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Iniciando sesión...
                </>
              ) : (
                'Iniciar sesión'
              )}
            </button>

          </form>
        </div>

        {/* Link portal cliente */}
        <p className="text-center mt-6 text-sm" style={{ color: '#9BB0D0' }}>
          ¿Eres cliente?{' '}
          <Link href="/portal"
                className="font-medium transition-colors hover:text-white"
                style={{ color: '#C9972C' }}>
            Accede aquí
          </Link>
        </p>

      </div>
    </div>
  );
}
