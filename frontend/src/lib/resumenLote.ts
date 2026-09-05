export interface LoteContratoVigente {
  priceAtSale: number;
  contract: {
    id: string;
    contractNumber: string;
    codigoLegado: string | null;
    status: string;
    balance: number | null;
    client: { id: string; firstName: string; lastName: string };
  };
}

export type ResumenLote =
  | { tipo: 'vendido'; cliente: string; codigo: string; contratoId: string; precioVenta: number; estadoContrato: string; balance: number | null }
  | { tipo: 'propietario'; propietario: string }
  | { tipo: 'libre' }
  | { tipo: 'sin-contrato' };

/** Nombre del dueño del terreno: los lotes UNAVAILABLE son suyos y no están a la venta. */
export const PROPIETARIO = 'Antonio Isassi';

export function resumenLote(lote: { status: string; contracts?: LoteContratoVigente[] }): ResumenLote {
  const vigente = lote.contracts?.[0];
  if (vigente) {
    const c = vigente.contract;
    return {
      tipo: 'vendido',
      cliente: `${c.client.firstName} ${c.client.lastName}`,
      codigo: c.codigoLegado ?? c.contractNumber,
      contratoId: c.id,
      precioVenta: vigente.priceAtSale,
      estadoContrato: c.status,
      balance: c.balance,
    };
  }
  if (lote.status === 'UNAVAILABLE') return { tipo: 'propietario', propietario: PROPIETARIO };
  if (lote.status === 'SOLD') return { tipo: 'sin-contrato' };
  return { tipo: 'libre' };
}
