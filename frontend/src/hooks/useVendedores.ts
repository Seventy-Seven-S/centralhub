import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Vendedor {
  id:        string;
  firstName: string;
  lastName:  string;
  role:      'AGENT' | 'MANAGER';
}

// ── Fetch functions ───────────────────────────────────────────────────────────

async function fetchVendedores(): Promise<Vendedor[]> {
  const { data } = await api.get('/users/sellers');
  return data.data.sellers;
}

// ── Query hooks ───────────────────────────────────────────────────────────────

export function useVendedores() {
  return useQuery<Vendedor[]>({
    queryKey:  ['vendedores'],
    queryFn:   fetchVendedores,
    staleTime: 60_000,
  });
}
