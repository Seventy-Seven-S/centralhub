export interface Contract {
  id: string;
  contractNumber: string;
  codigoLegado: string | null;
  clientId: string;
  projectId: string;
  status: 'DRAFT' | 'SIGNED' | 'ACTIVE' | 'IN_MORA' | 'COMPLETED' | 'CANCELED';
  totalPrice: number;
  downPayment: number;
  financingAmount: number;
  balance: number | null;
  installmentCount: number | null;
  installmentAmount: number | null;
  moraMonthsCount: number;
  startDate: string | null;
  createdAt: string;
  client?: { id: string; firstName: string; lastName: string; email: string };
  project?: { id: string; code: string; name: string };
}
