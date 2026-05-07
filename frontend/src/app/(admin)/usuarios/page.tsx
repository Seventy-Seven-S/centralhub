'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Pencil, ToggleLeft, ToggleRight, AlertCircle, X } from 'lucide-react';
import api from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
interface UsuarioInterno {
  id:        string;
  email:     string;
  firstName: string;
  lastName:  string;
  role:      'ADMIN' | 'MANAGER' | 'AGENT';
  status:    'ACTIVE' | 'INACTIVE';
  lastLogin: string | null;
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = { ADMIN: 'Administrador', MANAGER: 'Gerente', AGENT: 'Agente' };
const ROLE_STYLES: Record<string, { bg: string; color: string }> = {
  ADMIN:   { bg: '#EFF6FF', color: '#1D4ED8' },
  MANAGER: { bg: '#F0FDF4', color: '#15803D' },
  AGENT:   { bg: '#FFF7ED', color: '#C2410C' },
};

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useUsuarios() {
  return useQuery<UsuarioInterno[]>({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const { data } = await api.get('/users');
      return data.data.users;
    },
    staleTime: 60_000,
  });
}

// ── Badges ────────────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const s = ROLE_STYLES[role] ?? { bg: '#F3F4F6', color: '#374151' };
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ backgroundColor: s.bg, color: s.color }}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status === 'ACTIVE';
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ backgroundColor: active ? '#F0F9F4' : '#F3F4F6', color: active ? '#166534' : '#6B7280' }}>
      {active ? 'Activo' : 'Inactivo'}
    </span>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
interface ModalProps {
  usuario: UsuarioInterno | null;
  onClose: () => void;
}

function UsuarioModal({ usuario, onClose }: ModalProps) {
  const qc = useQueryClient();
  const isEdit = !!usuario;

  const [form, setForm] = useState({
    firstName: usuario?.firstName ?? '',
    lastName:  usuario?.lastName  ?? '',
    email:     usuario?.email     ?? '',
    password:  '',
    role:      (usuario?.role ?? 'AGENT') as string,
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async (values: typeof form) => {
      if (isEdit) {
        await api.put(`/users/${usuario!.id}`, { firstName: values.firstName, lastName: values.lastName, role: values.role });
      } else {
        await api.post('/users', values);
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); onClose(); },
    onError: (e: any) => setError(e.response?.data?.message ?? 'Error al guardar'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.firstName || !form.lastName || !form.role) return setError('Completa todos los campos');
    if (!isEdit && (!form.email || !form.password)) return setError('Email y contraseña son requeridos');
    mutation.mutate(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
              <input
                value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Apellido</label>
              <input
                value={form.lastName}
                onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400"
              />
            </div>
          </div>

          {!isEdit && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rol</label>
            <select
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 bg-white cursor-pointer"
            >
              <option value="ADMIN">Administrador</option>
              <option value="MANAGER">Gerente</option>
              <option value="AGENT">Agente</option>
            </select>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-60 transition"
              style={{ backgroundColor: '#C9972C' }}
            >
              {mutation.isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function UsuariosPage() {
  const qc = useQueryClient();
  const { data: usuarios = [], isLoading, isError } = useUsuarios();
  const [search, setSearch]       = useState('');
  const [modalUser, setModalUser] = useState<UsuarioInterno | null | undefined>(undefined);

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}/status`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return usuarios.filter(u =>
      `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q)
    );
  }, [usuarios, search]);

  if (isLoading) return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 bg-gray-200 rounded" />
        <div className="h-10 w-36 bg-gray-200 rounded-xl" />
      </div>
      <div className="h-64 bg-white rounded-2xl shadow-sm" />
    </div>
  );

  if (isError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertCircle className="w-10 h-10 text-red-400" />
      <p className="text-gray-600 font-medium">No se pudieron cargar los usuarios</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Usuarios internos</h2>
          <p className="text-sm text-gray-500 mt-0.5">{usuarios.length} usuarios registrados</p>
        </div>
        <button
          onClick={() => setModalUser(null)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition hover:opacity-90"
          style={{ backgroundColor: '#C9972C' }}
        >
          <Plus className="w-4 h-4" />
          Nuevo usuario
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o email..."
            className="w-full sm:w-80 px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Users className="w-10 h-10 text-gray-300" />
            <p className="text-gray-500 font-medium">Sin resultados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Nombre</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Email</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Rol</th>
                  <th className="text-center px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Status</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Último acceso</th>
                  <th className="text-center px-5 py-3.5 font-semibold text-gray-600 whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900 whitespace-nowrap">
                      {u.firstName} {u.lastName}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{u.email}</td>
                    <td className="px-5 py-3.5"><RoleBadge role={u.role} /></td>
                    <td className="px-5 py-3.5 text-center"><StatusBadge status={u.status} /></td>
                    <td className="px-5 py-3.5 text-right text-gray-400 whitespace-nowrap text-xs">
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('es-MX') : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setModalUser(u)}
                          title="Editar"
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-500 hover:text-gray-800"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleMutation.mutate(u.id)}
                          title={u.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition"
                          style={{ color: u.status === 'ACTIVE' ? '#166534' : '#6B7280' }}
                        >
                          {u.status === 'ACTIVE'
                            ? <ToggleRight className="w-4 h-4" />
                            : <ToggleLeft  className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalUser !== undefined && (
        <UsuarioModal usuario={modalUser} onClose={() => setModalUser(undefined)} />
      )}
    </div>
  );
}
