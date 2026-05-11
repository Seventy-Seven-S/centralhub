import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DashboardSummary } from '@/types/dashboard.types';

const MONARCA_II_ID = '74b9deb6-a793-408d-8087-0e30ef0f288d';

async function fetchSummary(projectId: string): Promise<DashboardSummary> {
  const { data } = await api.get('/dashboard/summary', { params: { projectId } });
  return data.data;
}

async function fetchMora(projectId: string): Promise<any[]> {
  const { data } = await api.get('/dashboard/mora', { params: { projectId } });
  return data.data;
}

export function useDashboardSummary(projectId: string = MONARCA_II_ID) {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary', projectId],
    queryFn:  () => fetchSummary(projectId),
    staleTime: 60_000,
  });
}

export function useMoraDetail(enabled = true) {
  return useQuery<any[]>({
    queryKey: ['dashboard', 'mora', MONARCA_II_ID],
    queryFn:  () => fetchMora(MONARCA_II_ID),
    staleTime: 60_000,
    enabled,
  });
}
