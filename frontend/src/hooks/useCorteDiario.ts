import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface PagoDelDia {
  id: string;
  paymentNumber: string;
  amount: number;
  paymentMethod: 'CASH' | 'TRANSFER' | 'CHECK' | 'CARD';
  paymentDate: string;
  concept: string;
  contract: {
    id: string; codigoLegado: string | null; contractNumber: string;
    client: { firstName: string; lastName: string };
    project: { code: string; name: string };
  };
}

export interface ResumenDia {
  totalEfectivo: number;
  totalOtros: number;
  pagosEfectivo: number;
  pagosOtros: number;
  porProyecto: Array<{ code: string; nombre: string; efectivo: number; pagos: number }>;
}

export interface MiDia {
  fecha: string;
  pagos: PagoDelDia[];
  resumen: ResumenDia;
}

export interface CorteDiario {
  id: string;
  numero: number;
  fecha: string;
  status: 'PENDIENTE_ENTREGA' | 'RECIBIDO';
  totalEfectivo: number;
  totalOtros: number;
  declarado: number;
  recibido: number | null;
  diferencia: number | null;
  cerradoAt: string;
  recibidoAt: string | null;
  notaCobrador: string | null;
  notaAdmin: string | null;
  cobrador: { firstName: string; lastName: string };
  recibidoPor: { firstName: string; lastName: string } | null;
  _count?: { payments: number };
}

export interface CorteDiarioDetalle extends CorteDiario {
  payments: PagoDelDia[];
  resumen: ResumenDia;
}

export function useMiDia() {
  return useQuery<MiDia>({
    queryKey: ['corte-diario', 'mi-dia'],
    queryFn: async () => (await api.get('/cortes-diarios/mi-dia')).data.data,
    // Es su tablero del día: se refresca conforme registra cobros.
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useCortesDiarios(status?: 'PENDIENTE_ENTREGA' | 'RECIBIDO') {
  return useQuery<CorteDiario[]>({
    queryKey: ['corte-diario', 'lista', status ?? 'todos'],
    queryFn: async () => (await api.get('/cortes-diarios', { params: { status } })).data.data,
    staleTime: 30_000,
  });
}

export function useCorteDiario(id: string | null) {
  return useQuery<CorteDiarioDetalle>({
    queryKey: ['corte-diario', 'detalle', id],
    queryFn: async () => (await api.get(`/cortes-diarios/${id}`)).data.data,
    enabled: !!id,
  });
}

export function useCerrarCorte() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { declarado: number; notaCobrador?: string }) =>
      (await api.post('/cortes-diarios', v)).data.data as CorteDiario,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['corte-diario'] }),
  });
}

export function useRecibirCorte() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; recibido: number; notaAdmin?: string }) =>
      (await api.post(`/cortes-diarios/${v.id}/recibir`, { recibido: v.recibido, notaAdmin: v.notaAdmin })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['corte-diario'] }),
  });
}
