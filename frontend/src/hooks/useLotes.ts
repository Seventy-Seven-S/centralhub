import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface Lote {
  id:                 string;
  projectId:          string;
  manzana:            number;
  lotNumber:          string;
  areaM2:             number;
  orientation:        string | null;
  basePrice:          number;
  currentPrice:       number;
  status:             'AVAILABLE' | 'SOLD' | 'RESERVED' | 'UNAVAILABLE';
  reservedAt:         string | null;
  reservationExpiry:  string | null;
  reservationDeposit: number | null;
  reservedByName:     string | null;
  reservedByPhone:    string | null;
  reservedByEmail:    string | null;
  reservedByAgentId:  string | null;
  features:           string | null;
  createdAt:          string;
  project?: { id: string; code: string; name: string };
  hasIne?: boolean;
  ineDocument?: { id: string; fileName: string; mimeType: string | null } | null;
}

async function fetchLotes(projectId: string): Promise<Lote[]> {
  const { data } = await api.get('/lots', { params: { projectId } });
  return data.data;
}

export function useLotes(projectId?: string) {
  return useQuery({
    queryKey:  ['lotes', projectId ?? 'none'],
    queryFn:   () => fetchLotes(projectId as string),
    enabled:   !!projectId,
    staleTime: 60_000,
  });
}

// Campos editables del lote desde la UI (el equipo del cliente corrige
// medidas y precios directamente en producción durante el piloto).
export interface UpdateLoteInput {
  areaM2?:       number;
  basePrice?:    number;
  currentPrice?: number;
}

export function useUpdateLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lotId, data }: { lotId: string; data: UpdateLoteInput }) => {
      const res = await api.put(`/lots/${lotId}`, data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lotes'] });
    },
  });
}
