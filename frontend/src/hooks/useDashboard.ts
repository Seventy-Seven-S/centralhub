import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DashboardSummary } from '@/types/dashboard.types';

async function fetchSummary(projectId?: string): Promise<DashboardSummary> {
  const { data } = await api.get('/dashboard/summary', { params: { projectId } });
  return data.data;
}

async function fetchMora(projectId?: string): Promise<any[]> {
  const { data } = await api.get('/dashboard/mora', { params: { projectId } });
  return data.data;
}

export function useDashboardSummary(projectId?: string, enabled = true) {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary', projectId ?? 'all'],
    queryFn:  () => fetchSummary(projectId),
    staleTime: 60_000,
    enabled,
  });
}

export function useMoraDetail(projectId?: string, enabled = true) {
  return useQuery<any[]>({
    queryKey: ['dashboard', 'mora', projectId ?? 'all'],
    queryFn:  () => fetchMora(projectId),
    staleTime: 60_000,
    enabled,
  });
}

// ── Dashboard operativo (MANAGER) ────────────────────────────────────────────
// Sin totales del negocio: sus cobros del día y sus pendientes. El backend es
// quien decide qué entrega (dashboard.routes.ts); esto solo lo consume.
export interface DashboardOperativo {
  misCobrosHoy: { total: number; count: number };
  porCobrar:    { vencidas: number; vencenEstaSemana: number };
  apartadosPorVencer: number;
  inventario:   { contratosActivos: number; lotesDisponibles: number };
}

async function fetchOperativo(projectId?: string): Promise<DashboardOperativo> {
  const { data } = await api.get('/dashboard/operativo', { params: { projectId } });
  return data.data;
}

export function useDashboardOperativo(projectId?: string, enabled = true) {
  return useQuery<DashboardOperativo>({
    queryKey: ['dashboard', 'operativo', projectId ?? 'all'],
    queryFn:  () => fetchOperativo(projectId),
    // Es su tablero de trabajo del día: se refresca solo cada minuto para que
    // vean sus cobros conforme los registran.
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled,
  });
}
