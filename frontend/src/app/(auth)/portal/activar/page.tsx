'use client';

// Pantalla a la que lleva el enlace del correo de bienvenida (o el que el
// equipo reenvía desde la ficha del cliente). El cliente crea aquí su
// contraseña; el enlace sirve una vez y vence a los 7 días.

import { use, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, Link2Off, ShieldAlert } from 'lucide-react';
import api from '@/lib/api';
import {
  PantallaAcceso, Input, MensajeError, BotonPrincipal, Encabezado,
} from '@/components/portal/PantallaAcceso';
import {
  validarContrasenaNueva, motivoEnlaceInvalido, LARGO_MINIMO_CONTRASENA, type MotivoEnlaceInvalido,
} from '@/lib/accesoPortal';

const PANTALLA_ENLACE: Record<MotivoEnlaceInvalido, { icono: typeof Clock; titulo: string; texto: string }> = {
  VENCIDO: {
    icono: Clock,
    titulo: 'El enlace ya venció',
    texto: 'Por seguridad, los enlaces duran 7 días. Pide uno nuevo a tu asesor o a la oficina.',
  },
  USADO: {
    icono: CheckCircle2,
    titulo: 'Este enlace ya se usó',
    texto: 'Tu contraseña ya fue creada. Inicia sesión con ella; si no la recuerdas, pide un enlace nuevo a la oficina.',
  },
  INVALIDO: {
    icono: Link2Off,
    titulo: 'El enlace no es válido',
    texto: 'Revisa que hayas abierto el enlace completo del correo. Si sigue sin funcionar, pide uno nuevo a la oficina.',
  },
  SUSPENDIDA: {
    icono: ShieldAlert,
    titulo: 'Tu cuenta está suspendida',
    texto: 'Comunícate con la oficina para revisar tu acceso.',
  },
};

function IrAlLogin({ texto }: { texto: string }) {
  return (
    <Link
      href="/portal"
      className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center transition-all duration-200"
      style={{ backgroundColor: 'var(--gold)' }}
    >
      {texto}
    </Link>
  );
}

function Aviso({ icono: Icono, titulo, texto, accion }: {
  icono: typeof Clock; titulo: string; texto: string; accion: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <div
        className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <Icono className="w-6 h-6" style={{ color: 'var(--gold)' }} />
      </div>
      <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{titulo}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>{texto}</p>
      {accion}
    </div>
  );
}

export default function ActivarCuentaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const crudo = use(searchParams).token;
  const token = typeof crudo === 'string' ? crudo : '';

  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [listo, setListo] = useState(false);
  const [motivo, setMotivo] = useState<MotivoEnlaceInvalido | null>(token ? null : 'INVALIDO');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const invalida = validarContrasenaNueva(password, confirmacion);
    if (invalida) { setError(invalida); return; }

    setLoading(true);
    try {
      await api.post('/client-auth/activar', { token, password });
      setListo(true);
    } catch (err: unknown) {
      const m = motivoEnlaceInvalido(err);
      if (m) { setMotivo(m); return; }
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 429
          ? 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
          : (err as { response?: { data?: { message?: string } } })?.response?.data?.message
            ?? 'No se pudo activar tu cuenta. Revisa tu conexión e inténtalo de nuevo.',
      );
    } finally {
      setLoading(false);
    }
  }

  let contenido: React.ReactNode;
  if (listo) {
    contenido = (
      <Aviso
        icono={CheckCircle2}
        titulo="¡Listo! Tu cuenta está activa"
        texto="Ya puedes entrar a tu portal con tu correo y la contraseña que acabas de crear."
        accion={<IrAlLogin texto="Iniciar sesión" />}
      />
    );
  } else if (motivo) {
    const p = PANTALLA_ENLACE[motivo];
    contenido = (
      <Aviso
        icono={p.icono}
        titulo={p.titulo}
        texto={p.texto}
        accion={<IrAlLogin texto="Ir al inicio de sesión" />}
      />
    );
  } else {
    contenido = (
      <>
        <Encabezado
          titulo="Crea tu contraseña"
          texto={`Con ella entrarás a tu portal. Usa al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`}
        />
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Contraseña nueva"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <Input
            label="Confirmar contraseña"
            type="password"
            required
            autoComplete="new-password"
            value={confirmacion}
            onChange={e => setConfirmacion(e.target.value)}
            placeholder="••••••••"
          />
          {error && <MensajeError>{error}</MensajeError>}
          <BotonPrincipal type="submit" loading={loading} loadingText="Activando...">
            Activar mi cuenta
          </BotonPrincipal>
        </form>
      </>
    );
  }

  return <PantallaAcceso>{contenido}</PantallaAcceso>;
}
