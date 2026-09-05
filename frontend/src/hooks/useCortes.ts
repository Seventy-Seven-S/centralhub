import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface PagoCorte {
  id: string;
  paymentNumber: string;
  paymentType: string;
  paymentMethod: string;
  amount: number;
  paymentDate: string;
  concept: string;
  contract: {
    id: string; projectId: string; codigoLegado: string | null; contractNumber: string;
    client: { firstName: string; lastName: string };
  };
}

export interface Corte {
  id: string;
  projectId: string;
  numero: number;
  fecha: string;
  periodoInicio: string | null;
  periodoFin: string | null;
  totalIngresos: number;
  totalEgresos: number;
  entregadoDueno: number;
  dueno: string;
  notas: string | null;
  createdAt: string;
  project?: { code: string; name: string };
  _count?: { payments: number };
}

export interface CorteDetalle extends Corte {
  payments: PagoCorte[];
  expenses: Array<{ id: string; amount: string | number; description: string | null; category: { name: string } }>;
  createdBy?: { firstName: string; lastName: string };
}

export function usePendientesCorte(projectId?: string) {
  return useQuery<{ pagos: PagoCorte[]; total: number }>({
    queryKey: ['cortes', 'pendientes', projectId],
    queryFn: async () => (await api.get('/cortes/pendientes', { params: { projectId } })).data.data,
    enabled: !!projectId,
  });
}

export function useCortes(projectId?: string) {
  return useQuery<Corte[]>({
    queryKey: ['cortes', 'list', projectId ?? 'all'],
    queryFn: async () => (await api.get('/cortes', { params: projectId ? { projectId } : {} })).data.data,
  });
}

export async function fetchCorte(id: string): Promise<CorteDetalle> {
  return (await api.get(`/cortes/${id}`)).data.data;
}
