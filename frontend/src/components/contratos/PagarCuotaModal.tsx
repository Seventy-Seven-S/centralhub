'use client';

import { useState } from 'react';
import { X, FileDown, Loader2, CheckCircle2 } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { usePayCuota, Cuota, ContratoDetalle } from '@/hooks/useContratos';
import { ReciboContrato } from '@/components/pdf/ReciboContrato';
import { formatCurrency } from '@/lib/utils';

interface Props {
  cuota:    Cuota;
  contrato: ContratoDetalle;
  onClose:  () => void;
}

type Step = 'form' | 'saving' | 'generating' | 'done';

export function PagarCuotaModal({ cuota, contrato, onClose }: Props) {
  const [monto,    setMonto]    = useState(cuota.montoEsperado > 0 ? cuota.montoEsperado.toString() : '');
  const [fecha,    setFecha]    = useState(new Date().toISOString().split('T')[0]);
  const [concepto, setConcepto] = useState(`Mensualidad #${cuota.numeroCuota} — ${cuota.mes}`);
  const [error,    setError]    = useState('');
  const [step,     setStep]     = useState<Step>('form');

  const { mutate: payCuota } = usePayCuota(contrato.id);

  async function generateAndDownload(montoPagado: number) {
    const balanceDespues = Math.max(0, (contrato.balance ?? 0) - montoPagado);
    const blob = await pdf(
      <ReciboContrato
        contrato={contrato}
        cuota={cuota}
        pago={{ montoPagado, fechaPago: fecha, concepto: concepto.trim() || `Mensualidad #${cuota.numeroCuota}` }}
        balanceDespues={balanceDespues}
      />
    ).toBlob();

    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `recibo-${contrato.codigoLegado ?? contrato.contractNumber}-cuota${cuota.numeroCuota}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleConfirm() {
    const n = parseFloat(monto);
    if (!n || n <= 0) { setError('Ingresa un monto válido'); return; }
    setError('');
    setStep('saving');

    payCuota(
      { cuotaId: cuota.id, montoPagado: n, fechaPago: fecha },
      {
        onSuccess: async () => {
          setStep('generating');
          try {
            await generateAndDownload(n);
          } catch (e) {
            console.error('PDF generation error:', e);
          }
          setStep('done');
          setTimeout(onClose, 1200);
        },
        onError: (err: any) => {
          setError(err.response?.data?.message ?? 'Error al registrar el pago');
          setStep('form');
        },
      }
    );
  }

  const busy = step === 'saving' || step === 'generating';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Registrar Pago</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Cuota #{cuota.numeroCuota} · {cuota.mes}
              {cuota.montoEsperado > 0 && ` · Esperado: ${formatCurrency(cuota.montoEsperado)}`}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Monto */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Monto pagado <span className="text-gray-400 font-normal">(MXN)</span>
            </label>
            <input
              type="number"
              value={monto}
              onChange={e => { setMonto(e.target.value); setError(''); }}
              disabled={busy}
              className="w-full px-3 py-2.5 text-sm text-gray-900 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition disabled:opacity-50 disabled:bg-gray-50"
              placeholder="0.00"
              step="0.01"
              min="0"
            />
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Fecha de pago</label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              disabled={busy}
              className="w-full px-3 py-2.5 text-sm text-gray-900 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition disabled:opacity-50 disabled:bg-gray-50"
            />
          </div>

          {/* Concepto */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Concepto <span className="text-gray-400 font-normal">(aparece en el recibo PDF)</span>
            </label>
            <input
              type="text"
              value={concepto}
              onChange={e => setConcepto(e.target.value)}
              disabled={busy}
              className="w-full px-3 py-2.5 text-sm text-gray-900 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition disabled:opacity-50 disabled:bg-gray-50"
              placeholder="Ingresa una descripción"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          {/* Status feedback */}
          {step === 'saving' && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Registrando pago…
            </div>
          )}
          {step === 'generating' && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <FileDown className="w-4 h-4 animate-bounce" />
              Generando recibo PDF…
            </div>
          )}
          {step === 'done' && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              Pago registrado y recibo descargado
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy || step === 'done'}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition disabled:opacity-60"
            style={{ backgroundColor: '#C9972C', color: '#0F1F3D' }}
          >
            {busy
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <FileDown className="w-4 h-4" />
            }
            {step === 'saving'
              ? 'Guardando…'
              : step === 'generating'
              ? 'Generando PDF…'
              : 'Confirmar y Descargar PDF'}
          </button>
        </div>

      </div>
    </div>
  );
}
