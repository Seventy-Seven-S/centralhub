import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface CambioContrato {
  id: string;
  campo: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
  motivo: string;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string };
}

export function useCambiosContrato(contratoId: string) {
  return useQuery<CambioContrato[]>({
    queryKey: ['contratos', contratoId, 'cambios'],
    queryFn: async () => (await api.get(`/contracts/${contratoId}/cambios`)).data.data ?? [],
    enabled: !!contratoId,
  });
}
