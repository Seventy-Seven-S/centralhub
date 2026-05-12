'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail, Phone, User, FileText, AlertCircle, ExternalLink } from 'lucide-react';
import { useClienteById, useContratosByCliente } from '@/hooks/useClientes';
import { formatCurrency } from '@/lib/utils';

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  ACTIVE:    { label: 'Activo',      bg: 'var(--accent-pale)',  color: 'var(--accent)' },
  IN_MORA:   { label: 'En mora',     bg: 'var(--danger-pale)',  color: 'var(--danger)' },
  DRAFT:     { label: 'Borrador',    bg: 'var(--bg-tertiary)',  color: 'var(--text-secondary)' },
  SIGNED:    { label: 'Firmado',     bg: 'var(--accent-pale)',  color: 'var(--accent)' },
  COMPLETED: { label: 'Completado',  bg: 'var(--accent-pale)',  color: 'var(--accent)' },
  CANCELED:  { label: 'Cancelado',   bg: 'var(--danger-pale)',  color: 'var(--danger)' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, bg: 'var(--bg-tertiary)', color: 'var(--text-secondary)' };
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function SkeletonDetalle() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
      <div className="rounded-2xl p-6 shadow-sm space-y-4" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="h-6 w-40 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />)}
        </div>
      </div>
      <div className="rounded-2xl p-6 shadow-sm space-y-3" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="h-5 w-32 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />)}
      </div>
    </div>
  );
}

export default function ClienteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();

  const { data: cliente, isLoading: loadingCliente, isError: errorCliente } = useClienteById(id);
  const { data: contratos = [], isLoading: loadingContratos } = useContratosByCliente(id);

  if (loadingCliente || loadingContratos) return <SkeletonDetalle />;

  if (errorCliente || !cliente) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Cliente no encontrado</p>
        <button onClick={() => router.back()}
                className="text-sm text-blue-600 hover:underline">
          Volver
        </button>
      </div>
    );
  }

  const fullName = `${cliente.firstName ?? ''} ${cliente.lastName ?? ''}`.trim();
  const initials = `${cliente.firstName?.[0] ?? ''}${cliente.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <div className="space-y-5">

      {/* Back + título */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-9 h-9 rounded-xl shadow-sm transition"
          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}
        >
          <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{fullName}</h2>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{cliente.globalCode}</p>
        </div>
      </div>

      {/* Card de datos del cliente */}
      <div className="rounded-2xl p-6 shadow-sm" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
               style={{ backgroundColor: 'var(--accent)' }}>
            {initials}
          </div>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{fullName}</h3>
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1"
              style={{
                backgroundColor: cliente.status === 'ACTIVE' ? 'var(--accent-pale)' : 'var(--bg-tertiary)',
                color: cliente.status === 'ACTIVE' ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {cliente.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <Mail className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            <div className="min-w-0">
              <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Email</p>
              <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{cliente.email || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <Phone className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Teléfono</p>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{cliente.phone || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <User className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Código</p>
              <p className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{cliente.globalCode}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Contratos del cliente */}
      <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <FileText className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Contratos ({contratos.length})
          </h3>
        </div>

        {contratos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <FileText className="w-8 h-8" style={{ color: 'var(--bg-tertiary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Sin contratos registrados</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {contratos.map(contrato => {
              const lote = contrato.lots?.[0]?.lot;
              const loteLabel = lote
                ? `M${lote.manzana} L-${lote.lotNumber}`
                : '—';
              const extraLotes = (contrato.lots?.length ?? 0) - 1;

              return (
                <div
                  key={contrato.id}
                  onClick={() => router.push(`/contratos/${contrato.id}`)}
                  className="flex items-center justify-between px-6 py-4 cursor-pointer transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Código */}
                    <div className="flex-shrink-0 text-center">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Código</p>
                      <p className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                        {contrato.codigoLegado ?? contrato.contractNumber}
                      </p>
                    </div>
                    {/* Separador */}
                    <div className="w-px h-8 flex-shrink-0" style={{ backgroundColor: 'var(--border)' }} />
                    {/* Lote */}
                    <div className="flex-shrink-0">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Lote</p>
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        {loteLabel}
                        {extraLotes > 0 && (
                          <span className="ml-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>+{extraLotes}</span>
                        )}
                      </p>
                    </div>
                    {/* Separador */}
                    <div className="w-px h-8 flex-shrink-0" style={{ backgroundColor: 'var(--border)' }} />
                    {/* Precio */}
                    <div className="min-w-0">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Precio total</p>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {formatCurrency(contrato.totalPrice)}
                      </p>
                    </div>
                    {/* Balance */}
                    <div className="hidden sm:block min-w-0">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Balance</p>
                      <p className={`text-sm font-semibold ${contrato.moraMonthsCount > 0 ? 'text-red-600' : ''}`}
                         style={contrato.moraMonthsCount === 0 ? { color: 'var(--text-primary)' } : undefined}>
                        {contrato.balance != null ? formatCurrency(contrato.balance) : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <StatusBadge status={contrato.status} />
                    <ExternalLink className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
