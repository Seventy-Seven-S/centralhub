import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface ContratoDetalle {
  id:               string;
  contractNumber:   string;
  codigoLegado:     string | null;
  status:           string;
  totalPrice:        number;
  downPayment:       number | null;
  financingAmount:   number | null;
  balance:           number | null;
  installmentAmount: number | null;
  installmentCount:  number;
  moraMonthsCount:   number;
  startDate:         string | null;
  contractDate:      string | null;
  client: {
    id:        string;
    firstName: string;
    lastName:  string;
    email:     string;
    phone:     string | null;
  };
  project: {
    id:   string;
    code: string;
    name: string;
  };
  lots: Array<{
    lot: { lotNumber: string; manzana: number; areaM2: number };
  }>;
}

export interface Cuota {
  id:               string;
  contractId:       string;
  numeroCuota:      number;
  mes:              string;
  montoEsperado:    number;
  montoPagado:      number | null;
  fechaVencimiento: string;
  fechaPago:        string | null;
  status:           'PENDIENTE' | 'PAGADA' | 'MORA';
}

export interface Pago {
  id:            string;
  paymentNumber: string;
  paymentType:   string;
  paymentMethod: string;
  amount:        number;
  paymentDate:   string;
  concept:       string;
  status:        string;
  balanceAfter:  number | null;
}

const PROJECT_ID = '74b9deb6-a793-408d-8087-0e30ef0f288d';

async function fetchContratos(projectId: string): Promise<ContratoDetalle[]> {
  const { data } = await api.get('/contracts', { params: { projectId } });
  return data.data;
}

async function fetchContrato(id: string): Promise<ContratoDetalle> {
  const { data } = await api.get(`/contracts/${id}`);
  return data.data;
}

export function useContratos(projectId = PROJECT_ID) {
  return useQuery<ContratoDetalle[]>({
    queryKey: ['contratos', 'list', projectId],
    queryFn:  () => fetchContratos(projectId),
    staleTime: 60_000,
  });
}

async function fetchCuotas(contractId: string): Promise<Cuota[]> {
  const { data } = await api.get(`/contracts/${contractId}/cuotas`);
  return data.data;
}

async function fetchPagos(contractId: string): Promise<Pago[]> {
  const { data } = await api.get('/payments', { params: { contractId } });
  return data.data;
}

export function useContratoById(id: string) {
  return useQuery<ContratoDetalle>({
    queryKey: ['contratos', id],
    queryFn:  () => fetchContrato(id),
    enabled:  !!id,
  });
}

export function useCuotasByContrato(contractId: string) {
  return useQuery<Cuota[]>({
    queryKey: ['cuotas', contractId],
    queryFn:  () => fetchCuotas(contractId),
    enabled:  !!contractId,
    staleTime: 30_000,
  });
}

export function usePagosByContrato(contractId: string) {
  return useQuery<Pago[]>({
    queryKey: ['pagos', contractId],
    queryFn:  () => fetchPagos(contractId),
    enabled:  !!contractId,
    staleTime: 30_000,
  });
}

export function usePayCuota(contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cuotaId, montoPagado, fechaPago }: { cuotaId: string; montoPagado: number; fechaPago?: string }) =>
      api.patch(`/cuotas/${cuotaId}/pay`, { montoPagado, fechaPago }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuotas', contractId] });
      qc.invalidateQueries({ queryKey: ['contratos', contractId] });
      qc.invalidateQueries({ queryKey: ['pagos', contractId] });
    },
  });
}
