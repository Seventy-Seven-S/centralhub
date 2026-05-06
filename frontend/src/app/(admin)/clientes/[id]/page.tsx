'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail, Phone, User, FileText, AlertCircle, ExternalLink } from 'lucide-react';
import { useClienteById, useContratosByCliente } from '@/hooks/useClientes';
import { formatCurrency } from '@/lib/utils';

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  ACTIVE:    { label: 'Activo',      bg: '#F0FDF4', color: '#16A34A' },
  IN_MORA:   { label: 'En mora',     bg: '#FEF2F2', color: '#DC2626' },
  DRAFT:     { label: 'Borrador',    bg: '#F9FAFB', color: '#6B7280' },
  SIGNED:    { label: 'Firmado',     bg: '#EFF6FF', color: '#2563EB' },
  COMPLETED: { label: 'Completado',  bg: '#F0FDF4', color: '#16A34A' },
  CANCELED:  { label: 'Cancelado',   bg: '#FEF2F2', color: '#DC2626' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, bg: '#F9FAFB', color: '#6B7280' };
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
      <div className="h-8 w-48 bg-gray-200 rounded-xl" />
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="h-6 w-40 bg-gray-200 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
        </div>
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
        <div className="h-5 w-32 bg-gray-200 rounded" />
        {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
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
        <p className="text-gray-600 font-medium">Cliente no encontrado</p>
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
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 bg-white shadow-sm hover:bg-gray-50 transition"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">{fullName}</h2>
          <p className="text-sm text-gray-400">{cliente.globalCode}</p>
        </div>
      </div>

      {/* Card de datos del cliente */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
               style={{ backgroundColor: '#0F1F3D' }}>
            {initials}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{fullName}</h3>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
              cliente.status === 'ACTIVE'
                ? 'bg-green-50 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}>
              {cliente.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-gray-50">
            <Mail className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-400 font-medium">Email</p>
              <p className="text-sm text-gray-800 truncate">{cliente.email || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl bg-gray-50">
            <Phone className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400 font-medium">Teléfono</p>
              <p className="text-sm text-gray-800">{cliente.phone || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl bg-gray-50">
            <User className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400 font-medium">Código</p>
              <p className="text-sm text-gray-800 font-mono">{cliente.globalCode}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Contratos del cliente */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" />
          <h3 className="font-semibold text-gray-800">
            Contratos ({contratos.length})
          </h3>
        </div>

        {contratos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <FileText className="w-8 h-8 text-gray-200" />
            <p className="text-sm text-gray-400">Sin contratos registrados</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
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
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50/80 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Código */}
                    <div className="flex-shrink-0 text-center">
                      <p className="text-xs text-gray-400 font-medium">Código</p>
                      <p className="text-sm font-bold text-gray-900 font-mono">
                        {contrato.codigoLegado ?? contrato.contractNumber}
                      </p>
                    </div>
                    {/* Separador */}
                    <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
                    {/* Lote */}
                    <div className="flex-shrink-0">
                      <p className="text-xs text-gray-400 font-medium">Lote</p>
                      <p className="text-sm text-gray-800">
                        {loteLabel}
                        {extraLotes > 0 && (
                          <span className="ml-1 text-xs text-gray-400">+{extraLotes}</span>
                        )}
                      </p>
                    </div>
                    {/* Separador */}
                    <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
                    {/* Precio */}
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400 font-medium">Precio total</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatCurrency(contrato.totalPrice)}
                      </p>
                    </div>
                    {/* Balance */}
                    <div className="hidden sm:block min-w-0">
                      <p className="text-xs text-gray-400 font-medium">Balance</p>
                      <p className={`text-sm font-semibold ${contrato.moraMonthsCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {contrato.balance != null ? formatCurrency(contrato.balance) : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <StatusBadge status={contrato.status} />
                    <ExternalLink className="w-4 h-4 text-gray-300" />
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
