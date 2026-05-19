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
import { PDFDownloadLink } from '@react-pdf/renderer';
import { ContratoCompraventa } from '@/components/pdf/ContratoCompraventa';

// ── Status maps ───────────────────────────────────────────────────────────────
const CONTRACT_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  ACTIVE:    { label: 'Activo',     bg: 'var(--accent-pale)',  color: 'var(--accent)' },
  IN_MORA:   { label: 'En mora',    bg: 'var(--danger-pale)',  color: 'var(--danger)' },
  DRAFT:     { label: 'Borrador',   bg: 'var(--bg-tertiary)',  color: 'var(--text-secondary)' },
  SIGNED:    { label: 'Firmado',    bg: 'var(--accent-pale)',  color: 'var(--accent)' },
  COMPLETED: { label: 'Completado', bg: 'var(--accent-pale)',  color: 'var(--accent)' },
  CANCELED:  { label: 'Cancelado',  bg: 'var(--danger-pale)',  color: 'var(--danger)' },
};

const CUOTA_STATUS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  PAGADA:    { label: 'Pagada',    icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'var(--accent)' },
  PENDIENTE: { label: 'Pendiente', icon: <Clock className="w-3.5 h-3.5" />,        color: 'var(--text-secondary)' },
  MORA:      { label: 'En mora',   icon: <XCircle className="w-3.5 h-3.5" />,      color: 'var(--danger)' },
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
      <div className="h-8 w-48 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
      <div className="rounded-2xl p-6 shadow-sm space-y-4" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="h-6 w-40 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />)}
        </div>
      </div>
      <div className="rounded-2xl p-6 shadow-sm space-y-3" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="h-5 w-32 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        {[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />)}
      </div>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = CONTRACT_STATUS[status] ?? { label: status, bg: 'var(--bg-tertiary)', color: 'var(--text-secondary)' };
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
        <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Contrato no encontrado</p>
        <button onClick={() => router.back()} className="text-sm text-blue-600 hover:underline">
          Volver
        </button>
      </div>
    );
  }

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
            className="flex items-center justify-center w-9 h-9 rounded-xl shadow-sm transition"
            style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}
          >
            <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                {contrato.codigoLegado ?? contrato.contractNumber}
              </h2>
              <StatusBadge status={contrato.status} />
              {contrato.moraMonthsCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: 'var(--danger-pale)', color: 'var(--danger)' }}>
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
              <span style={{ color: 'var(--border)' }}>·</span>
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{contrato.project.name}</span>
              <span style={{ color: 'var(--border)' }}>·</span>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {loteLabel}{extraLotes > 0 && <span className="ml-1" style={{ color: 'var(--text-tertiary)' }}>+{extraLotes}</span>}
              </span>
            </div>
          </div>

          {/* PDF Contrato */}
          <PDFDownloadLink
            document={
              <ContratoCompraventa
                contrato={contrato as any}
                cuotas={cuotas}
              />
            }
            fileName={`contrato-${contrato.codigoLegado ?? contrato.contractNumber}.pdf`}
          >
            {({ loading }) => (
              <button
                className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'white',
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                <FileDown size={16} />
                {loading ? 'Generando...' : 'Descargar Contrato PDF'}
              </button>
            )}
          </PDFDownloadLink>
        </div>

        {/* SECCIÓN 2 — Resumen financiero */}
        <div className="rounded-2xl p-6 shadow-sm space-y-5" style={{ backgroundColor: 'var(--surface)' }}>
          <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <DollarSign className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            Resumen Financiero
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Precio total */}
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Precio total</p>
              <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalPrice)}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Enganche: {contrato.downPayment != null ? formatCurrency(contrato.downPayment) : '—'}
              </p>
            </div>

            {/* Balance pendiente */}
            <div className="p-4 rounded-xl"
                 style={{ backgroundColor: balance > 0 ? 'var(--danger-pale)' : 'var(--accent-pale)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Balance pendiente</p>
              <p className="text-xl font-bold" style={{ color: balance > 0 ? 'var(--danger)' : 'var(--accent)' }}>
                {formatCurrency(balance)}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Pagado: {formatCurrency(pagado)}
              </p>
            </div>

            {/* Mensualidad */}
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Mensualidad</p>
              <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {contrato.installmentAmount != null ? formatCurrency(contrato.installmentAmount) : '—'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {contrato.installmentCount} meses
              </p>
            </div>
          </div>

          {/* Barra de progreso */}
          <div>
            <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              <span>{pctPagado}% pagado</span>
              <span>{formatCurrency(pagado)} de {formatCurrency(totalPrice)}</span>
            </div>
            <div className="w-full rounded-full h-2.5" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <div
                className="h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${pctPagado}%`, backgroundColor: pctPagado >= 100 ? 'var(--accent)' : 'var(--gold)' }}
              />
            </div>
          </div>
        </div>

        {/* SECCIÓN 3 — Tabla de cuotas */}
        <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Plan de pagos
                {!loadingCuotas && (
                  <span className="font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>({cuotas.length} cuotas)</span>
                )}
              </h3>
            </div>
            {contrato.moraMonthsCount > 0 && (
              <span className="text-xs font-medium px-2 py-1 rounded-full"
                    style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-pale)' }}>
                {contrato.moraMonthsCount} vencidas
              </span>
            )}
          </div>

          {loadingCuotas ? (
            <div>
              {[...Array(6)].map((_, i) => (
                <div key={i} className="px-6 py-3 animate-pulse">
                  <div className="h-4 rounded w-3/4" style={{ backgroundColor: 'var(--bg-secondary)' }} />
                </div>
              ))}
            </div>
          ) : cuotas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Calendar className="w-8 h-8" style={{ color: 'var(--bg-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Sin cuotas registradas</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                      <th className="text-left px-5 py-3 font-semibold text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>#</th>
                      <th className="text-left px-5 py-3 font-semibold text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Mes</th>
                      <th className="text-left px-5 py-3 font-semibold text-xs whitespace-nowrap hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>Vencimiento</th>
                      <th className="text-right px-5 py-3 font-semibold text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Esperado</th>
                      <th className="text-right px-5 py-3 font-semibold text-xs whitespace-nowrap hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>Pagado</th>
                      <th className="text-center px-5 py-3 font-semibold text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Estado</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {cuotasToShow.map(cuota => {
                      const vencida = cuota.status === 'PENDIENTE' && new Date(cuota.fechaVencimiento) < hoy;
                      const st      = CUOTA_STATUS[cuota.status];

                      return (
                        <tr
                          key={cuota.id}
                          className="transition-colors"
                          style={{
                            borderBottom: '1px solid var(--border)',
                            backgroundColor: vencida ? 'rgba(var(--danger-rgb, 192,80,80), 0.05)' : undefined,
                          }}
                        >
                          <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{cuota.numeroCuota}</td>
                          <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{cuota.mes}</td>
                          <td className="px-5 py-3 whitespace-nowrap hidden sm:table-cell">
                            <span style={{ color: vencida ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: vencida ? 600 : undefined }}>
                              {formatDate(cuota.fechaVencimiento)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                            {formatCurrency(cuota.montoEsperado)}
                          </td>
                          <td className="px-5 py-3 text-right whitespace-nowrap hidden sm:table-cell">
                            {cuota.montoPagado != null
                              ? <span className="font-medium" style={{ color: 'var(--accent)' }}>{formatCurrency(cuota.montoPagado)}</span>
                              : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
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
                                style={{ backgroundColor: 'var(--accent)' }}
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
                  className="w-full py-3 text-sm flex items-center justify-center gap-1.5 transition"
                  style={{ borderTop: '1px solid var(--border)', color: 'var(--text-secondary)' }}
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
        <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
          <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <CreditCard className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              Historial de pagos
              {!loadingPagos && (
                <span className="font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>({pagos.length})</span>
              )}
            </h3>
          </div>

          {loadingPagos ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-secondary)' }} />
              ))}
            </div>
          ) : pagos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <CreditCard className="w-8 h-8" style={{ color: 'var(--bg-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Sin pagos registrados</p>
            </div>
          ) : (
            <div>
              {pagos.map(pago => (
                <div key={pago.id} className="flex items-center justify-between px-6 py-3.5 transition-colors hover:bg-[var(--bg-secondary)]"
                     style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                         style={{ backgroundColor: 'var(--accent-pale)' }}>
                      <DollarSign className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{pago.concept}</p>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {PAYMENT_TYPE[pago.paymentType] ?? pago.paymentType}
                        {' · '}
                        {formatDate(pago.paymentDate)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-sm font-bold" style={{ color: 'var(--accent)' }}>{formatCurrency(pago.amount)}</p>
                    {pago.balanceAfter != null && (
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Saldo: {formatCurrency(pago.balanceAfter)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECCIÓN 5 — Botón PDF (móvil) */}
        <div className="sm:hidden">
          <PDFDownloadLink
            document={
              <ContratoCompraventa
                contrato={contrato as any}
                cuotas={cuotas}
              />
            }
            fileName={`contrato-${contrato.codigoLegado ?? contrato.contractNumber}.pdf`}
          >
            {({ loading }) => (
              <button
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'white',
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                <FileDown size={16} />
                {loading ? 'Generando...' : 'Descargar Contrato PDF'}
              </button>
            )}
          </PDFDownloadLink>
        </div>

      </div>
    </>
  );
}
