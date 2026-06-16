'use client';

import { useState } from 'react';
import { Lock, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/api';

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
}

function PasswordField({ label, value, onChange, show, onToggle, autoComplete }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="w-full rounded-xl px-4 py-2.5 pr-11 text-sm outline-none transition"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-tertiary)' }}
          tabIndex={-1}
          aria-label={show ? 'Ocultar' : 'Mostrar'}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function MiCuentaPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validación client-side
    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas nuevas no coinciden');
      return;
    }

    setLoading(true);
    try {
      await api.post('/client-auth/change-password', {
        currentPassword,
        newPassword,
      });
      setSuccess(true);
      setError(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'No se pudo cambiar la contraseña. Inténtalo de nuevo.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Mi cuenta</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Administra la seguridad de tu cuenta
        </p>
      </div>

      <div
        className="rounded-2xl p-6 max-w-lg"
        style={{ backgroundColor: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}
      >
        <div className="flex items-center gap-2.5 mb-5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <Lock className="w-4.5 h-4.5" style={{ color: 'var(--gold)' }} />
          </div>
          <div>
            <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>Cambiar contraseña</h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Mínimo 8 caracteres</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordField
            label="Contraseña actual"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrent}
            onToggle={() => setShowCurrent(s => !s)}
            autoComplete="current-password"
          />
          <PasswordField
            label="Nueva contraseña"
            value={newPassword}
            onChange={setNewPassword}
            show={showNew}
            onToggle={() => setShowNew(s => !s)}
            autoComplete="new-password"
          />
          <PasswordField
            label="Confirmar nueva contraseña"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showConfirm}
            onToggle={() => setShowConfirm(s => !s)}
            autoComplete="new-password"
          />

          {error && (
            <div
              className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm"
              style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)' }}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div
              className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm"
              style={{ backgroundColor: 'var(--success-bg)', color: 'var(--success)' }}
            >
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Contraseña actualizada correctamente</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !currentPassword || !newPassword || !confirmPassword}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--gold)' }}
          >
            {loading ? 'Guardando…' : 'Actualizar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
