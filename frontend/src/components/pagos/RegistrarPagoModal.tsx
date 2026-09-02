'use client';

import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Search, FileDown, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { useContratos, useCuotasByContrato, ContratoDetalle } from '@/hooks/useContratos';
import { useProjectSelection } from '@/contexts/ProjectContext';
import { ReciboContrato } from '@/components/pdf/ReciboContrato';
import { buildValidacionUrl, buildQrDataUri } from '@/components/pdf/reciboHelpers';
import { useMoneyInput } from '@/hooks/useMoneyInput';
import api from '@/lib/api';
import { formatCurrency, formatLotsLabel, todayLocalISO, normalizeForSearch } from '@/lib/utils';

type Step = 'pick' | 'form' | 'saving' | 'generating' | 'done';

const METODOS = [
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'CASH',     label: 'Efectivo' },
  { value: 'CHECK',    label: 'Cheque' },
  { value: 'CARD',     label: 'Tarjeta' },
];

export function RegistrarPagoModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { selectedProjectId } = useProjectSelection();
  const { data: contratos = [], isLoading } = useContratos(selectedProjectId ?? undefined);

  const [query, setQuery]       = useState('');
  const [contrato, setContrato] = useState<ContratoDetalle | null>(null);
  const [step, setStep]         = useState<Step>('pick');
  const { value: monto, setValue: setMonto, inputProps: montoInputProps } = useMoneyInput(0);
  const [fecha, setFecha]       = useState(todayLocalISO());
  // Efectivo por default — es el método más común, reduce errores de
  // selección (antes quedaba en Transferencia por ser el primero de la lista).
  const [metodo, setMetodo]     = useState('CASH');
  const [concepto, setConcepto] = useState('');
  const [error, setError]       = useState('');

  // Una sola idempotencyKey por intento de pago — se genera al elegir el
  // contrato y se REUTILIZA en reintentos (doble clic, retry de red) para
  // que el backend los reconozca como el mismo pago, no uno duplicado.
  // Solo se regenera al elegir un contrato de nuevo (nuevo intento real).
  const idempotencyKeyRef = useRef<string>('');

  const { data: cuotas = [] } = useCuotasByContrato(contrato?.id ?? '');
  const proximaCuota = cuotas.find(c => c.status === 'PENDIENTE');

  const resultados = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    const activos = contratos.filter(c => c.status !== 'CANCELED');
    if (!q) return activos.slice(0, 8);
    return activos.filter(c =>
      normalizeForSearch(`${c.client.firstName} ${c.client.lastName}`).includes(q) ||
      normalizeForSearch(c.codigoLegado ?? '').includes(q) ||
      normalizeForSearch(c.contractNumber).includes(q)
    ).slice(0, 8);
  }, [contratos, query]);

  function elegir(c: ContratoDetalle) {
    setContrato(c);
    setMonto(c.installmentAmount ?? 0);
    setConcepto('');
    idempotencyKeyRef.current = crypto.randomUUID();
    setStep('form');
  }

  async function generarRecibo(montoPagado: number, cuotasAfectadas: number[], qrDataUri?: string) {
    if (!contrato) return;
    const cuotaRecibo = cuotas.find(c => c.numeroCuota === cuotasAfectadas[0]) ?? proximaCuota;
    if (!cuotaRecibo) return;
    const balanceDespues = Math.max(0, (contrato.balance ?? 0) - montoPagado);
    const blob = await pdf(
      <ReciboContrato
        contrato={contrato}
        cuota={cuotaRecibo}
        pago={{ montoPagado, fechaPago: fecha, concepto: concepto.trim() || `Mensualidad #${cuotaRecibo.numeroCuota}` }}
        balanceDespues={balanceDespues}
        qrDataUri={qrDataUri}
      />
    ).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibo-${contrato.codigoLegado ?? contrato.contractNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function confirmar() {
    if (!contrato) return;
    const n = monto;
    if (!n || n <= 0) { setError('Ingresa un monto válido'); return; }
    setError('');
    setStep('saving');
    try {
      const { data } = await api.post('/payments', {
        contractId: contrato.id,
        amount: n,
        paymentDate: fecha,
        paymentMethod: metodo,
        concept: concepto.trim() || undefined,
        idempotencyKey: idempotencyKeyRef.current,
      });
      const cuotasAfectadas: number[] = data?.data?.cuotasAfectadas ?? [];
      const reciboId: string | null = data?.data?.reciboId ?? null;
      setStep('generating');
      try {
        const qrDataUri = reciboId ? await buildQrDataUri(buildValidacionUrl(reciboId)) : undefined;
        await generarRecibo(n, cuotasAfectadas, qrDataUri);
      } catch (e) { console.error('PDF error:', e); }
      qc.invalidateQueries({ queryKey: ['contratos'] });
      qc.invalidateQueries({ queryKey: ['cuotas'] });
      qc.invalidateQueries({ queryKey: ['pagos'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setStep('done');
      setTimeout(onClose, 1200);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Error al registrar el pago');
      setStep('form');
    }
  }

  const busy = step === 'saving' || step === 'generating';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="rounded-2xl shadow-xl w-full max-w-lg" style={{ backgroundColor: 'var(--surface)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            {step === 'form' && (
              <button onClick={() => { setContrato(null); setStep('pick'); setError(''); }} disabled={busy}
                      className="p-1 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Registrar pago</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {contrato
                  ? `${contrato.codigoLegado ?? contrato.contractNumber} · ${contrato.client.firstName} ${contrato.client.lastName}`
                  : 'Elige el contrato'}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {step === 'pick' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar por cliente o código (F096, K012…)"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl outline-none"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1">
                {isLoading && <p className="text-sm px-2 py-4" style={{ color: 'var(--text-tertiary)' }}>Cargando contratos…</p>}
                {!isLoading && resultados.length === 0 && (
                  <p className="text-sm px-2 py-4" style={{ color: 'var(--text-tertiary)' }}>Sin resultados</p>
                )}
                {resultados.map(c => (
                  <button
                    key={c.id}
                    onClick={() => elegir(c)}
                    className="w-full text-left px-3 py-2.5 rounded-xl transition-colors"
                    style={{ border: '1px solid var(--border)' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {c.codigoLegado ?? c.contractNumber} · {c.client.firstName} {c.client.lastName}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--danger)' }}>{formatCurrency(c.balance ?? 0)}</span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {c.project.name} · {formatLotsLabel(c.lots)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(step === 'form' || busy || step === 'done') && contrato && (
            <div className="space-y-4">
              {/* Resumen */}
              <div className="rounded-xl p-3 text-xs space-y-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Balance: <strong style={{ color: 'var(--danger)' }}>{formatCurrency(contrato.balance ?? 0)}</strong>
                  {contrato.installmentAmount ? <> · Mensualidad: <strong>{formatCurrency(contrato.installmentAmount)}</strong></> : null}
                </p>
                <p style={{ color: 'var(--text-tertiary)' }}>
                  {proximaCuota ? `Próxima cuota: #${proximaCuota.numeroCuota} — ${proximaCuota.mes}` : 'Sin cuotas pendientes'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Monto (MXN)</label>
                <input {...montoInputProps} disabled={busy}
                       onChange={e => { montoInputProps.onChange(e); setError(''); }}
                       placeholder="$0.00"
                       className="w-full px-3 py-2.5 text-sm rounded-xl outline-none"
                       style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Fecha</label>
                  <input type="date" value={fecha} disabled={busy} onChange={e => setFecha(e.target.value)}
                         className="w-full px-3 py-2.5 text-sm rounded-xl outline-none"
                         style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Método</label>
                  <select value={metodo} disabled={busy} onChange={e => setMetodo(e.target.value)}
                          className="w-full px-3 py-2.5 text-sm rounded-xl outline-none cursor-pointer"
                          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                    {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Concepto <span style={{ color: 'var(--text-tertiary)' }}>(opcional, aparece en el recibo)</span>
                </label>
                <input type="text" value={concepto} disabled={busy}
                       placeholder={proximaCuota ? `Mensualidad #${proximaCuota.numeroCuota} — ${proximaCuota.mes}` : 'Mensualidad'}
                       onChange={e => setConcepto(e.target.value)}
                       className="w-full px-3 py-2.5 text-sm rounded-xl outline-none"
                       style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              </div>

              {error && <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-pale)' }}>{error}</p>}
              {step === 'saving' && <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}><Loader2 className="w-4 h-4 animate-spin" /> Registrando pago…</p>}
              {step === 'generating' && <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}><FileDown className="w-4 h-4 animate-bounce" /> Generando recibo…</p>}
              {step === 'done' && <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--accent)' }}><CheckCircle2 className="w-4 h-4" /> Pago registrado y recibo descargado</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'form' || busy) && contrato && (
          <div className="px-6 py-4 flex gap-3" style={{ borderTop: '1px solid var(--border)' }}>
            <button onClick={onClose} disabled={busy}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              Cancelar
            </button>
            <button onClick={confirmar} disabled={busy}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                    style={{ backgroundColor: 'var(--accent)', color: 'white', opacity: busy ? 0.7 : 1 }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Confirmar y descargar recibo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
