'use client';

// "Mi corte del día" — lo que ve quien cobra en campo al cerrar la jornada.
//
// No hay que seleccionar pagos a mano: el corte es TODO lo que esa persona
// cobró hoy y aún no entrega. El efectivo va arriba porque es lo que viaja en
// el sobre; transferencias y cheques se muestran aparte y no se cuadran contra
// la entrega, porque no vienen en la mano.

import { useMemo, useState } from 'react';
import { Banknote, Landmark, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useMiDia, useCerrarCorte } from '@/hooks/useCorteDiario';
import { formatCurrency } from '@/lib/utils';

const METODO: Record<string, string> = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CHECK: 'Cheque', CARD: 'Tarjeta' };

export default function MiCortePage() {
  const { data, isLoading, isError } = useMiDia();
  const cerrar = useCerrarCorte();

  const [declarado, setDeclarado] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [cerrado, setCerrado] = useState<{ numero: number } | null>(null);

  const resumen = data?.resumen;
  const declaradoNum = Number(declarado.replace(/[^0-9.]/g, '')) || 0;
  const diferencia = useMemo(
    () => (declarado.trim() === '' ? 0 : Math.round((declaradoNum - (resumen?.totalEfectivo ?? 0)) * 100) / 100),
    [declarado, declaradoNum, resumen],
  );

  const hoy = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const inputStyle = { border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' };

  function onCerrar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (declarado.trim() === '') return setError('Escribe cuánto efectivo vas a entregar');
    if (declaradoNum < 0) return setError('El monto no puede ser negativo');
    cerrar.mutate(
      { declarado: declaradoNum, notaCobrador: nota.trim() || undefined },
      {
        onSuccess: c => setCerrado({ numero: c.numero }),
        onError: (err: any) => setError(err.response?.data?.message ?? 'No se pudo cerrar el corte'),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-8 w-48 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        <div className="h-40 rounded-2xl" style={{ backgroundColor: 'var(--surface)' }} />
        <div className="h-64 rounded-2xl" style={{ backgroundColor: 'var(--surface)' }} />
      </div>
    );
  }

  if (isError || !data || !resumen) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-10 h-10" style={{ color: 'var(--danger)' }} />
        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>No se pudo cargar tu corte</p>
      </div>
    );
  }

  if (cerrado) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 text-center px-6">
        <CheckCircle2 className="w-16 h-16" style={{ color: 'var(--accent)' }} />
        <div>
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Corte #{cerrado.numero} cerrado</p>
          <p className="text-sm mt-2 max-w-sm" style={{ color: 'var(--text-secondary)' }}>
            Entrega {formatCurrency(declaradoNum)} en efectivo al administrador. Él lo va a contar y
            confirmar en el sistema.
          </p>
        </div>
      </div>
    );
  }

  const sinCobros = data.pagos.length === 0;

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Mi corte del día</h1>
        <p className="text-sm mt-0.5 first-letter:uppercase" style={{ color: 'var(--text-secondary)' }}>{hoy}</p>
      </div>

      {sinCobros ? (
        <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: 'var(--surface)' }}>
          <Banknote className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--bg-tertiary)' }} />
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Todavía no registras cobros hoy</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Cuando registres pagos aparecerán aquí para cerrar tu corte.
          </p>
        </div>
      ) : (
        <>
          {/* Efectivo — lo que se entrega en mano */}
          <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--surface)', border: '1.5px solid var(--accent)' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Efectivo cobrado hoy
                </p>
                <p className="text-4xl font-bold mt-2 tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  {formatCurrency(resumen.totalEfectivo)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {resumen.pagosEfectivo} {resumen.pagosEfectivo === 1 ? 'pago' : 'pagos'}
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--accent-pale)' }}>
                <Banknote className="w-6 h-6" style={{ color: 'var(--accent)' }} />
              </div>
            </div>

            {resumen.porProyecto.length > 0 && (
              <div className="mt-5 pt-4 space-y-1.5" style={{ borderTop: '1px solid var(--border)' }}>
                {resumen.porProyecto.map(p => (
                  <div key={p.code} className="flex items-center justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {p.nombre} <span style={{ color: 'var(--text-tertiary)' }}>· {p.pagos}</span>
                    </span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {formatCurrency(p.efectivo)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* No efectivo — informativo, no entra en la entrega */}
          {resumen.totalOtros > 0 && (
            <div className="rounded-2xl p-4 flex items-center gap-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <Landmark className="w-5 h-5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              <div className="text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>
                  Además cobraste <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(resumen.totalOtros)}</strong> por
                  transferencia o cheque ({resumen.pagosOtros}).
                </span>{' '}
                <span style={{ color: 'var(--text-tertiary)' }}>Ese dinero no lo entregas en mano.</span>
              </div>
            </div>
          )}

          {/* Cierre */}
          <form onSubmit={onCerrar} className="rounded-2xl p-6 space-y-4" style={{ backgroundColor: 'var(--surface)' }}>
            <div>
              <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                ¿Cuánto efectivo vas a entregar?
              </label>
              <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                Cuenta el dinero y escribe lo que realmente traes. Si no coincide, se registra la diferencia.
              </p>
              <input
                inputMode="decimal"
                value={declarado}
                onChange={e => setDeclarado(e.target.value)}
                placeholder={String(resumen.totalEfectivo)}
                className="w-full px-4 py-3 text-xl font-semibold rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 tabular-nums"
                style={inputStyle}
              />
            </div>

            {declarado.trim() !== '' && diferencia !== 0 && (
              <div className="rounded-xl px-4 py-3 text-sm"
                   style={{ backgroundColor: 'var(--gold-pale)', color: 'var(--gold)' }}>
                {diferencia < 0
                  ? <>Faltan <strong>{formatCurrency(Math.abs(diferencia))}</strong> respecto a lo registrado.</>
                  : <>Sobran <strong>{formatCurrency(diferencia)}</strong> respecto a lo registrado.</>}
                {' '}Puedes cerrar así; explícalo en la nota.
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Nota (opcional)
              </label>
              <textarea
                value={nota}
                onChange={e => setNota(e.target.value)}
                rows={2}
                placeholder="Ej. el cliente K102 completa mañana"
                className="w-full px-3 py-2 text-sm rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 resize-none"
                style={inputStyle}
              />
            </div>

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-pale)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={cerrar.isPending}
              className="w-full px-4 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {cerrar.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {cerrar.isPending ? 'Cerrando…' : 'Cerrar corte y entregar'}
            </button>
          </form>

          {/* Detalle de los pagos */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
            <p className="px-5 py-3 text-xs font-semibold uppercase tracking-wide"
               style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
              {data.pagos.length} {data.pagos.length === 1 ? 'cobro' : 'cobros'} de hoy
            </p>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {data.pagos.map(p => (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {p.contract.client.firstName} {p.contract.client.lastName}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {p.contract.project.code} · {p.contract.codigoLegado ?? p.contract.contractNumber} · {METODO[p.paymentMethod]}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0"
                        style={{ color: p.paymentMethod === 'CASH' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                    {formatCurrency(p.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
