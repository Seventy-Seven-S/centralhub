'use client';

// Se muestra en lugar de todo el portal cuando el cliente entró con la
// contraseña vieja que el sistema le asignaba (apellido + teléfono, o
// Central2024). Esa contraseña viajó en claro por correo y se adivina con los
// datos del contrato, así que no se le deja ver nada hasta que la cambie.

import { useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import {
  PantallaAcceso, Input, MensajeError, BotonPrincipal, Encabezado,
} from './PantallaAcceso';
import { validarContrasenaNueva, LARGO_MINIMO_CONTRASENA } from '@/lib/accesoPortal';

export function CambioObligatorio({ onSalir }: { onSalir: () => void }) {
  const marcarContrasenaCambiada = useAuthStore((s) => s.marcarContrasenaCambiada);

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const invalida = validarContrasenaNueva(nueva, confirmacion);
    if (invalida) { setError(invalida); return; }
    if (nueva === actual) { setError('La contraseña nueva tiene que ser distinta de la actual'); return; }

    setLoading(true);
    try {
      await api.post('/client-auth/change-password', { currentPassword: actual, newPassword: nueva });
      marcarContrasenaCambiada();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? 'No se pudo cambiar la contraseña. Inténtalo de nuevo.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <PantallaAcceso
      pie={
        <button
          type="button"
          onClick={onSalir}
          className="text-xs font-medium"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Salir sin cambiarla
        </button>
      }
    >
      <Encabezado
        titulo="Cambia tu contraseña"
        texto={`Tu contraseña actual es la que te asignamos al principio y es fácil de adivinar. Crea una nueva de al menos ${LARGO_MINIMO_CONTRASENA} caracteres para continuar.`}
      />
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Contraseña actual"
          type="password"
          required
          autoComplete="current-password"
          value={actual}
          onChange={e => setActual(e.target.value)}
          placeholder="••••••••"
        />
        <Input
          label="Contraseña nueva"
          type="password"
          required
          autoComplete="new-password"
          value={nueva}
          onChange={e => setNueva(e.target.value)}
          placeholder="••••••••"
        />
        <Input
          label="Confirmar contraseña nueva"
          type="password"
          required
          autoComplete="new-password"
          value={confirmacion}
          onChange={e => setConfirmacion(e.target.value)}
          placeholder="••••••••"
        />
        {error && <MensajeError>{error}</MensajeError>}
        <BotonPrincipal type="submit" loading={loading} loadingText="Guardando...">
          Guardar y continuar
        </BotonPrincipal>
      </form>
    </PantallaAcceso>
  );
}
