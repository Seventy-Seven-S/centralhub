import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ── Interfaces ────────────────────────────────────────────────────────────────

export type CommissionStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELED';

export interface Commission {
  id:               string;
  contractId:       string;
  agentId:          string;
  commissionType:   string;
  percentage:       number | null;
  fixedAmount:      number | null;
  baseAmount:       number;
  commissionAmount: number;
  status:           CommissionStatus;
  paymentDate:      string | null;
  createdAt:        string;
  contract:         { id: string; contractNumber: string } | null;
  agent:            { id: string; firstName: string; lastName: string } | null;
}

export interface CommissionFilters {
  status?:  CommissionStatus;
  agentId?: string;
}

// ── Fetch functions ───────────────────────────────────────────────────────────

async function fetchCommissions(filters?: CommissionFilters): Promise<Commission[]> {
  const params: Record<string, string> = {};
  if (filters?.status)  params.status  = filters.status;
  if (filters?.agentId) params.agentId = filters.agentId;
  const { data } = await api.get('/commissions', { params });
  return data.data;
}

// ── Query hooks ───────────────────────────────────────────────────────────────

export function useComisiones(filters?: CommissionFilters) {
  return useQuery<Commission[]>({
    queryKey: ['commissions', filters],
    queryFn:  () => fetchCommissions(filters),
    staleTime: 30_000,
  });
}

// ── Mutation hooks ────────────────────────────────────────────────────────────

export function usePagarComision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/commissions/${id}/pay`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commissions'] });
    },
  });
}
