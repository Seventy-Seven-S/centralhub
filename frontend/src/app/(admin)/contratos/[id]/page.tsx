'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, AlertCircle, FileText, DollarSign,
  Calendar, CheckCircle2, Clock, XCircle, FileDown,
  CreditCard, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  useContratoById, useCuotasByContrato, usePagosByContrato,
  Cuota,
} from '@/hooks/useContratos';
import { PagarCuotaModal } from '@/components/contratos/PagarCuotaModal';
import { formatCurrency, formatDate } from '@/lib/utils';

// ── Status maps ───────────────────────────────────────────────────────────────
const CONTRACT_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  ACTIVE:    { label: 'Activo',     bg: '#F0FDF4', color: '#16A34A' },
  IN_MORA:   { label: 'En mora',    bg: '#FEF2F2', color: '#DC2626' },
  DRAFT:     { label: 'Borrador',   bg: '#F9FAFB', color: '#6B7280' },
  SIGNED:    { label: 'Firmado',    bg: '#EFF6FF', color: '#2563EB' },
  COMPLETED: { label: 'Completado', bg: '#F0FDF4', color: '#16A34A' },
  CANCELED:  { label: 'Cancelado',  bg: '#FEF2F2', color: '#DC2626' },
};

const CUOTA_STATUS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  PAGADA:    { label: 'Pagada',    icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: '#16A34A' },
  PENDIENTE: { label: 'Pendiente', icon: <Clock className="w-3.5 h-3.5" />,        color: '#6B7280' },
  MORA:      { label: 'En mora',   icon: <XCircle className="w-3.5 h-3.5" />,      color: '#DC2626' },
};

const PAYMENT_TYPE: Record<string, string> = {
  ENGANCHE:        'Enganche',
  MENSUALIDAD:     'Mensualidad',
  ABONO:           'Abono',
  LIQUIDACION:     'Liquidación',
  OTRO:            'Otro',
  DOWN_PAYMENT:    'Enganche',
  INSTALLMENT:     'Mensualidad',
  PARTIAL_PAYMENT: 'Abono parcial',
  FULL_PAYMENT:    'Liquidación total',
  LATE_FEE:        'Recargo por mora',
  DISCOUNT:        'Descuento',
};

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonDetalle() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 bg-gray-200 rounded-xl" />
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="h-6 w-40 bg-gray-200 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
        </div>
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
        <div className="h-5 w-32 bg-gray-200 rounded" />
        {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl" />)}
      </div>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = CONTRACT_STATUS[status] ?? { label: status, bg: '#F9FAFB', color: '#6B7280' };
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ContratoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();

  const { data: contrato, isLoading: loadingContrato, isError: errorContrato } = useContratoById(id);
  const { data: cuotas   = [], isLoading: loadingCuotas } = useCuotasByContrato(id);
  const { data: pagos    = [], isLoading: loadingPagos }  = usePagosByContrato(id);

  const [selectedCuota, setSelectedCuota] = useState<Cuota | null>(null);
  const [showAllCuotas, setShowAllCuotas] = useState(false);

  const hoy = new Date();

  if (loadingContrato) return <SkeletonDetalle />;

  if (errorContrato || !contrato) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-gray-600 font-medium">Contrato no encontrado</p>
        <button onClick={() => router.back()} className="text-sm text-blue-600 hover:underline">
          Volver
        </button>
      </div>
    );
  }

  // Financial calculations
  const totalPrice  = contrato.totalPrice ?? 0;
  const balance     = contrato.balance ?? 0;
  const pagado      = totalPrice - balance;
  const pctPagado   = totalPrice > 0 ? Math.round((pagado / totalPrice) * 100) : 0;
  const fullName    = `${contrato.client.firstName} ${contrato.client.lastName}`;
  const lote        = contrato.lots?.[0]?.lot;
  const loteLabel   = lote ? `M${lote.manzana} L-${lote.lotNumber}` : '—';
  const extraLotes  = (contrato.lots?.length ?? 0) - 1;

  const CUOTAS_INITIAL = 12;
  const cuotasToShow   = showAllCuotas ? cuotas : cuotas.slice(0, CUOTAS_INITIAL);

  return (
    <>
      {selectedCuota && contrato && (
        <PagarCuotaModal
          cuota={selectedCuota}
          contrato={contrato}
          onClose={() => setSelectedCuota(null)}
        />
      )}

      <div className="space-y-5">

        {/* SECCIÓN 1 — Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 bg-white shadow-sm hover:bg-gray-50 transition"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900 font-mono">
                {contrato.codigoLegado ?? contrato.contractNumber}
              </h2>
              <StatusBadge status={contrato.status} />
              {contrato.moraMonthsCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">
                  <AlertCircle className="w-3 h-3" />
                  {contrato.moraMonthsCount} mes{contrato.moraMonthsCount > 1 ? 'es' : ''} en mora
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <button
                onClick={() => router.push(`/clientes/${contrato.client.id}`)}
                className="text-sm text-blue-600 hover:underline font-medium"
              >
                {fullName}
              </button>
              <span className="text-gray-300">·</span>
              <span className="text-sm text-gray-400">{contrato.project.name}</span>
              <span className="text-gray-300">·</span>
              <span className="text-sm text-gray-500">
                {loteLabel}{extraLotes > 0 && <span className="text-gray-400 ml-1">+{extraLotes}</span>}
              </span>
            </div>
          </div>

          {/* PDF placeholder */}
          <button
            onClick={() => alert('PDF en desarrollo')}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 bg-white shadow-sm text-gray-600 hover:bg-gray-50 transition"
          >
            <FileDown className="w-4 h-4" />
            Generar PDF
          </button>
        </div>

        {/* SECCIÓN 2 — Resumen financiero */}
        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gray-400" />
            Resumen Financiero
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Precio total */}
            <div className="p-4 rounded-xl bg-gray-50">
              <p className="text-xs text-gray-400 font-medium mb-1">Precio total</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(totalPrice)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Enganche: {contrato.downPayment != null ? formatCurrency(contrato.downPayment) : '—'}
              </p>
            </div>

            {/* Balance pendiente */}
            <div className={`p-4 rounded-xl ${balance > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
              <p className="text-xs text-gray-400 font-medium mb-1">Balance pendiente</p>
              <p className={`text-xl font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(balance)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Pagado: {formatCurrency(pagado)}
              </p>
            </div>

            {/* Mensualidad */}
            <div className="p-4 rounded-xl bg-gray-50">
              <p className="text-xs text-gray-400 font-medium mb-1">Mensualidad</p>
              <p className="text-xl font-bold text-gray-900">
                {contrato.installmentAmount != null ? formatCurrency(contrato.installmentAmount) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {contrato.installmentCount} meses
              </p>
            </div>
          </div>

          {/* Barra de progreso */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>{pctPagado}% pagado</span>
              <span>{formatCurrency(pagado)} de {formatCurrency(totalPrice)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className="h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${pctPagado}%`, backgroundColor: pctPagado >= 100 ? '#16A34A' : '#C9972C' }}
              />
            </div>
          </div>
        </div>

        {/* SECCIÓN 3 — Tabla de cuotas */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <h3 className="font-semibold text-gray-800">
                Plan de pagos
                {!loadingCuotas && <span className="text-gray-400 font-normal ml-1">({cuotas.length} cuotas)</span>}
              </h3>
            </div>
            {contrato.moraMonthsCount > 0 && (
              <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full">
                {contrato.moraMonthsCount} vencidas
              </span>
            )}
          </div>

          {loadingCuotas ? (
            <div className="divide-y divide-gray-50">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="px-6 py-3 animate-pulse">
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : cuotas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Calendar className="w-8 h-8 text-gray-200" />
              <p className="text-sm text-gray-400">Sin cuotas registradas</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs whitespace-nowrap">#</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs whitespace-nowrap">Mes</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs whitespace-nowrap hidden sm:table-cell">Vencimiento</th>
                      <th className="text-right px-5 py-3 font-semibold text-gray-500 text-xs whitespace-nowrap">Esperado</th>
                      <th className="text-right px-5 py-3 font-semibold text-gray-500 text-xs whitespace-nowrap hidden sm:table-cell">Pagado</th>
                      <th className="text-center px-5 py-3 font-semibold text-gray-500 text-xs whitespace-nowrap">Estado</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {cuotasToShow.map(cuota => {
                      const vencida    = cuota.status === 'PENDIENTE' && new Date(cuota.fechaVencimiento) < hoy;
                      const st         = CUOTA_STATUS[cuota.status];

                      return (
                        <tr
                          key={cuota.id}
                          className={`transition-colors ${vencida ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-gray-50/80'}`}
                        >
                          <td className="px-5 py-3 text-gray-500 font-mono text-xs">{cuota.numeroCuota}</td>
                          <td className="px-5 py-3 text-gray-700 font-medium">{cuota.mes}</td>
                          <td className="px-5 py-3 text-gray-500 whitespace-nowrap hidden sm:table-cell">
                            <span className={vencida ? 'text-red-600 font-medium' : ''}>
                              {formatDate(cuota.fechaVencimiento)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-gray-800 font-semibold whitespace-nowrap">
                            {formatCurrency(cuota.montoEsperado)}
                          </td>
                          <td className="px-5 py-3 text-right whitespace-nowrap hidden sm:table-cell">
                            {cuota.montoPagado != null
                              ? <span className="text-green-700 font-medium">{formatCurrency(cuota.montoPagado)}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className="inline-flex items-center gap-1 text-xs font-medium"
                                  style={{ color: st?.color }}>
                              {st?.icon}
                              {st?.label ?? cuota.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            {cuota.status !== 'PAGADA' && (
                              <button
                                onClick={() => setSelectedCuota(cuota)}
                                className="text-xs px-2.5 py-1 rounded-lg font-medium text-white transition-opacity hover:opacity-80"
                                style={{ backgroundColor: '#0F1F3D' }}
                              >
                                Pagar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {cuotas.length > CUOTAS_INITIAL && (
                <button
                  onClick={() => setShowAllCuotas(v => !v)}
                  className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50/80 transition flex items-center justify-center gap-1.5 border-t border-gray-100"
                >
                  {showAllCuotas ? (
                    <><ChevronUp className="w-4 h-4" /> Ver menos</>
                  ) : (
                    <><ChevronDown className="w-4 h-4" /> Ver las {cuotas.length - CUOTAS_INITIAL} cuotas restantes</>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* SECCIÓN 4 — Historial de pagos */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-gray-400" />
            <h3 className="font-semibold text-gray-800">
              Historial de pagos
              {!loadingPagos && <span className="text-gray-400 font-normal ml-1">({pagos.length})</span>}
            </h3>
          </div>

          {loadingPagos ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : pagos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <CreditCard className="w-8 h-8 text-gray-200" />
              <p className="text-sm text-gray-400">Sin pagos registrados</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {pagos.map(pago => (
                <div key={pago.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50/80 transition-colors">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                         style={{ backgroundColor: '#F0F4FF' }}>
                      <DollarSign className="w-4 h-4" style={{ color: '#0F1F3D' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{pago.concept}</p>
                      <p className="text-xs text-gray-400">
                        {PAYMENT_TYPE[pago.paymentType] ?? pago.paymentType}
                        {' · '}
                        {formatDate(pago.paymentDate)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-sm font-bold text-green-700">{formatCurrency(pago.amount)}</p>
                    {pago.balanceAfter != null && (
                      <p className="text-xs text-gray-400">Saldo: {formatCurrency(pago.balanceAfter)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECCIÓN 5 — Botón PDF (móvil) */}
        <div className="sm:hidden">
          <button
            onClick={() => alert('PDF en desarrollo')}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border border-gray-200 bg-white shadow-sm text-gray-600 hover:bg-gray-50 transition"
          >
            <FileDown className="w-4 h-4" />
            Generar estado de cuenta (PDF)
          </button>
        </div>

      </div>
    </>
  );
}
