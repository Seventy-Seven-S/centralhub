import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  totalEgresos:     number;
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

// ── Preferencias de pantalla del usuario ─────────────────────────────────────
// El orden de las tarjetas es de CADA usuario, así que vive en su perfil y no
// en el navegador: el arquitecto lo acomoda una vez y lo ve igual desde
// cualquier equipo.
export function useOrdenProyectos() {
  const qc = useQueryClient();

  const { data: orden = [] } = useQuery<string[]>({
    queryKey: ['mis-preferencias', 'ordenProyectos'],
    queryFn: async () => {
      const { data } = await api.get('/users/mis-preferencias');
      const v = data?.data?.ordenProyectos;
      return Array.isArray(v) ? v.filter((x: unknown) => typeof x === 'string') : [];
    },
    staleTime: 5 * 60_000,
  });

  const guardar = useMutation({
    mutationFn: (ids: string[]) => api.put('/users/mis-preferencias', { ordenProyectos: ids }),
    // Se pinta el orden nuevo de inmediato: arrastrar y esperar al servidor
    // para ver el resultado se siente roto.
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ['mis-preferencias', 'ordenProyectos'] });
      const previo = qc.getQueryData<string[]>(['mis-preferencias', 'ordenProyectos']);
      qc.setQueryData(['mis-preferencias', 'ordenProyectos'], ids);
      return { previo };
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.previo) qc.setQueryData(['mis-preferencias', 'ordenProyectos'], ctx.previo);
    },
  });

  return { orden, guardar };
}
