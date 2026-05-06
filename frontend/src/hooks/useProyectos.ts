import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface Proyecto {
  id:               string;
  code:             string;
  name:             string;
  description:      string | null;
  status:           string;
  location:         string;
  city:             string;
  state:            string;
  totalLots:        number;
  startDate:        string | null;
  completionDate:   string | null;
  commissionType:   string;
  commissionValue:  number | null;
  createdAt:        string;
  totalContratos:   number;
  lotesVendidos:    number;
  lotesDisponibles: number;
  totalIngresos:    number;
}

async function fetchProyectos(): Promise<Proyecto[]> {
  const { data } = await api.get('/projects');
  return data.data.projects;
}

async function fetchProyectoById(id: string): Promise<Proyecto> {
  const { data } = await api.get(`/projects/${id}`);
  return data.data.project;
}

export function useProyectos() {
  return useQuery({
    queryKey: ['proyectos'],
    queryFn:  fetchProyectos,
    staleTime: 60_000,
  });
}

export function useProyectoById(id: string) {
  return useQuery({
    queryKey: ['proyectos', id],
    queryFn:  () => fetchProyectoById(id),
    enabled:  !!id,
    staleTime: 60_000,
  });
}
