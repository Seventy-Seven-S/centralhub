'use client';

import { useState } from 'react';
import { UserPlus, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { validarDatosDelCliente } from '@/lib/datosCliente';
import type { ErrorApi } from '@/lib/errorApi';

interface Props {
  /** Lo que la secretaria ya había tecleado en la búsqueda. */
  nombreTecleado: string;
  onCreado: (cliente: { id: string; firstName: string; lastName: string }) => void;
  onCancelar: () => void;
}

/** Parte "Juan Carlos Pérez López" en nombre y apellidos: las dos últimas
 *  palabras son los apellidos, salvo que solo haya dos palabras. */
export function partirNombre(completo: string): { firstName: string; lastName: string } {
  const partes = completo.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { firstName: '', lastName: '' };
  if (partes.length === 1) return { firstName: partes[0], lastName: '' };
  if (partes.length === 2) return { firstName: partes[0], lastName: partes[1] };
  return { firstName: partes.slice(0, -2).join(' '), lastName: partes.slice(-2).join(' ') };
}

/**
 * Alta rápida del cliente que recibe un traspaso.
 *
 * El buscador solo encontraba clientes que ya existían, así que un traspaso a
 * una persona nueva no se podía terminar: el formulario se quedaba sin cliente
 * y salía "Elige al cliente que recibe" sin decir qué hacer.
 */
export function ClienteNuevoEnTraspaso({ nombreTecleado, onCreado, onCancelar }: Props) {
  const sugerido = partirNombre(nombreTecleado);
  const [firstName, setFirstName] = useState(sugerido.firstName);
  const [lastName, setLastName] = useState(sugerido.lastName);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const inputStyle = { border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' };
  const campo = 'w-full px-3 py-2 text-sm rounded-lg outline-none';

  async function crear() {
    const problema = validarDatosDelCliente({ firstName, lastName, phone, email });
    if (problema) { setError(problema); return; }

    setGuardando(true); setError(null);
    try {
      const { data } = await api.post('/clients', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
      });
      const creado = data.data.client;
      onCreado({ id: creado.id, firstName: creado.firstName, lastName: creado.lastName });
    } catch (caught) {
      const e = caught as ErrorApi;
      setError(e?.response?.data?.message ?? 'No se pudo dar de alta al cliente');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl p-3 space-y-2"
         style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
      <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
        <UserPlus className="w-3.5 h-3.5" /> Dar de alta al cliente
      </p>

      <div className="grid grid-cols-2 gap-2">
        <input value={firstName} onChange={e => setFirstName(e.target.value)} disabled={guardando}
               placeholder="Nombre(s)" className={campo} style={inputStyle} />
        <input value={lastName} onChange={e => setLastName(e.target.value)} disabled={guardando}
               placeholder="Apellidos" className={campo} style={inputStyle} />
        <input value={phone} onChange={e => setPhone(e.target.value)} disabled={guardando}
               inputMode="tel" placeholder="Teléfono" className={campo} style={inputStyle} />
        <input value={email} onChange={e => setEmail(e.target.value)} disabled={guardando}
               type="email" placeholder="Correo (opcional)" className={campo} style={inputStyle} />
      </div>

      {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} disabled={guardando}
                className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg"
                style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          Cancelar
        </button>
        <button type="button" onClick={crear} disabled={guardando}
                className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent)', color: 'white' }}>
          {guardando && <Loader2 className="w-3 h-3 animate-spin" />}
          Dar de alta y usar
        </button>
      </div>
    </div>
  );
}
