'use client';

// Tarjeta "Portal de clientes" de la ficha del cliente: en qué va su cuenta y
// el botón para mandarle un enlace nuevo cuando no le llegó la bienvenida, se
// le venció o olvidó su contraseña. Con el portal apagado no se muestra nada.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Send } from 'lucide-react';
import api from '@/lib/api';
import { TEXTO_ESTADO_ACCESO, type EstadoAccesoPortal } from '@/lib/accesoPortal';

interface AccesoPortal {
  portalActivo: boolean;
  email: string | null;
  estado: EstadoAccesoPortal;
  ultimoAcceso: string | null;
  enlaceVenceEl: string | null;
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

export function AccesoPortalCliente({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const { data } = useQuery({
    queryKey: ['clientes', clientId, 'portal-acceso'],
    queryFn: async (): Promise<AccesoPortal> => (await api.get(`/clients/${clientId}/portal-acceso`)).data.data,
  });

  const reenviar = useMutation({
    mutationFn: async () => (await api.post(`/clients/${clientId}/portal-acceso/reenviar`)).data,
    onSuccess: (res) => {
      setAviso({ tipo: 'ok', texto: res.message ?? 'Acceso enviado' });
      queryClient.invalidateQueries({ queryKey: ['clientes', clientId, 'portal-acceso'] });
    },
    onError: (err: unknown) => {
      setAviso({
        tipo: 'error',
        texto:
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message
            ?? 'No se pudo enviar el acceso. Inténtalo de nuevo.',
      });
    },
  });

  if (!data?.portalActivo) return null;

  const sinCorreo = !data.email;
  const suspendida = data.estado === 'SUSPENDIDA';

  return (
    <div className="rounded-2xl p-6 shadow-sm" style={{ backgroundColor: 'var(--surface)' }}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <KeyRound className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Portal de clientes</p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {TEXTO_ESTADO_ACCESO[data.estado]}
              {data.enlaceVenceEl && ` · enlace vigente hasta el ${fecha(data.enlaceVenceEl)}`}
              {data.ultimoAcceso && ` · último acceso ${fecha(data.ultimoAcceso)}`}
            </p>
          </div>
        </div>

        <button
          onClick={() => { setAviso(null); reenviar.mutate(); }}
          disabled={reenviar.isPending || sinCorreo || suspendida}
          title={sinCorreo ? 'Agrega el correo del cliente para mandarle el acceso' : undefined}
          className="sm:ml-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ border: '1px solid var(--border)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <Send className="w-4 h-4" />
          {reenviar.isPending ? 'Enviando…' : 'Reenviar acceso al portal'}
        </button>
      </div>

      {sinCorreo && (
        <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
          El cliente no tiene correo registrado. Agrégalo con “Editar” para poder mandarle el acceso.
        </p>
      )}
      {aviso && (
        <p
          className="text-xs mt-3 px-3 py-2 rounded-lg"
          style={{
            backgroundColor: aviso.tipo === 'ok' ? 'var(--accent-pale)' : 'var(--danger-pale)',
            color: aviso.tipo === 'ok' ? 'var(--accent)' : 'var(--danger)',
          }}
        >
          {aviso.texto}
          {aviso.tipo === 'ok' && '. El enlace vence en 7 días y sirve una sola vez.'}
        </p>
      )}
    </div>
  );
}
