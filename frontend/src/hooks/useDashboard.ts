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

export function useDashboardSummary(projectId?: string) {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary', projectId ?? 'all'],
    queryFn:  () => fetchSummary(projectId),
    staleTime: 60_000,
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
