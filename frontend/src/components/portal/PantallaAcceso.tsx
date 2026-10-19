'use client';

// Piezas de las pantallas de acceso del portal de clientes (login, activar la
// cuenta, cambio obligatorio de contraseña). Viven aquí para que las tres se
// vean igual: el cliente entra desde el teléfono y una pantalla con otro estilo
// le parece un correo falso.

import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/app/providers';

export function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: 'var(--gold)' }}
    >
      <svg
        style={{ width: size * 0.5, height: size * 0.5 }}
        className="text-white"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75H3.75A.75.75 0 013 21V9.75z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 21V12h6v9" />
      </svg>
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <div>
      <label
        className="block text-xs font-semibold mb-1.5"
        style={{ color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
      >
        {label}
      </label>
      <input
        {...rest}
        className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1.5px solid var(--border)',
          color: 'var(--text-primary)',
        }}
        onFocus={e => {
          e.currentTarget.style.borderColor = 'var(--gold)';
          e.currentTarget.style.backgroundColor = 'var(--surface)';
          if (rest.onFocus) rest.onFocus(e);
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
          if (rest.onBlur) rest.onBlur(e);
        }}
      />
    </div>
  );
}

export function MensajeError({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs px-3.5 py-2.5 rounded-lg"
      style={{ backgroundColor: 'var(--danger-pale)', color: 'var(--danger)' }}
    >
      {children}
    </p>
  );
}

export function BotonPrincipal({
  loading, loadingText, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; loadingText?: string }) {
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-1"
      style={{ backgroundColor: 'var(--gold)' }}
      onMouseEnter={e => { if (!loading) (e.currentTarget.style.filter = 'brightness(1.1)'); }}
      onMouseLeave={e => { e.currentTarget.style.filter = ''; }}
    >
      {loading ? <><Spinner /> {loadingText}</> : children}
    </button>
  );
}

/** Fondo, cambio de tema, logo, tarjeta y pie de las pantallas de acceso. */
export function PantallaAcceso({
  children,
  pie,
}: {
  children: React.ReactNode;
  pie?: React.ReactNode;
}) {
  const { theme, toggle } = useTheme();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10 relative"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <button
        onClick={toggle}
        className="absolute top-5 right-5 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
          boxShadow: 'var(--shadow-sm)',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        aria-label="Toggle theme"
      >
        {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </button>

      <div className="flex flex-col items-center mb-8 animate-fade-up">
        <LogoMark size={48} />
        <h1
          className="mt-3 text-xl font-bold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          CentralHub
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Portal de Clientes
        </p>
      </div>

      <div
        className="w-full max-w-[400px] rounded-2xl p-8 animate-fade-up delay-100"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {children}
      </div>

      <div className="mt-6 text-center animate-fade-up delay-200">
        {pie}
        <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)', opacity: 0.6 }}>
          © {new Date().getFullYear()} Central Inmobiliaria · Seventy Seven Studio
        </p>
      </div>
    </div>
  );
}

export function Encabezado({ titulo, texto }: { titulo: string; texto: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
        {titulo}
      </h2>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {texto}
      </p>
    </div>
  );
}
