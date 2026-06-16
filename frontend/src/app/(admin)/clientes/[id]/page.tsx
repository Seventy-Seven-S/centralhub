'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail, Phone, User, FileText, AlertCircle, ExternalLink, Pencil, X } from 'lucide-react';
import { useClienteById, useContratosByCliente, useUpdateCliente, type Cliente, type ClienteEditable } from '@/hooks/useClientes';
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/api';

const STATUS_OPTIONS: Array<{ value: Cliente['status']; label: string }> = [
  { value: 'LEAD',     label: 'Lead' },
  { value: 'PROSPECT', label: 'Prospecto' },
  { value: 'ACTIVE',   label: 'Activo' },
  { value: 'INACTIVE', label: 'Inactivo' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      {children}
    </div>
  );
}

function EditarClienteModal({ cliente, onClose }: { cliente: Cliente; onClose: () => void }) {
  const update = useUpdateCliente(cliente.id);
  const [error, setError] = useState('');
  const [form, setForm] = useState<ClienteEditable>({
    firstName:       cliente.firstName ?? '',
    lastName:        cliente.lastName ?? '',
    email:           cliente.email ?? '',
    phone:           cliente.phone ?? '',
    whatsappPhone:   cliente.whatsappPhone ?? '',
    address:         cliente.address ?? '',
    city:            cliente.city ?? '',
    state:           cliente.state ?? '',
    zipCode:         cliente.zipCode ?? '',
    ine:             cliente.ine ?? '',
    curp:            cliente.curp ?? '',
    estadoCivil:     cliente.estadoCivil ?? '',
    lugarNacimiento: cliente.lugarNacimiento ?? '',
    status:          cliente.status,
    notes:           cliente.notes ?? '',
  });

  const set = (k: keyof ClienteEditable) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone?.trim()) {
      setError('Nombre, apellido y teléfono son obligatorios');
      return;
    }

    // Normaliza strings vacíos a null (campos opcionales) y arma el payload editable.
    const payload: ClienteEditable = {
      firstName:       form.firstName.trim(),
      lastName:        form.lastName.trim(),
      email:           form.email?.trim() || null,
      phone:           form.phone.trim(),
      whatsappPhone:   form.whatsappPhone?.trim() || null,
      address:         form.address?.trim() || null,
      city:            form.city?.trim() || null,
      state:           form.state?.trim() || null,
      zipCode:         form.zipCode?.trim() || null,
      ine:             form.ine?.trim() || null,
      curp:            form.curp?.trim() || null,
      estadoCivil:     form.estadoCivil?.trim() || null,
      lugarNacimiento: form.lugarNacimiento?.trim() || null,
      status:          form.status,
      notes:           form.notes?.trim() || null,
    };

    try {
      await update.mutateAsync(payload);
      onClose();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'No se pudo guardar los cambios del cliente');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4 sticky top-0" style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Editar cliente</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg transition" style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nombre *"><input style={inputStyle} value={form.firstName} onChange={set('firstName')} /></Field>
            <Field label="Apellido *"><input style={inputStyle} value={form.lastName} onChange={set('lastName')} /></Field>
            <Field label="Email"><input type="email" style={inputStyle} value={form.email ?? ''} onChange={set('email')} /></Field>
            <Field label="Teléfono *"><input type="tel" style={inputStyle} value={form.phone ?? ''} onChange={set('phone')} /></Field>
            <Field label="WhatsApp"><input type="tel" style={inputStyle} value={form.whatsappPhone ?? ''} onChange={set('whatsappPhone')} /></Field>
            <Field label="Estado civil"><input style={inputStyle} value={form.estadoCivil ?? ''} onChange={set('estadoCivil')} /></Field>
            <Field label="Clave de elector (INE)"><input style={inputStyle} value={form.ine ?? ''} onChange={set('ine')} /></Field>
            <Field label="CURP"><input style={inputStyle} value={form.curp ?? ''} onChange={set('curp')} /></Field>
            <Field label="Lugar de nacimiento"><input style={inputStyle} value={form.lugarNacimiento ?? ''} onChange={set('lugarNacimiento')} /></Field>
            <Field label="Estatus">
              <select style={inputStyle} value={form.status} onChange={set('status')}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Dirección"><input style={inputStyle} value={form.address ?? ''} onChange={set('address')} /></Field>
            <Field label="Ciudad"><input style={inputStyle} value={form.city ?? ''} onChange={set('city')} /></Field>
            <Field label="Estado"><input style={inputStyle} value={form.state ?? ''} onChange={set('state')} /></Field>
            <Field label="Código postal"><input style={inputStyle} value={form.zipCode ?? ''} onChange={set('zipCode')} /></Field>
          </div>
          <Field label="Notas">
            <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={form.notes ?? ''} onChange={set('notes')} />
          </Field>

          {error && <p className="text-xs font-medium" style={{ color: 'var(--danger)' }}>{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ border: '1px solid var(--border)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={update.isPending}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: 'var(--accent)', color: 'white' }}
            >
              {update.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  ACTIVE:    { label: 'Activo',      bg: 'var(--accent-pale)',  color: 'var(--accent)' },
  IN_MORA:   { label: 'En mora',     bg: 'var(--danger-pale)',  color: 'var(--danger)' },
  DRAFT:     { label: 'Borrador',    bg: 'var(--bg-tertiary)',  color: 'var(--text-secondary)' },
  SIGNED:    { label: 'Firmado',     bg: 'var(--accent-pale)',  color: 'var(--accent)' },
  COMPLETED: { label: 'Completado',  bg: 'var(--accent-pale)',  color: 'var(--accent)' },
  CANCELED:  { label: 'Cancelado',   bg: 'var(--danger-pale)',  color: 'var(--danger)' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, bg: 'var(--bg-tertiary)', color: 'var(--text-secondary)' };
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function SkeletonDetalle() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
      <div className="rounded-2xl p-6 shadow-sm space-y-4" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="h-6 w-40 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />)}
        </div>
      </div>
      <div className="rounded-2xl p-6 shadow-sm space-y-3" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="h-5 w-32 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />)}
      </div>
    </div>
  );
}

export default function ClienteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();
  const [editing, setEditing] = useState(false);

  const { data: cliente, isLoading: loadingCliente, isError: errorCliente } = useClienteById(id);
  const { data: contratos = [], isLoading: loadingContratos } = useContratosByCliente(id);

  if (loadingCliente || loadingContratos) return <SkeletonDetalle />;

  if (errorCliente || !cliente) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Cliente no encontrado</p>
        <button onClick={() => router.back()}
                className="text-sm text-blue-600 hover:underline">
          Volver
        </button>
      </div>
    );
  }

  const fullName = `${cliente.firstName ?? ''} ${cliente.lastName ?? ''}`.trim();
  const initials = `${cliente.firstName?.[0] ?? ''}${cliente.lastName?.[0] ?? ''}`.toUpperCase();

  const handleVerIne = async () => {
    if (!cliente.ineDocument) return;
    try {
      const res = await api.get(`/documents/${cliente.ineDocument.id}/file`, { responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch {
      alert('No se pudo abrir la INE');
    }
  };

  return (
    <div className="space-y-5">

      {/* Back + título */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-9 h-9 rounded-xl shadow-sm transition"
          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}
        >
          <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{fullName}</h2>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{cliente.globalCode}</p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--accent)', color: 'white' }}
        >
          <Pencil className="w-4 h-4" />
          Editar
        </button>
      </div>

      {editing && <EditarClienteModal cliente={cliente} onClose={() => setEditing(false)} />}

      {/* Card de datos del cliente */}
      <div className="rounded-2xl p-6 shadow-sm" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
               style={{ backgroundColor: 'var(--accent)' }}>
            {initials}
          </div>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{fullName}</h3>
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1"
              style={{
                backgroundColor: cliente.status === 'ACTIVE' ? 'var(--accent-pale)' : 'var(--bg-tertiary)',
                color: cliente.status === 'ACTIVE' ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {cliente.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <Mail className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            <div className="min-w-0">
              <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Email</p>
              <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{cliente.email || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <Phone className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Teléfono</p>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{cliente.phone || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <User className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Código</p>
              <p className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{cliente.globalCode}</p>
            </div>
          </div>
          {cliente.ineDocument && (
            <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <FileText className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              <div className="min-w-0">
                <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>INE</p>
                <button
                  onClick={handleVerIne}
                  className="text-sm truncate hover:underline"
                  style={{ color: 'var(--accent)' }}
                >
                  {cliente.ineDocument.fileName}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contratos del cliente */}
      <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <FileText className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Contratos ({contratos.length})
          </h3>
        </div>

        {contratos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <FileText className="w-8 h-8" style={{ color: 'var(--bg-tertiary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Sin contratos registrados</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {contratos.map(contrato => {
              const lote = contrato.lots?.[0]?.lot;
              const loteLabel = lote
                ? `M${lote.manzana} L-${lote.lotNumber}`
                : '—';
              const extraLotes = (contrato.lots?.length ?? 0) - 1;

              return (
                <div
                  key={contrato.id}
                  onClick={() => router.push(`/contratos/${contrato.id}`)}
                  className="flex items-center justify-between px-6 py-4 cursor-pointer transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Código */}
                    <div className="flex-shrink-0 text-center">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Código</p>
                      <p className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                        {contrato.codigoLegado ?? contrato.contractNumber}
                      </p>
                    </div>
                    {/* Separador */}
                    <div className="w-px h-8 flex-shrink-0" style={{ backgroundColor: 'var(--border)' }} />
                    {/* Lote */}
                    <div className="flex-shrink-0">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Lote</p>
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        {loteLabel}
                        {extraLotes > 0 && (
                          <span className="ml-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>+{extraLotes}</span>
                        )}
                      </p>
                    </div>
                    {/* Separador */}
                    <div className="w-px h-8 flex-shrink-0" style={{ backgroundColor: 'var(--border)' }} />
                    {/* Precio */}
                    <div className="min-w-0">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Precio total</p>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {formatCurrency(contrato.totalPrice)}
                      </p>
                    </div>
                    {/* Balance */}
                    <div className="hidden sm:block min-w-0">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Balance</p>
                      <p className={`text-sm font-semibold ${contrato.moraMonthsCount > 0 ? 'text-red-600' : ''}`}
                         style={contrato.moraMonthsCount === 0 ? { color: 'var(--text-primary)' } : undefined}>
                        {contrato.balance != null ? formatCurrency(contrato.balance) : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <StatusBadge status={contrato.status} />
                    <ExternalLink className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
