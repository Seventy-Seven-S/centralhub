'use client';

import { useQuery } from '@tanstack/react-query';
import { Receipt, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ContratoResumen {
  id:             string;
  codigoLegado:   string | null;
  contractNumber: string;
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

interface PagoConContrato extends Pago {
  contratoLabel: string;
}

const PAYMENT_TYPE: Record<string, string> = {
  DOWN_PAYMENT:        'Enganche',
  INSTALLMENT:         'Mensualidad',
  EXTRA_PAYMENT:       'Abono',
  RESERVATION_DEPOSIT: 'Apartado',
};

// ── Data: todos los pagos del cliente, agregados de sus contratos ─────────────

async function fetchMisPagos(): Promise<PagoConContrato[]> {
  const { data } = await api.get('/portal/contratos');
  const contratos: ContratoResumen[] = data.data ?? [];

  const porContrato = await Promise.all(
    contratos.map(async (c) => {
      const res = await api.get(`/portal/contratos/${c.id}/pagos`);
      const pagos: Pago[] = res.data.data ?? [];
      return pagos.map(p => ({ ...p, contratoLabel: c.codigoLegado ?? c.contractNumber }));
    }),
  );

  return porContrato
    .flat()
    .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MisPagosPage() {
  const { data: pagos = [], isLoading, isError } = useQuery({
    queryKey: ['portal-mis-pagos'],
    queryFn:  fetchMisPagos,
  });

  const total = pagos.reduce((s, p) => s + p.amount, 0);

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-14 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-10 h-10" style={{ color: 'var(--danger)' }} />
        <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No se pudieron cargar tus pagos</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Mis pagos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {pagos.length} pagos registrados · Total {formatCurrency(total)}
          </p>
        </div>
      </div>

      {pagos.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 rounded-2xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Receipt className="w-8 h-8" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Aún no tienes pagos registrados</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Fecha', 'Contrato', 'Tipo', 'Concepto', 'Monto'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-5 py-3 text-xs font-semibold uppercase tracking-wide ${i === 4 ? 'text-right' : 'text-left'}`}
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagos.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-5 py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                      {new Date(p.paymentDate).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{p.contratoLabel}</td>
                    <td className="px-5 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{PAYMENT_TYPE[p.paymentType] ?? p.paymentType}</td>
                    <td className="px-5 py-3 max-w-[280px] truncate" style={{ color: 'var(--text-secondary)' }}>{p.concept}</td>
                    <td className="px-5 py-3 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{formatCurrency(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
