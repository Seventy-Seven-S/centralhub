'use client';

// Recibos que no le llegaron al cliente. Antes de esta pantalla el fallo
// quedaba anotado en la base pero nadie lo veía: la secretaria registraba el
// pago, el cliente nunca recibía su recibo y nadie se enteraba.
//
// Tras reenviar, la fila se queda en la lista con el resultado a la vista; si
// se recargara, los que sí salieron desaparecerían y no habría forma de saber
// qué pasó con cada uno.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, MailCheck, Send } from 'lucide-react';
import api from '@/lib/api';
import { useRole } from '@/hooks/useRole';
import { formatCurrency, formatDateUTC, normalizeForSearch } from '@/lib/utils';
import {
  correoValido, destinoParaReenvio, RESULTADO_REENVIO,
  type EstadoEnvio, type ReciboFallido,
} from '@/lib/recibosFallidos';

const TONO_COLOR = { ok: 'var(--accent)', error: 'var(--danger)', aviso: 'var(--gold)' } as const;

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function RecibosFallidosPage() {
  const { isAdmin } = useRole();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [correos, setCorreos] = useState<Record<string, string>>({});
  const [resultados, setResultados] = useState<Record<string, { estado?: EstadoEnvio; error?: string }>>({});

  const { data: recibos = [], isLoading, isError } = useQuery<ReciboFallido[]>({
    enabled: isAdmin,
    queryKey: ['recibos-fallidos'],
    queryFn: async () => (await api.get('/payments/recibos/fallidos')).data.data,
    // No se refresca solo: un refetch borraría de la vista los que ya se
    // reenviaron bien, junto con su resultado.
    refetchOnWindowFocus: false,
  });

  const reenviar = useMutation({
    mutationFn: async ({ id, email }: { id: string; email?: string }) =>
      (await api.post(`/payments/recibos/${id}/reenviar`, email ? { email } : {})).data.data as { estado: EstadoEnvio },
    onSuccess: ({ estado }, { id }) => {
      setResultados(r => ({ ...r, [id]: { estado } }));
      queryClient.invalidateQueries({ queryKey: ['recibos-fallidos-conteo'] });
    },
    onError: (err: unknown, { id }) => {
      const texto = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'No se pudo reenviar. Inténtalo de nuevo.';
      setResultados(r => ({ ...r, [id]: { error: texto } }));
    },
  });

  const filtrados = useMemo(() => {
    const n = normalizeForSearch(q.trim());
    if (!n) return recibos;
    return recibos.filter(r =>
      normalizeForSearch(`${r.clienteNombre} ${r.codigoLegado ?? ''} ${r.folio} ${r.envioDestino ?? ''}`).includes(n));
  }, [recibos, q]);

  const pendientes = recibos.filter(r => resultados[r.id]?.estado !== 'ENVIADO').length;
  const inputStyle = { border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-10 h-10" style={{ color: 'var(--gold)' }} />
        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Acceso restringido</p>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Los recibos no enviados solo los revisa un administrador.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Recibos no enviados</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {isLoading ? 'Cargando…' : `${pendientes} por reenviar · el pago ya está registrado, solo faltó el correo al cliente`}
        </p>
      </div>

      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Buscar por cliente, contrato, folio o correo…"
        className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
        style={inputStyle}
      />

      <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
        {isError ? (
          <div className="flex flex-col items-center py-16 gap-2"><AlertCircle className="w-8 h-8 text-red-400" /><p style={{ color: 'var(--text-secondary)' }}>No se pudieron cargar los recibos</p></div>
        ) : isLoading ? (
          <div className="p-5 space-y-2 animate-pulse">{[...Array(6)].map((_, i) => <div key={i} className="h-10 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }} />)}</div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2">
            <MailCheck className="w-10 h-10" style={{ color: 'var(--accent)' }} />
            <p style={{ color: 'var(--text-secondary)' }}>{recibos.length === 0 ? 'Todos los recibos llegaron' : 'Sin recibos con esta búsqueda'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                  {['Emitido', 'Folio', 'Contrato', 'Cliente', 'Monto', 'Destino', 'Error', 'Intentos', ''].map((h, i) => (
                    <th key={i} className={`px-4 py-3 font-semibold whitespace-nowrap ${i === 4 || i === 7 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map(r => {
                  const correo = correos[r.id] ?? r.envioDestino ?? '';
                  const resultado = resultados[r.id];
                  const enviado = resultado?.estado === 'ENVIADO';
                  const enviando = reenviar.isPending && reenviar.variables?.id === r.id;
                  const invalido = !correoValido(correo);
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', opacity: enviado ? 0.6 : 1 }}>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{formatDateUTC(r.issuedAt, 'short')}</td>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{r.folio}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{r.codigoLegado ?? '—'}</span>
                        <span className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>{r.proyecto}{r.loteLabel && ` · ${r.loteLabel}`}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{r.clienteNombre}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{formatCurrency(r.montoPagado)}</td>
                      <td className="px-4 py-2.5">
                        {/* Editable: el fallo más común es un correo mal capturado. */}
                        <input
                          type="email"
                          value={correo}
                          disabled={enviado}
                          onChange={e => setCorreos(c => ({ ...c, [r.id]: e.target.value }))}
                          placeholder="correo@cliente.com"
                          className="w-56 rounded-lg px-2.5 py-1.5 text-xs outline-none"
                          style={{ ...inputStyle, borderColor: correo && invalido ? 'var(--danger)' : 'var(--border)' }}
                        />
                      </td>
                      <td className="px-4 py-2.5 max-w-[260px] text-xs" style={{ color: 'var(--danger)' }} title={r.envioError ?? undefined}>
                        <span className="line-clamp-2">{r.envioError ?? '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {r.envioIntentos}
                        {r.envioAt && <span className="block" style={{ color: 'var(--text-tertiary)' }}>{fechaHora(r.envioAt)}</span>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-right">
                        {resultado?.estado || resultado?.error ? (
                          <p className="text-xs font-semibold mb-1"
                             style={{ color: resultado.error ? 'var(--danger)' : TONO_COLOR[RESULTADO_REENVIO[resultado.estado!].tono] }}>
                            {resultado.error ?? RESULTADO_REENVIO[resultado.estado!].texto}
                          </p>
                        ) : null}
                        {!enviado && (
                          <button
                            onClick={() => {
                              setResultados(x => ({ ...x, [r.id]: {} }));
                              reenviar.mutate({ id: r.id, email: destinoParaReenvio(r.envioDestino, correo) });
                            }}
                            disabled={enviando || invalido}
                            title={invalido ? 'Captura un correo válido' : undefined}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: 'var(--accent)', color: 'white' }}
                          >
                            <Send className="w-3.5 h-3.5" />
                            {enviando ? 'Enviando…' : 'Reenviar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
