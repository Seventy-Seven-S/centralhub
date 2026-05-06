import { useQuery } from '@tanstack/react-query';
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
  features:           string | null;
  createdAt:          string;
  project?: { id: string; code: string; name: string };
}

async function fetchLotes(projectId: string): Promise<Lote[]> {
  const { data } = await api.get('/lots', { params: { projectId } });
  return data.data;
}

export function useLotes(projectId: string) {
  return useQuery({
    queryKey:  ['lotes', projectId],
    queryFn:   () => fetchLotes(projectId),
    enabled:   !!projectId,
    staleTime: 60_000,
  });
}
