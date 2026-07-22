'use client';

import { useState, useMemo } from 'react';
import {
  Receipt, Plus, Pencil, Trash2, ChevronLeft, ChevronRight,
  AlertCircle, X, ChevronDown, ChevronUp, Tag, TrendingDown,
} from 'lucide-react';
import { useProyectos } from '@/hooks/useProyectos';
import {
  useExpenseCategories, useExpensesByProject, useExpenseSummary,
  useCreateExpense, useUpdateExpense, useDeleteExpense,
  useCreateCategory, useUpdateCategory, useDeleteCategory,
  Expense, ExpenseCategory, CreateExpenseDto, UpdateExpenseDto,
  ExpenseFilters,
} from '@/hooks/useGastos';
import { formatCurrency, todayLocalISO } from '@/lib/utils';

const PAGE_SIZE = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="p-5 space-y-2 animate-pulse">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-11 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }} />
      ))}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-24 rounded-2xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />
      ))}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl p-5 shadow-sm" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
    </div>
  );
}

// ── Expense Form Modal ────────────────────────────────────────────────────────

interface ExpenseModalProps {
  expense:    Expense | null;
  projectId:  string;
  categories: ExpenseCategory[];
  projects:   Array<{ id: string; name: string; code: string }>;
  onClose:    () => void;
}

function ExpenseModal({ expense, projectId, categories, projects, onClose }: ExpenseModalProps) {
  const isEdit = !!expense;

  const [form, setForm] = useState({
    projectId:   expense?.projectId   ?? projectId,
    categoryId:  expense?.categoryId  ?? '',
    amount:      expense ? String(Number(expense.amount)) : '',
    description: expense?.description ?? '',
    date:        expense ? expense.date.slice(0, 10) : todayLocalISO(),
  });
  const [error, setError] = useState('');

  const createMutation = useCreateExpense(form.projectId);
  const updateMutation = useUpdateExpense(form.projectId);
  const isPending = createMutation.isPending || updateMutation.isPending;

  function validate(): boolean {
    if (!form.projectId)  { setError('Selecciona un proyecto');   return false; }
    if (!form.categoryId) { setError('Selecciona una categoría'); return false; }
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      setError('Ingresa un monto válido mayor a 0'); return false;
    }
    if (!form.date) { setError('Selecciona una fecha'); return false; }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    try {
      if (isEdit) {
        const dto: UpdateExpenseDto = {
          categoryId:  form.categoryId,
          amount:      Number(form.amount),
          description: form.description || undefined,
          date:        new Date(form.date).toISOString(),
        };
        await updateMutation.mutateAsync({ id: expense!.id, dto });
      } else {
        const dto: CreateExpenseDto = {
          projectId:   form.projectId,
          categoryId:  form.categoryId,
          amount:      Number(form.amount),
          description: form.description || undefined,
          date:        new Date(form.date).toISOString(),
        };
        await createMutation.mutateAsync(dto);
      }
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Error al guardar el gasto');
    }
  }

  const inputStyle = {
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="rounded-2xl shadow-xl w-full max-w-md" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {isEdit ? 'Editar gasto' : 'Nuevo gasto'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg transition" style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Proyecto */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Proyecto</label>
            <select
              value={form.projectId}
              onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
              disabled={isEdit}
              className="w-full px-3 py-2 text-sm rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50"
              style={{ ...inputStyle, opacity: isEdit ? 0.6 : 1 }}
            >
              <option value="">Selecciona proyecto…</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </select>
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Categoría</label>
            <select
              value={form.categoryId}
              onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50"
              style={inputStyle}
            >
              <option value="">Selecciona categoría…</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Monto + Fecha */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Monto (MXN)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Fecha</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Descripción (opcional)</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Detalle del gasto…"
              className="w-full px-3 py-2 text-sm rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 resize-none"
              style={inputStyle}
            />
          </div>

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-pale)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--surface)' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-60 transition"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear gasto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Category Form Modal ───────────────────────────────────────────────────────

interface CategoryModalProps {
  category: ExpenseCategory | null;
  onClose:  () => void;
}

function CategoryModal({ category, onClose }: CategoryModalProps) {
  const isEdit = !!category;
  const [form, setForm]   = useState({ name: category?.name ?? '', description: category?.description ?? '' });
  const [error, setError] = useState('');

  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const isPending = createMutation.isPending || updateMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: category!.id, dto: { name: form.name, description: form.description || undefined } });
      } else {
        await createMutation.mutateAsync({ name: form.name, description: form.description || undefined });
      }
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Error al guardar');
    }
  }

  const inputStyle = { border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="rounded-2xl shadow-xl w-full max-w-sm" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {isEdit ? 'Editar categoría' : 'Nueva categoría'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Nombre</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Descripción (opcional)</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 resize-none"
              style={inputStyle}
            />
          </div>
          {error && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-pale)' }}>
              {error}
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--surface)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={isPending}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-60 transition"
              style={{ backgroundColor: 'var(--accent)' }}>
              {isPending ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GastosPage() {
  // ── Filters state ──────────────────────────────────────────────────────────
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [page, setPage] = useState(1);

  // ── Modals state ───────────────────────────────────────────────────────────
  const [expenseModal,  setExpenseModal]  = useState<{ open: boolean; expense: Expense | null }>({ open: false, expense: null });
  const [categoryModal, setCategoryModal] = useState<{ open: boolean; category: ExpenseCategory | null }>({ open: false, category: null });
  const [showCategories, setShowCategories] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: proyectos = [] } = useProyectos();
  const { data: categories = [] } = useExpenseCategories();

  const filters: ExpenseFilters = {
    categoryId: selectedCategory || undefined,
    dateFrom:   dateFrom || undefined,
    dateTo:     dateTo   || undefined,
  };

  const { data: expenses = [], isLoading: loadingExpenses } = useExpensesByProject(selectedProject, filters);
  const { data: summary, isLoading: loadingSummary } = useExpenseSummary(selectedProject);

  const deleteMutation = useDeleteExpense(selectedProject);
  const deleteCategoryMutation = useDeleteCategory();

  // ── Derived data ───────────────────────────────────────────────────────────
  const paginated  = useMemo(() => expenses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [expenses, page]);
  const totalPages = Math.max(1, Math.ceil(expenses.length / PAGE_SIZE));

  const topCategory = useMemo(() => {
    if (!summary?.byCategory.length) return '—';
    return summary.byCategory[0].categoryName;
  }, [summary]);

  function clearFilters() {
    setSelectedCategory('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  async function handleDeleteExpense(id: string) {
    try {
      await deleteMutation.mutateAsync(id);
      setConfirmDelete(null);
    } catch { /* error shown inline */ }
  }

  async function handleDeleteCategory(id: string) {
    try {
      await deleteCategoryMutation.mutateAsync(id);
    } catch { /* category has expenses, button is disabled */ }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Gastos</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Control de egresos por proyecto</p>
        </div>
        <button
          onClick={() => setExpenseModal({ open: true, expense: null })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition hover:opacity-90 shrink-0"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <Plus className="w-4 h-4" />
          Nuevo Gasto
        </button>
      </div>

      {/* ── KPIs ── */}
      {!selectedProject ? (
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Receipt className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
          <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Selecciona un proyecto para ver los gastos</p>
        </div>
      ) : loadingSummary ? (
        <KpiSkeleton />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            label="Total del período"
            value={formatCurrency(summary?.total ?? 0)}
            sub={`${expenses.length} gasto${expenses.length !== 1 ? 's' : ''} registrado${expenses.length !== 1 ? 's' : ''}`}
          />
          <KpiCard
            label="Número de gastos"
            value={String(expenses.length)}
            sub={selectedCategory ? 'categoría filtrada' : 'todas las categorías'}
          />
          <KpiCard
            label="Mayor categoría"
            value={topCategory}
            sub={summary?.byCategory[0] ? formatCurrency(summary.byCategory[0].total) : undefined}
          />
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <select
          value={selectedProject}
          onChange={e => { setSelectedProject(e.target.value); setPage(1); }}
          className="px-3 py-2.5 text-sm rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 transition cursor-pointer"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="">Selecciona proyecto…</option>
          {proyectos.map(p => (
            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
          ))}
        </select>

        <select
          value={selectedCategory}
          onChange={e => { setSelectedCategory(e.target.value); setPage(1); }}
          disabled={!selectedProject}
          className="px-3 py-2.5 text-sm rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 transition cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="">Todas las categorías</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          disabled={!selectedProject}
          className="px-3 py-2.5 text-sm rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 transition disabled:opacity-50"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />

        <input
          type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(1); }}
          disabled={!selectedProject}
          className="px-3 py-2.5 text-sm rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 transition disabled:opacity-50"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />

        {(selectedCategory || dateFrom || dateTo) && (
          <button
            onClick={clearFilters}
            className="px-3 py-2.5 text-sm rounded-xl transition"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--surface)' }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* ── Tabla ── */}
      <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
        {!selectedProject ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <TrendingDown className="w-10 h-10" style={{ color: 'var(--text-tertiary)' }} />
            <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Selecciona un proyecto para ver sus gastos</p>
          </div>
        ) : loadingExpenses ? (
          <TableSkeleton />
        ) : expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Receipt className="w-10 h-10" style={{ color: 'var(--text-tertiary)' }} />
            <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No hay gastos registrados para este proyecto</p>
            <button
              onClick={() => setExpenseModal({ open: true, expense: null })}
              className="text-sm font-medium transition hover:opacity-80"
              style={{ color: 'var(--accent)' }}
            >
              Registrar primer gasto
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                    <th className="text-left px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Fecha</th>
                    <th className="text-left px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Proyecto</th>
                    <th className="text-left px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Categoría</th>
                    <th className="text-left px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Descripción</th>
                    <th className="text-right px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Monto</th>
                    <th className="text-center px-5 py-3.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(expense => (
                    <>
                      <tr
                        key={expense.id}
                        className="transition-colors hover:bg-[var(--bg-secondary)]"
                        style={{ borderBottom: confirmDelete === expense.id ? 'none' : '1px solid var(--border)' }}
                      >
                        <td className="px-5 py-3.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {formatDate(expense.date)}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className="text-xs font-mono px-2 py-0.5 rounded-md"
                                style={{ backgroundColor: 'var(--accent-pale)', color: 'var(--accent)' }}>
                            {expense.project?.code ?? '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                          {expense.category?.name ?? '—'}
                        </td>
                        <td className="px-5 py-3.5 max-w-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                          {expense.description || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                          {formatCurrency(Number(expense.amount))}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setExpenseModal({ open: true, expense })}
                              title="Editar"
                              className="p-1.5 rounded-lg transition hover:bg-[var(--bg-tertiary)]"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(confirmDelete === expense.id ? null : expense.id)}
                              title="Eliminar"
                              className="p-1.5 rounded-lg transition hover:bg-[var(--danger-pale)]"
                              style={{ color: 'var(--danger)' }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Confirm delete inline */}
                      {confirmDelete === expense.id && (
                        <tr key={`${expense.id}-confirm`} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={6} className="px-5 py-3">
                            <div className="flex items-center justify-between rounded-xl px-4 py-2.5"
                                 style={{ backgroundColor: 'var(--danger-pale)', border: '1px solid var(--danger)' }}>
                              <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
                                ¿Eliminar este gasto? Esta acción no se puede deshacer.
                              </p>
                              <div className="flex gap-2 ml-4 shrink-0">
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="px-3 py-1.5 text-xs rounded-lg transition"
                                  style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--surface)' }}
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={() => handleDeleteExpense(expense.id)}
                                  disabled={deleteMutation.isPending}
                                  className="px-3 py-1.5 text-xs rounded-lg font-medium text-white disabled:opacity-60 transition"
                                  style={{ backgroundColor: 'var(--danger)' }}
                                >
                                  {deleteMutation.isPending ? 'Eliminando…' : 'Sí, eliminar'}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 text-sm"
                   style={{ borderTop: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <span>Página {page} de {totalPages} · {expenses.length} resultados</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-secondary)' }}
                  >
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-secondary)' }}
                  >
                    Siguiente <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Sección categorías ── */}
      <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
        <button
          onClick={() => setShowCategories(v => !v)}
          className="flex items-center justify-between w-full px-5 py-4 transition hover:bg-[var(--bg-secondary)]"
        >
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Administrar categorías
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
              {categories.length}
            </span>
          </div>
          {showCategories
            ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          }
        </button>

        {showCategories && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {/* Add category button */}
            <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <button
                onClick={() => setCategoryModal({ open: true, category: null })}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition"
                style={{ backgroundColor: 'var(--accent-pale)', color: 'var(--accent)', border: '1px solid var(--accent-pale)' }}
              >
                <Plus className="w-4 h-4" />
                Nueva categoría
              </button>
            </div>

            {/* Category list */}
            {categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Tag className="w-8 h-8" style={{ color: 'var(--text-tertiary)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Sin categorías creadas</p>
              </div>
            ) : (
              <div>
                {categories.map(cat => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between px-5 py-3.5 transition hover:bg-[var(--bg-secondary)]"
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{cat.name}</p>
                      {cat.description && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>{cat.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                        {cat._count.expenses} gasto{cat._count.expenses !== 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={() => setCategoryModal({ open: true, category: cat })}
                        title="Editar"
                        className="p-1.5 rounded-lg transition hover:bg-[var(--bg-tertiary)]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => cat._count.expenses === 0 && handleDeleteCategory(cat.id)}
                        disabled={cat._count.expenses > 0 || deleteCategoryMutation.isPending}
                        title={cat._count.expenses > 0 ? `No se puede eliminar: tiene ${cat._count.expenses} gasto(s) asociado(s)` : 'Eliminar categoría'}
                        className="p-1.5 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ color: cat._count.expenses > 0 ? 'var(--text-tertiary)' : 'var(--danger)' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {expenseModal.open && (
        <ExpenseModal
          expense={expenseModal.expense}
          projectId={selectedProject}
          categories={categories}
          projects={proyectos.map(p => ({ id: p.id, name: p.name, code: p.code }))}
          onClose={() => setExpenseModal({ open: false, expense: null })}
        />
      )}

      {categoryModal.open && (
        <CategoryModal
          category={categoryModal.category}
          onClose={() => setCategoryModal({ open: false, category: null })}
        />
      )}
    </div>
  );
}
