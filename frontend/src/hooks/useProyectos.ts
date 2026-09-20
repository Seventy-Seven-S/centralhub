import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Reparto } from '@/components/proyectos/RepartoProyecto';

export interface Proyecto {
  id:               string;
  code:             string;
  name:             string;
  description:      string | null;
  status:           string;
  location:         string;
  city:             string;
  state:            string;
  startDate:        string | null;
  completionDate:   string | null;
  commissionType:   string;
  commissionValue:  number | null;
  createdAt:        string;
  /** Contratos vivos: no cuenta cancelados, rescindidos ni borradores. */
  totalContratos:      number;
  /** Se cuenta de los lotes reales del proyecto, no de un campo capturado. */
  totalLotes:          number;
  /** Suma del precio inicial de todos sus lotes. */
  valorTotal:          number;
  /** Cobrado que aún no se reporta en ningún corte: lo que sumaría generar uno. */
  pendientePorEntregar: number;
  /** Reparto pactado con el dueño del terreno. Solo viene en el detalle, no
   *  en el listado: la tarjeta no lo muestra. */
  reparto?:            Reparto | null;
  lotesVendidos:       number;
  lotesDisponibles:    number;
  lotesReservados:     number;
  lotesNoDisponibles:  number;
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
