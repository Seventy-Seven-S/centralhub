'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, AlertCircle, Download } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { EstadoDeCuenta } from '@/components/pdf/EstadoDeCuenta';

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
  client: {
    firstName: string;
    lastName:  string;
    code?:     string;
  };
  folio?:       string;
  contentHash?: string;
}

interface Cuota {
  id:               string;
  contractId:       string;
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
  PAGADA:    { bg: 'var(--success-bg)', color: 'var(--success)',        label: 'Pagada' },
  PENDIENTE: { bg: 'var(--bg-tertiary)',color: 'var(--text-secondary)', label: 'Pendiente' },
  MORA:      { bg: 'var(--danger-bg)',  color: 'var(--danger)',         label: 'En mora' },
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
  DOWN_PAYMENT:        'Enganche',
  RESERVATION_DEPOSIT: 'Depósito de apartado',
  INSTALLMENT:         'Mensualidad',
  EXTRA_PAYMENT:       'Pago extra',
};

// ── Skeleton ──────────────────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-9 w-9 rounded-xl" style={{ backgroundColor: 'var(--border)' }} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-2xl" style={{ backgroundColor: 'var(--surface)' }} />)}
      </div>
      <div className="h-64 rounded-2xl" style={{ backgroundColor: 'var(--surface)' }} />
      <div className="h-48 rounded-2xl" style={{ backgroundColor: 'var(--surface)' }} />
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
      const { data } = await api.get(`/portal/contratos/${id}?generateFolio=true`);
      return data.data;
    },
    enabled: !!id,
  });

  const { data: cuotas = [], isLoading: loadingCuotas } = useQuery<Cuota[]>({
    queryKey: ['mis-cuotas', id],
    queryFn:  async () => {
      const { data } = await api.get(`/portal/contratos/${id}/cuotas`);
      return data.data;
    },
    enabled: !!id,
  });

  const { data: pagos = [], isLoading: loadingPagos } = useQuery<Pago[]>({
    queryKey: ['mis-pagos', id],
    queryFn:  async () => {
      const { data } = await api.get(`/portal/contratos/${id}/pagos`);
      return data.data;
    },
    enabled: !!id,
  });

  if (loadingContrato) return <PageSkeleton />;

  if (isError || !contrato) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertCircle className="w-10 h-10" style={{ color: 'var(--danger)' }} />
      <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No se pudo cargar el contrato</p>
    </div>
  );

  const pagado = contrato.totalPrice - (contrato.balance ?? contrato.totalPrice);
  const pct    = contrato.totalPrice > 0 ? Math.min(100, Math.round((pagado / contrato.totalPrice) * 100)) : 0;
  const lot    = contrato.lots?.[0]?.lot;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/mis-contratos')}
            className="p-2 rounded-xl border transition shrink-0"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface)'}
          >
            <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Contrato {contrato.codigoLegado ?? contrato.contractNumber}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {contrato.project.name}
              {lot && ` · M${lot.manzana} L-${lot.lotNumber} · ${lot.areaM2} m²`}
            </p>
          </div>
        </div>

        <PDFDownloadLink
          document={
            <EstadoDeCuenta
              contrato={contrato as any}
              cuotas={cuotas}
              pagos={pagos}
              folio={contrato.folio}
              contentHash={contrato.contentHash}
            />
          }
          fileName={`estado-cuenta-${contrato.contractNumber ?? id}.pdf`}
        >
          {({ loading }) => (
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--accent)',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                border: 'none',
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              <Download size={16} />
              {loading ? 'Generando...' : 'Descargar Estado de Cuenta'}
            </button>
          )}
        </PDFDownloadLink>
      </div>

      {/* Resumen financiero */}
      <div className="rounded-2xl p-5 space-y-5" style={{ backgroundColor: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Resumen financiero</h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Precio total',   value: formatCurrency(contrato.totalPrice) },
            { label: 'Enganche',       value: formatCurrency(contrato.downPayment ?? 0) },
            { label: 'Mensualidad',    value: formatCurrency(contrato.installmentAmount ?? 0) },
            { label: 'Saldo restante', value: formatCurrency(contrato.balance ?? 0), highlight: true },
          ].map(({ label, value, highlight }) => (
            <div key={label} className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
              <p className="text-base font-bold mt-1" style={{ color: highlight ? 'var(--danger)' : 'var(--text-primary)' }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Barra de progreso */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Progreso de pago</span>
            <span className="font-bold" style={{ color: pct >= 100 ? 'var(--success)' : 'var(--gold)' }}>{pct}%</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
            <div className="h-full rounded-full transition-all"
                 style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? 'var(--success)' : 'var(--gold)' }} />
          </div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {formatCurrency(pagado)} pagado de {formatCurrency(contrato.totalPrice)} · {contrato.installmentCount} mensualidades
          </p>
        </div>
      </div>

      {/* Plan de pagos — cuotas */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Plan de pagos</h2>
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{cuotas.length} cuotas</span>
        </div>

        {loadingCuotas ? (
          <div className="p-5 space-y-2 animate-pulse">
            {[...Array(5)].map((_, i) => <div key={i} className="h-10 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }} />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-tertiary)' }}>
                  <th className="text-left px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>#</th>
                  <th className="text-left px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Mes</th>
                  <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Esperado</th>
                  <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Pagado</th>
                  <th className="text-left px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Fecha pago</th>
                  <th className="text-center px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {cuotas.map(c => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
                  >
                    <td className="px-5 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.numeroCuota}</td>
                    <td className="px-5 py-3" style={{ color: 'var(--text-primary)' }}>{c.mes}</td>
                    <td className="px-5 py-3 text-right" style={{ color: 'var(--text-primary)' }}>{formatCurrency(c.montoEsperado)}</td>
                    <td className="px-5 py-3 text-right font-medium"
                        style={{ color: c.montoPagado > 0 ? 'var(--success)' : 'var(--text-tertiary)' }}>
                      {c.montoPagado > 0 ? formatCurrency(c.montoPagado) : '—'}
                    </td>
                    <td className="px-5 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
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
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Historial de pagos</h2>
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{pagos.length} pagos</span>
        </div>

        {loadingPagos ? (
          <div className="p-5 space-y-2 animate-pulse">
            {[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }} />)}
          </div>
        ) : pagos.length === 0 ? (
          <p className="text-center text-sm py-10" style={{ color: 'var(--text-tertiary)' }}>Sin pagos registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-tertiary)' }}>
                  <th className="text-left px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Folio</th>
                  <th className="text-left px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Tipo</th>
                  <th className="text-left px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Concepto</th>
                  <th className="text-left px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Fecha</th>
                  <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-secondary)' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map(p => (
                  <tr
                    key={p.id}
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
                  >
                    <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>{p.paymentNumber}</td>
                    <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{PAYMENT_TYPE[p.paymentType] ?? p.paymentType}</td>
                    <td className="px-5 py-3 max-w-[200px] truncate" style={{ color: 'var(--text-secondary)' }}>{p.concept}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(p.paymentDate).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold" style={{ color: 'var(--success)' }}>
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
