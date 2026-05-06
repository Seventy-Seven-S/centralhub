export interface Payment {
  id: string;
  paymentNumber: string;
  contractId: string;
  clientId: string;
  amount: number;
  paymentDate: string;
  concept: string;
  paymentType: string;
  paymentMethod: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELED';
}
