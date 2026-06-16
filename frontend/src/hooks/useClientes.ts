import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface Cliente {
  id:              string;
  globalCode:      string;
  firstName:       string;
  lastName:        string;
  email:           string | null;
  phone:           string | null;
  whatsappPhone:   string | null;
  address:         string | null;
  city:            string | null;
  state:           string | null;
  zipCode:         string | null;
  ine:             string | null;
  curp:            string | null;
  estadoCivil:     string | null;
  lugarNacimiento: string | null;
  status:          'LEAD' | 'PROSPECT' | 'ACTIVE' | 'INACTIVE';
  notes:           string | null;
  createdAt:       string;
  ineDocument?: { id: string; fileName: string; mimeType: string | null } | null;
}

// Campos editables vía PUT /clients/:id (espejo del whitelist del backend).
export type ClienteEditable = Pick<
  Cliente,
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'whatsappPhone'
  | 'address'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'ine'
  | 'curp'
  | 'estadoCivil'
  | 'lugarNacimiento'
  | 'status'
  | 'notes'
>;

async function fetchClientes(): Promise<Cliente[]> {
  const { data } = await api.get('/clients');
  return data.data.clients;
}

async function fetchClienteById(id: string): Promise<Cliente> {
  const { data } = await api.get(`/clients/${id}`);
  return data.data.client;
}

async function fetchContratosByCliente(clientId: string) {
  const { data } = await api.get('/contracts', { params: { clientId } });
  return data.data as ContractResumen[];  // respuesta: { success, data: [...], count }
}

export interface ContractResumen {
  id:            string;
  contractNumber: string;
  codigoLegado:  string | null;
  status:        string;
  totalPrice:    number;
  balance:       number | null;
  moraMonthsCount: number;
  lots: Array<{
    lot: { manzana: number; lotNumber: string; areaM2: number };
  }>;
}

export function useClientes() {
  return useQuery<Cliente[]>({
    queryKey: ['clientes'],
    queryFn:  fetchClientes,
    staleTime: 60_000,
  });
}

export function useClienteById(id: string) {
  return useQuery<Cliente>({
    queryKey: ['clientes', id],
    queryFn:  () => fetchClienteById(id),
    enabled:  !!id,
  });
}

export function useUpdateCliente(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ClienteEditable>) =>
      api.put(`/clients/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes', id] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}

export function useContratosByCliente(clientId: string) {
  return useQuery<ContractResumen[]>({
    queryKey: ['contratos', 'cliente', clientId],
    queryFn:  () => fetchContratosByCliente(clientId),
    enabled:  !!clientId,
  });
}
