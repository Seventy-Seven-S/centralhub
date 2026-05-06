import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DashboardSummary } from '@/types/dashboard.types';

const MONARCA_II_ID = '74b9deb6-a793-408d-8087-0e30ef0f288d';

async function fetchSummary(projectId: string): Promise<DashboardSummary> {
  const { data } = await api.get('/dashboard/summary', { params: { projectId } });
  return data.data;
}

export function useDashboardSummary(projectId: string = MONARCA_II_ID) {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary', projectId],
    queryFn:  () => fetchSummary(projectId),
    staleTime: 60_000,
  });
}
