'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/api';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface ContratoDetalle {
  id:               string;
  codigoLegado:     string | null;
  contractNumber:   string;
  status:           string;
  totalPrice:       number;
  downPayment:      number | null;
  financingAmount:  number | null;
  balance:          number | null;
  installmentAmount: number | null;
  installmentCount:  number;
  moraMonthsCount:   number;
  contractDate:     string | null;
  project: { name: string; code: string };
  lots: Array<{ lot: { lotNumber: string; manzana: number; areaM2: number } }>;
}

interface Cuota {
  id:               string;
  numeroCuota:      number;
  mes:              string;
  montoEsperado:    number;
  montoPagado:      number;
  fechaVencimiento: string;
  fechaPago:        string | null;
  status:           'PENDIENTE' | 'PAGADA' | 'MORA';
}

interface Pago {
  id:            string;
  paymentNumber: string;
  paymentType:   string;
  amount:        number;
  paymentDate:   string;
  concept:       string;
  status:        string;
}

// ── Status badge ──────────────────────────────────────────────────────────────
const CUOTA_STATUS: Record<string, { bg: string; color: string; label: string }> = {
  PAGADA:    { bg: '#F0F9F4', color: '#166534', label: 'Pagada' },
  PENDIENTE: { bg: '#F3F4F6', color: '#374151', label: 'Pendiente' },
  MORA:      { bg: '#FFF7ED', color: '#9A3412', label: 'En mora' },
};

function CuotaBadge({ status }: { status: string }) {
  const s = CUOTA_STATUS[status] ?? CUOTA_STATUS.PENDIENTE;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

const PAYMENT_TYPE: Record<string, string> = {
  DOWN_PAYMENT:  'Enganche',
  INSTALLMENT:   'Mensualidad',
  EXTRA_PAYMENT: 'Pago extra',
};

// ── Skeleton ──────────────────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-9 w-9 bg-gray-200 rounded-xl" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-white rounded-2xl" />)}
      </div>
      <div className="h-64 bg-white rounded-2xl" />
      <div className="h-48 bg-white rounded-2xl" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MiContratoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();

  const { data: contrato, isLoading: loadingContrato, isError } = useQuery<ContratoDetalle>({
    queryKey: ['mi-contrato', id],
    queryFn:  async () => {
      const { data } = await api.get(`/contracts/${id}`);
      return data.data;
    },
    enabled: !!id,
  });

  const { data: cuotas = [], isLoading: loadingCuotas } = useQuery<Cuota[]>({
    queryKey: ['mis-cuotas', id],
    queryFn:  async () => {
      const { data } = await api.get(`/contracts/${id}/cuotas`);
      return data.data;
    },
    enabled: !!id,
  });

  const { data: pagos = [], isLoading: loadingPagos } = useQuery<Pago[]>({
    queryKey: ['mis-pagos', id],
    queryFn:  async () => {
      const { data } = await api.get('/payments', { params: { contractId: id } });
      return data.data;
    },
    enabled: !!id,
  });

  if (loadingContrato) return <PageSkeleton />;

  if (isError || !contrato) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertCircle className="w-10 h-10 text-red-400" />
      <p className="text-gray-600 font-medium">No se pudo cargar el contrato</p>
    </div>
  );

  const pagado = contrato.totalPrice - (contrato.balance ?? contrato.totalPrice);
  const pct    = contrato.totalPrice > 0 ? Math.min(100, Math.round((pagado / contrato.totalPrice) * 100)) : 0;
  const lot    = contrato.lots?.[0]?.lot;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/mis-contratos')}
          className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Contrato {contrato.codigoLegado ?? contrato.contractNumber}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {contrato.project.name}
            {lot && ` · M${lot.manzana} L-${lot.lotNumber} · ${lot.areaM2} m²`}
          </p>
        </div>
      </div>

      {/* Resumen financiero */}
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-5">
        <h2 className="font-semibold text-gray-900">Resumen financiero</h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Precio total',  value: formatCurrency(contrato.totalPrice) },
            { label: 'Enganche',      value: formatCurrency(contrato.downPayment ?? 0) },
            { label: 'Mensualidad',   value: formatCurrency(contrato.installmentAmount ?? 0) },
            { label: 'Saldo restante', value: formatCurrency(contrato.balance ?? 0), highlight: true },
          ].map(({ label, value, highlight }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-base font-bold mt-1" style={{ color: highlight ? '#9A3412' : '#111827' }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Barra de progreso */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Progreso de pago</span>
            <span className="font-bold" style={{ color: pct >= 100 ? '#16a34a' : '#C9972C' }}>{pct}%</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all"
                 style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#16a34a' : '#C9972C' }} />
          </div>
          <p className="text-xs text-gray-400">
            {formatCurrency(pagado)} pagado de {formatCurrency(contrato.totalPrice)} · {contrato.installmentCount} mensualidades
          </p>
        </div>
      </div>

      {/* Plan de pagos — cuotas */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Plan de pagos</h2>
          <span className="text-sm text-gray-400">{cuotas.length} cuotas</span>
        </div>

        {loadingCuotas ? (
          <div className="p-5 space-y-2 animate-pulse">
            {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">#</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Mes</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600">Esperado</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600">Pagado</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Fecha pago</th>
                  <th className="text-center px-5 py-3 font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cuotas.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-gray-500 text-xs">{c.numeroCuota}</td>
                    <td className="px-5 py-3 text-gray-700">{c.mes}</td>
                    <td className="px-5 py-3 text-right text-gray-700">{formatCurrency(c.montoEsperado)}</td>
                    <td className="px-5 py-3 text-right font-medium"
                        style={{ color: c.montoPagado > 0 ? '#166534' : '#9CA3AF' }}>
                      {c.montoPagado > 0 ? formatCurrency(c.montoPagado) : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {c.fechaPago
                        ? new Date(c.fechaPago).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <CuotaBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historial de pagos */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Historial de pagos</h2>
          <span className="text-sm text-gray-400">{pagos.length} pagos</span>
        </div>

        {loadingPagos ? (
          <div className="p-5 space-y-2 animate-pulse">
            {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
          </div>
        ) : pagos.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-10">Sin pagos registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Folio</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Tipo</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Concepto</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Fecha</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagos.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{p.paymentNumber}</td>
                    <td className="px-5 py-3 text-gray-600">{PAYMENT_TYPE[p.paymentType] ?? p.paymentType}</td>
                    <td className="px-5 py-3 text-gray-600 max-w-[200px] truncate">{p.concept}</td>
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {new Date(p.paymentDate).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold" style={{ color: '#166534' }}>
                      {formatCurrency(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
