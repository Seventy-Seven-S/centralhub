import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface Cuota {
  id:               string;
  numeroCuota:      number;
  mes:              string;
  montoEsperado:    number;
  montoPagado:      number;
  fechaVencimiento: string;
  fechaPago:        string | null;
  status:           'PENDIENTE' | 'PAGADA' | 'MORA';
  contract: {
    id:           string;
    codigoLegado: string | null;
    client: { id: string; firstName: string; lastName: string };
    project: { id: string; code: string; name: string };
  };
}

async function fetchCuotas(projectId: string, status?: string): Promise<Cuota[]> {
  const params: Record<string, string> = { projectId };
  if (status) params.status = status;
  const { data } = await api.get('/cuotas', { params });
  return data.data;
}

export function useCuotas(projectId: string, status?: string) {
  return useQuery<Cuota[]>({
    queryKey: ['cuotas', projectId, status ?? 'all'],
    queryFn:  () => fetchCuotas(projectId, status),
    staleTime: 60_000,
    enabled: !!projectId,
  });
}
