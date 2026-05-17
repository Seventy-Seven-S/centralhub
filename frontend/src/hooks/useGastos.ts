import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ExpenseCategory {
  id:          string;
  name:        string;
  description: string | null;
  _count:      { expenses: number };
}

export interface Expense {
  id:          string;
  amount:      string; // Decimal comes back as string from Prisma
  description: string | null;
  date:        string;
  projectId:   string;
  categoryId:  string;
  createdAt:   string;
  project:     { id: string; code: string; name: string };
  category:    { id: string; name: string };
  createdBy:   { id: string; firstName: string; lastName: string };
}

export interface ExpenseSummary {
  projectId:   string;
  projectName: string;
  total:       number;
  byCategory:  Array<{ categoryId: string; categoryName: string; total: number; count: number }>;
}

export interface CreateExpenseCategoryDto {
  name:        string;
  description?: string;
}

export interface UpdateExpenseCategoryDto {
  name?:        string;
  description?: string;
}

export interface ExpenseFilters {
  categoryId?: string;
  dateFrom?:   string;
  dateTo?:     string;
}

export interface CreateExpenseDto {
  amount:      number;
  description?: string;
  date:        string;
  projectId:   string;
  categoryId:  string;
}

export interface UpdateExpenseDto {
  amount?:      number;
  description?: string;
  date?:        string;
  categoryId?:  string;
}

// ── Fetch functions ───────────────────────────────────────────────────────────

async function fetchCategories(): Promise<ExpenseCategory[]> {
  const { data } = await api.get('/expenses/categories');
  return data.data;
}

async function fetchExpensesByProject(projectId: string, filters?: ExpenseFilters): Promise<Expense[]> {
  const params: Record<string, string> = {};
  if (filters?.categoryId) params.categoryId = filters.categoryId;
  if (filters?.dateFrom)   params.dateFrom   = filters.dateFrom;
  if (filters?.dateTo)     params.dateTo     = filters.dateTo;
  const { data } = await api.get(`/expenses/project/${projectId}`, { params });
  return data.data;
}

async function fetchExpenseSummary(projectId: string): Promise<ExpenseSummary> {
  const { data } = await api.get(`/expenses/project/${projectId}/summary`);
  return data.data;
}

// ── Query hooks ───────────────────────────────────────────────────────────────

export function useExpenseCategories() {
  return useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories'],
    queryFn:  fetchCategories,
    staleTime: 60_000,
  });
}

export function useExpensesByProject(projectId: string, filters?: ExpenseFilters) {
  return useQuery<Expense[]>({
    queryKey: ['expenses', projectId, filters],
    queryFn:  () => fetchExpensesByProject(projectId, filters),
    staleTime: 30_000,
    enabled:  !!projectId,
  });
}

export function useExpenseSummary(projectId: string) {
  return useQuery<ExpenseSummary>({
    queryKey: ['expense-summary', projectId],
    queryFn:  () => fetchExpenseSummary(projectId),
    staleTime: 30_000,
    enabled:  !!projectId,
  });
}

// ── Mutation hooks ────────────────────────────────────────────────────────────

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateExpenseCategoryDto) =>
      api.post('/expenses/categories', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateExpenseCategoryDto }) =>
      api.put(`/expenses/categories/${id}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/expenses/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
    },
  });
}

export function useCreateExpense(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateExpenseDto) =>
      api.post('/expenses', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', projectId] });
      qc.invalidateQueries({ queryKey: ['expense-summary', projectId] });
    },
  });
}

export function useUpdateExpense(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateExpenseDto }) =>
      api.put(`/expenses/${id}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', projectId] });
      qc.invalidateQueries({ queryKey: ['expense-summary', projectId] });
    },
  });
}

export function useDeleteExpense(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', projectId] });
      qc.invalidateQueries({ queryKey: ['expense-summary', projectId] });
    },
  });
}
