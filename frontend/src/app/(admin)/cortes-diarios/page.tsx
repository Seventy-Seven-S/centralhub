'use client';

// Cortes diarios — el administrador cuenta el dinero que le entregan.
//
// Recibir con diferencia NO se bloquea: se registra con nota obligatoria.
// Trabar el cierre por $300 dejaría el dinero sin entregar, que es peor que
// dejar constancia del faltante.

import { useState } from 'react';
import { Banknote, AlertCircle, CheckCircle2, Clock, X, Loader2 } from 'lucide-react';
import { useCortesDiarios, useRecibirCorte, useCorteDiario, useResumenDiario, CorteDiario } from '@/hooks/useCorteDiario';
import { useRole } from '@/hooks/useRole';
import { formatCurrency, formatDateUTC } from '@/lib/utils';

function Badge({ status }: { status: CorteDiario['status'] }) {
  const recibido = status === 'RECIBIDO';
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{
            backgroundColor: recibido ? 'var(--accent-pale)' : 'var(--gold-pale)',
            color: recibido ? 'var(--accent)' : 'var(--gold)',
          }}>
      {recibido ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {recibido ? 'Recibido' : 'Pendiente de entrega'}
    </span>
  );
}

function RecibirModal({ corte, onClose }: { corte: CorteDiario; onClose: () => void }) {
  const { data: detalle } = useCorteDiario(corte.id);
  const recibir = useRecibirCorte();
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');

  const montoNum = Number(monto.replace(/[^0-9.]/g, '')) || 0;
  const diferencia = monto.trim() === '' ? 0 : Math.round((montoNum - corte.declarado) * 100) / 100;
  const hayDiferencia = Math.abs(diferencia) >= 0.5;
  const inputStyle = { border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (monto.trim() === '') return setError('Escribe cuánto dinero contaste');
    if (hayDiferencia && !nota.trim()) return setError('Hay una diferencia: explica en la nota a qué se debe');
    recibir.mutate(
      { id: corte.id, recibido: montoNum, notaAdmin: nota.trim() || undefined },
      { onSuccess: onClose, onError: (err: any) => setError(err.response?.data?.message ?? 'No se pudo registrar') },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4 sticky top-0" style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Recibir corte #{corte.numero}</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {corte.cobrador.firstName} {corte.cobrador.lastName} · {formatDateUTC(corte.fecha)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--text-secondary)' }}><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Efectivo registrado en el sistema</span>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(corte.totalEfectivo)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1.5">
              <span style={{ color: 'var(--text-secondary)' }}>Declarado por quien entrega</span>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(corte.declarado)}</span>
            </div>
            {detalle?.resumen.porProyecto.length ? (
              <div className="mt-3 pt-3 space-y-1" style={{ borderTop: '1px solid var(--border)' }}>
                {detalle.resumen.porProyecto.map(p => (
                  <div key={p.code} className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-tertiary)' }}>{p.nombre} · {p.pagos}</span>
                    <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(p.efectivo)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {corte.notaCobrador && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              <strong>Nota de quien entrega:</strong> {corte.notaCobrador}
            </p>
          )}

          <div>
            <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>¿Cuánto contaste?</label>
            <input
              inputMode="decimal" autoFocus
              value={monto} onChange={e => setMonto(e.target.value)}
              placeholder={String(corte.declarado)}
              className="w-full px-4 py-3 text-xl font-semibold rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 tabular-nums"
              style={inputStyle}
            />
          </div>

          {hayDiferencia && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: 'var(--danger-pale)', color: 'var(--danger)' }}>
              {diferencia < 0 ? 'Faltante' : 'Sobrante'} de <strong>{formatCurrency(Math.abs(diferencia))}</strong>. La nota es obligatoria.
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Nota {hayDiferencia && <span style={{ color: 'var(--danger)' }}>*</span>}
            </label>
            <textarea
              value={nota} onChange={e => setNota(e.target.value)} rows={2}
              placeholder={hayDiferencia ? 'A qué se debe la diferencia' : 'Opcional'}
              className="w-full px-3 py-2 text-sm rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 resize-none"
              style={inputStyle}
            />
          </div>

          {error && <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-pale)' }}>{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>Cancelar</button>
            <button type="submit" disabled={recibir.isPending}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ backgroundColor: 'var(--accent)' }}>
              {recibir.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmar recepción
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CortesDiariosPage() {
  const { isAdmin } = useRole();
  const { data: cortes = [], isLoading } = useCortesDiarios();
  const [recibiendo, setRecibiendo] = useState<CorteDiario | null>(null);

  const pendientes = cortes.filter(c => c.status === 'PENDIENTE_ENTREGA');
  const { data: resumen } = useResumenDiario(undefined, isAdmin);

  if (isLoading) {
    return <div className="h-64 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--surface)' }} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Cortes diarios</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {isAdmin
            ? `${pendientes.length} ${pendientes.length === 1 ? 'entrega pendiente' : 'entregas pendientes'} de ${cortes.length}`
            : `${cortes.length} ${cortes.length === 1 ? 'corte tuyo' : 'cortes tuyos'}`}
        </p>
      </div>

      {isAdmin && resumen && (resumen.cerrados > 0 || resumen.faltanPorCerrar > 0) && (
        <div className="rounded-2xl p-6"
             style={{ backgroundColor: 'var(--surface)',
                      border: `1.5px solid ${resumen.completo ? 'var(--accent)' : 'var(--gold)'}` }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Total del día
              </p>
              <p className="text-4xl font-bold mt-2 tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {formatCurrency(resumen.totalDeclarado)}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {resumen.cerrados} {resumen.cerrados === 1 ? 'corte cerrado' : 'cortes cerrados'}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: resumen.completo ? 'var(--accent-pale)' : 'var(--gold-pale)',
                    color: resumen.completo ? 'var(--accent)' : 'var(--gold)',
                  }}>
              {resumen.completo
                ? <><CheckCircle2 className="w-3.5 h-3.5" /> Todas cerraron</>
                : <><Clock className="w-3.5 h-3.5" /> {resumen.faltanPorCerrar} por cerrar</>}
            </span>
          </div>

          {!resumen.completo && (
            <p className="text-xs mt-3 rounded-lg px-3 py-2"
               style={{ backgroundColor: 'var(--gold-pale)', color: 'var(--gold)' }}>
              Este total todavía no es el del día: falta{resumen.faltanPorCerrar === 1 ? '' : 'n'}{' '}
              {resumen.faltanPorCerrar} {resumen.faltanPorCerrar === 1 ? 'persona' : 'personas'} por cerrar su corte.
            </p>
          )}

          <div className="mt-4 pt-4 space-y-1.5" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Ya recibido</span>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                {formatCurrency(resumen.totalRecibido)}
              </span>
            </div>
            {resumen.pendientesDeEntrega > 0 && (
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>
                  Pendiente de entrega <span style={{ color: 'var(--text-tertiary)' }}>· {resumen.pendientesDeEntrega}</span>
                </span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--gold)' }}>
                  {formatCurrency(resumen.totalDeclarado - resumen.totalRecibido)}
                </span>
              </div>
            )}
            {resumen.totalOtros > 0 && (
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-tertiary)' }}>Transferencias y cheques (no se entregan)</span>
                <span className="tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                  {formatCurrency(resumen.totalOtros)}
                </span>
              </div>
            )}
            {resumen.cortesConDiferencia > 0 && (
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--danger)' }}>
                  Con diferencia <span style={{ color: 'var(--text-tertiary)' }}>· {resumen.cortesConDiferencia}</span>
                </span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--danger)' }}>
                  {formatCurrency(resumen.totalDiferencia)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {cortes.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ backgroundColor: 'var(--surface)' }}>
          <Banknote className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--bg-tertiary)' }} />
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Todavía no hay cortes</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                  {['#', 'Fecha', 'Cobró', 'Efectivo', 'Declarado', 'Recibido', 'Dif.', 'Estado', ''].map((h, i) => (
                    <th key={h + i} className={`px-4 py-3 font-semibold whitespace-nowrap ${i >= 3 && i <= 6 ? 'text-right' : 'text-left'}`}
                        style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cortes.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>#{c.numero}</td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{formatDateUTC(c.fecha)}</td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                      {c.cobrador.firstName} {c.cobrador.lastName}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(c.totalEfectivo)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: 'var(--text-primary)' }}>{formatCurrency(c.declarado)}</td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {c.recibido === null ? '—' : formatCurrency(c.recibido)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold"
                        style={{ color: !c.diferencia ? 'var(--text-tertiary)' : 'var(--danger)' }}>
                      {!c.diferencia ? '—' : formatCurrency(c.diferencia)}
                    </td>
                    <td className="px-4 py-3"><Badge status={c.status} /></td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin && c.status === 'PENDIENTE_ENTREGA' && (
                        <button onClick={() => setRecibiendo(c)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
                                style={{ backgroundColor: 'var(--accent)' }}>
                          Recibir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recibiendo && <RecibirModal corte={recibiendo} onClose={() => setRecibiendo(null)} />}
    </div>
  );
}
