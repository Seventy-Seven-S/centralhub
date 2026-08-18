'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useTheme } from '@/app/providers';

type Step = 'credentials' | 'verify';

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ── Logo mark ─────────────────────────────────────────────────────────────────
function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: 'var(--accent)' }}
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

// ── Step dots ─────────────────────────────────────────────────────────────────
function StepDots({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-1.5 mb-7">
      {(['credentials', 'verify'] as Step[]).map(s => (
        <div
          key={s}
          className="rounded-full transition-all duration-300"
          style={{
            width:  s === step ? 20 : 6,
            height: 6,
            backgroundColor: s === step ? 'var(--accent)' : 'var(--border-2)',
          }}
        />
      ))}
    </div>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
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
          e.currentTarget.style.borderColor = 'var(--accent)';
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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const router     = useRouter();
  const loginStore = useAuthStore((s) => s.login);
  const { theme, toggle } = useTheme();

  const [step,     setStep]     = useState<Step>('credentials');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [code,     setCode]     = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      console.log('Login response:', JSON.stringify(data));

      if (data.status === 'success' && data.data?.accessToken) {
        const { accessToken, refreshToken, user } = data.data;
        loginStore(accessToken, {
          id:    user.id,
          email: user.email,
          name:  `${user.firstName} ${user.lastName}`,
          role:  user.role,
        }, refreshToken);
        document.cookie = `auth_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}`;
        document.cookie = `user_role=${user.role}; path=/; max-age=${60 * 60 * 24 * 7}`;
        router.push(user.role === 'CLIENT' ? '/mis-contratos' : '/dashboard');
        return;
      }

      setStep('verify');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Credenciales incorrectas.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/verify-2fa', { email, code });
      const { accessToken, refreshToken, user } = data.data;

      loginStore(accessToken, {
        id:    user.id,
        email: user.email,
        name:  `${user.firstName} ${user.lastName}`,
        role:  user.role,
      }, refreshToken);

      document.cookie = `auth_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}`;
      document.cookie = `user_role=${user.role}; path=/; max-age=${60 * 60 * 24 * 7}`;

      router.push(user.role === 'CLIENT' ? '/mis-contratos' : '/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Código incorrecto o expirado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10 relative"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Theme toggle */}
      <button
        onClick={toggle}
        className="absolute top-5 right-5 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
          boxShadow: 'var(--shadow-sm)',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        aria-label="Toggle theme"
      >
        {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </button>

      {/* Logo */}
      <div className="flex flex-col items-center mb-8 animate-fade-up">
        <LogoMark size={48} />
        <h1
          className="mt-3 text-xl font-bold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          CentralHub
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Central Inmobiliaria
        </p>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-[400px] rounded-2xl p-8 animate-fade-up delay-100"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <StepDots step={step} />

        {/* ── Credenciales ── */}
        {step === 'credentials' && (
          <>
            <div className="mb-7">
              <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                Bienvenido de vuelta
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Ingresa tus credenciales para acceder
              </p>
            </div>

            <form onSubmit={handleCredentials} className="space-y-4">
              <Input
                label="Correo electrónico"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@empresa.com"
              />
              <Input
                label="Contraseña"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
              />

              {error && (
                <p
                  className="text-xs px-3.5 py-2.5 rounded-lg"
                  style={{ backgroundColor: 'var(--danger-pale)', color: 'var(--danger)' }}
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                style={{ backgroundColor: 'var(--accent)' }}
                onMouseEnter={e => { if (!loading) (e.currentTarget.style.backgroundColor = 'var(--accent-hover)'); }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--accent)'; }}
              >
                {loading ? <><Spinner /> Enviando código...</> : 'Continuar'}
              </button>
            </form>
          </>
        )}

        {/* ── Verificación 2FA ── */}
        {step === 'verify' && (
          <>
            <div className="mb-7">
              <button
                onClick={() => { setStep('credentials'); setCode(''); setError(''); }}
                className="flex items-center gap-1.5 text-xs font-medium mb-4 transition-colors duration-150"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Volver
              </button>
              <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                Verificación
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Código enviado a{' '}
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{email}</span>
              </p>
            </div>

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label
                  className="block text-xs font-semibold mb-1.5"
                  style={{ color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
                >
                  Código de 6 dígitos
                </label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full rounded-xl px-4 py-3.5 text-3xl font-bold text-center outline-none transition-all duration-200"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1.5px solid var(--border)',
                    color: 'var(--text-primary)',
                    letterSpacing: '0.4em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.backgroundColor = 'var(--surface)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                  }}
                />
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
                  Válido por 10 minutos
                </p>
              </div>

              {error && (
                <p
                  className="text-xs px-3.5 py-2.5 rounded-lg"
                  style={{ backgroundColor: 'var(--danger-pale)', color: 'var(--danger)' }}
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                style={{ backgroundColor: 'var(--accent)' }}
                onMouseEnter={e => { if (!loading) (e.currentTarget.style.backgroundColor = 'var(--accent-hover)'); }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--accent)'; }}
              >
                {loading ? <><Spinner /> Verificando...</> : 'Verificar código'}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 text-center animate-fade-up delay-200">
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          ¿Eres cliente?{' '}
          <Link
            href="/portal"
            className="font-medium transition-colors duration-150"
            style={{ color: 'var(--accent)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-hover)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--accent)')}
          >
            Accede al portal
          </Link>
        </p>
        <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)', opacity: 0.6 }}>
          © {new Date().getFullYear()} Central Inmobiliaria · Seventy Seven Studio
        </p>
      </div>
    </div>
  );
}
