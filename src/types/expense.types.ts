export interface CreateExpenseCategoryDto {
  name: string;
  description?: string;
}

export interface UpdateExpenseCategoryDto {
  name?: string;
  description?: string;
}

export interface CreateExpenseDto {
  amount: number;
  description?: string;
  date: string; // ISO date string
  projectId: string;
  categoryId: string;
  descontarEnCorte?: boolean;
  beneficiario?: string | null;
}

export interface UpdateExpenseDto {
  amount?: number;
  description?: string;
  date?: string;
  categoryId?: string;
  descontarEnCorte?: boolean;
  beneficiario?: string | null;
}

export interface ExpenseFilters {
  projectId?: string;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
}
