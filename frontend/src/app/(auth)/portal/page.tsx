'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  PantallaAcceso, Input, MensajeError, BotonPrincipal, Encabezado,
} from '@/components/portal/PantallaAcceso';
import type { ErrorApi } from '@/lib/errorApi';

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PortalLoginPage() {
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
      const { data } = await api.post('/client-auth/login', { email, password });
      const { accessToken, client, mustChangePassword } = data.data;

      // Con la contraseña vieja (apellido + teléfono) el layout del portal
      // muestra el cambio obligatorio antes que cualquier otra pantalla.
      login(accessToken, {
        id:       client.id,
        email:    client.email,
        name:     `${client.firstName} ${client.lastName}`,
        role:     'CLIENT',
        clientId: client.id,
        mustChangePassword: mustChangePassword === true,
      });

      document.cookie = `auth_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}`;
      document.cookie = `user_role=CLIENT; path=/; max-age=${60 * 60 * 24 * 7}`;

      router.push('/mis-contratos');
    } catch (caught) {
      const err = caught as ErrorApi;
      const status = err.response?.status;
      // Las cuentas nuevas nacen inactivas hasta que el cliente usa su enlace;
      // el backend responde en inglés y eso no le dice qué hacer.
      setError(
        status === 403
          ? 'Tu cuenta aún no está activa. Usa el enlace de tu correo de bienvenida o pide uno nuevo a la oficina.'
          : status === 401
            ? 'Correo o contraseña incorrectos. Intenta de nuevo.'
            : status === 429
              ? 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
              : err.response?.data?.message ?? 'No se pudo iniciar sesión. Revisa tu conexión.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <PantallaAcceso
      pie={
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          ¿Eres del equipo?{' '}
          <Link
            href="/login"
            className="font-medium transition-colors duration-150"
            style={{ color: 'var(--gold)' }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.15)')}
            onMouseLeave={e => (e.currentTarget.style.filter = '')}
          >
            Accede aquí
          </Link>
        </p>
      }
    >
      <Encabezado titulo="Bienvenido" texto="Ingresa tus credenciales para acceder a tu cuenta" />

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Correo electrónico"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="tu@correo.com"
        />
        <Input
          label="Contraseña"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        {error && <MensajeError>{error}</MensajeError>}

        <BotonPrincipal type="submit" loading={loading} loadingText="Iniciando sesión...">
          Iniciar sesión
        </BotonPrincipal>
      </form>

      <p className="text-xs mt-5 text-center" style={{ color: 'var(--text-tertiary)' }}>
        ¿Primera vez? Usa el enlace de tu correo de bienvenida para crear tu contraseña.
      </p>
    </PantallaAcceso>
  );
}
