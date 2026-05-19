'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronLeft, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useProyectos } from '@/hooks/useProyectos';
import { useLotes } from '@/hooks/useLotes';
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/api';

// ── Shared styles ─────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '12px',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: '6px',
};

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>
        {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ ...labelStyle }}>{label}</p>
      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{value || '—'}</p>
    </div>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ current }: { current: number }) {
  const steps = ['Datos del cliente', 'Datos del contrato', 'Confirmación'];
  return (
    <div className="flex items-center mb-8">
      {steps.map((label, i) => {
        const num = i + 1;
        const done = num < current;
        const active = num === current;
        return (
          <div key={i} className="flex items-center" style={{ flex: i < steps.length - 1 ? 1 : undefined }}>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all"
                style={{
                  backgroundColor: done || active ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: done || active ? '#fff' : 'var(--text-tertiary)',
                }}
              >
                {done ? <Check className="w-4 h-4" /> : num}
              </div>
              <span
                className="text-sm font-medium hidden sm:block"
                style={{ color: active ? 'var(--accent)' : done ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="flex-1 h-px mx-3"
                style={{ backgroundColor: done ? 'var(--accent)' : 'var(--border)' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step card wrapper ─────────────────────────────────────────────────────────
function StepCard({
  title, subtitle, children,
}: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl shadow-sm p-6" style={{ backgroundColor: 'var(--surface)' }}>
      <div className="mb-6">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────
function SummaryCard({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-tertiary)' }}>{title}</p>
      <div className="space-y-2">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex justify-between items-baseline gap-4">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span className="text-sm font-medium text-right" style={{ color: 'var(--text-primary)' }}>{value || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NuevoContratoPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ── Paso 1: datos del cliente
  const [firstName,       setFirstName]       = useState('');
  const [lastName,        setLastName]        = useState('');
  const [phone,           setPhone]           = useState('');
  const [email,           setEmail]           = useState('');
  const [ine,             setIne]             = useState('');
  const [curp,            setCurp]            = useState('');
  const [estadoCivil,     setEstadoCivil]     = useState('');
  const [lugarNacimiento, setLugarNacimiento] = useState('');
  const [address,         setAddress]         = useState('');
  const [city,            setCity]            = useState('');
  const [state,           setState]           = useState('');
  const [step1Error,      setStep1Error]      = useState('');

  // ── Paso 2: datos del contrato
  const [projectId,    setProjectId]    = useState('');
  const [lotId,        setLotId]        = useState('');
  const [downPayment,  setDownPayment]  = useState(0);
  const [plazo,        setPlazo]        = useState(60);
  const [fechaInicio,  setFechaInicio]  = useState(() => new Date().toISOString().split('T')[0]);

  const { data: proyectos = [] } = useProyectos();
  const { data: todosLotes = [] } = useLotes(projectId);

  const lotesDisponibles = useMemo(
    () => todosLotes.filter(l => l.status === 'AVAILABLE' || l.status === 'RESERVED'),
    [todosLotes]
  );

  const loteSeleccionado = useMemo(
    () => lotesDisponibles.find(l => l.id === lotId) ?? null,
    [lotesDisponibles, lotId]
  );

  const proyectoSeleccionado = useMemo(
    () => proyectos.find(p => p.id === projectId) ?? null,
    [proyectos, projectId]
  );

  const precioLote      = loteSeleccionado?.currentPrice ?? 0;
  const saldoFinanciado = Math.max(0, precioLote - downPayment);
  const mensualidad     = plazo > 0 ? saldoFinanciado / plazo : 0;

  // ── Navegación entre pasos
  function goNext() {
    if (step === 1) {
      if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
        setStep1Error('Nombre, apellidos y teléfono son obligatorios.');
        return;
      }
      setStep1Error('');
    }
    setStep(s => s + 1);
  }

  function goBack() {
    setSubmitError('');
    setStep(s => s - 1);
  }

  // ── Submit
  async function handleSubmit() {
    setLoading(true);
    setSubmitError('');
    try {
      // 1. Crear cliente
      const clientRes = await api.post('/clients', {
        firstName, lastName, email: email || undefined, phone, projectId,
      });
      const clientId = clientRes.data.data.client.id;

      // 2. Actualizar campos adicionales del cliente
      await api.put(`/clients/${clientId}`, {
        ine:             ine             || undefined,
        curp:            curp            || undefined,
        estadoCivil:     estadoCivil     || undefined,
        lugarNacimiento: lugarNacimiento || undefined,
        address:         address         || undefined,
        city:            city            || undefined,
        state:           state           || undefined,
      });

      // 3. Crear contrato
      const contractRes = await api.post('/contracts', {
        clientId,
        projectId,
        lotIds:        [lotId],
        downPayment,
        financedAmount: saldoFinanciado,
        interestRate:  0,
        termMonths:    plazo,
        monthlyPayment: Math.round(mensualidad * 100) / 100,
        startDate:     new Date(fechaInicio + 'T12:00:00'),
      });

      const contractId = contractRes.data.data.id;
      router.push(`/contratos/${contractId}`);
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || err.message || 'Error al generar el contrato');
    } finally {
      setLoading(false);
    }
  }

  // ── Render
  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Nuevo Contrato</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Registro en ventanilla — captura los datos del cliente con INE en mano
        </p>
      </div>

      <Stepper current={step} />

      {/* ── PASO 1 ── */}
      {step === 1 && (
        <StepCard
          title="Datos del cliente"
          subtitle="Ingresa los datos del cliente tal como aparecen en su INE"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nombre" required>
              <input style={inputStyle} type="text" value={firstName}
                onChange={e => setFirstName(e.target.value)} placeholder="Ej: Juan" />
            </Field>
            <Field label="Apellidos" required>
              <input style={inputStyle} type="text" value={lastName}
                onChange={e => setLastName(e.target.value)} placeholder="Ej: García López" />
            </Field>
            <Field label="Teléfono" required>
              <input style={inputStyle} type="tel" value={phone}
                onChange={e => setPhone(e.target.value)} placeholder="8681234567" />
            </Field>
            <Field label="Email">
              <input style={inputStyle} type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
            </Field>
            <Field label="INE">
              <input style={inputStyle} type="text" value={ine}
                onChange={e => setIne(e.target.value)} placeholder="Número de INE" />
            </Field>
            <Field label="CURP">
              <input style={inputStyle} type="text" value={curp}
                onChange={e => setCurp(e.target.value.toUpperCase())} placeholder="XXXX000000XXXXXX00" />
            </Field>
            <Field label="Estado civil">
              <select style={inputStyle} value={estadoCivil} onChange={e => setEstadoCivil(e.target.value)}>
                <option value="">— Seleccionar —</option>
                <option value="Soltero">Soltero</option>
                <option value="Casado">Casado</option>
                <option value="Divorciado">Divorciado</option>
                <option value="Viudo">Viudo</option>
                <option value="Unión libre">Unión libre</option>
              </select>
            </Field>
            <Field label="Lugar de nacimiento">
              <input style={inputStyle} type="text" value={lugarNacimiento}
                onChange={e => setLugarNacimiento(e.target.value)} placeholder="Ciudad, Estado" />
            </Field>
            <Field label="Domicilio">
              <input style={inputStyle} type="text" value={address}
                onChange={e => setAddress(e.target.value)} placeholder="Calle, número" />
            </Field>
            <Field label="Ciudad">
              <input style={inputStyle} type="text" value={city}
                onChange={e => setCity(e.target.value)} placeholder="Ciudad" />
            </Field>
            <Field label="Estado">
              <input style={inputStyle} type="text" value={state}
                onChange={e => setState(e.target.value)} placeholder="Estado" />
            </Field>
          </div>

          {step1Error && (
            <div className="flex items-center gap-2 mt-4 text-sm" style={{ color: 'var(--danger)' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {step1Error}
            </div>
          )}

          <div className="flex justify-end mt-6">
            <button
              onClick={goNext}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </StepCard>
      )}

      {/* ── PASO 2 ── */}
      {step === 2 && (
        <StepCard
          title="Datos del contrato"
          subtitle="Selecciona el proyecto, lote y condiciones del financiamiento"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Proyecto" required>
              <select
                style={inputStyle}
                value={projectId}
                onChange={e => { setProjectId(e.target.value); setLotId(''); }}
              >
                <option value="">— Seleccionar proyecto —</option>
                {proyectos.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                ))}
              </select>
            </Field>

            <Field label="Lote" required>
              <select
                style={inputStyle}
                value={lotId}
                onChange={e => setLotId(e.target.value)}
                disabled={!projectId}
              >
                <option value="">— Seleccionar lote —</option>
                {lotesDisponibles.map(l => (
                  <option key={l.id} value={l.id}>
                    M{l.manzana} L-{l.lotNumber} · {l.areaM2.toFixed(0)}m² · {formatCurrency(l.currentPrice)}
                    {l.status === 'RESERVED' ? ' (Apartado)' : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Enganche">
              <input
                style={inputStyle}
                type="text"
                inputMode="numeric"
                value={downPayment === 0 ? '' : downPayment.toString()}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  setDownPayment(raw === '' ? 0 : parseInt(raw, 10));
                }}
                placeholder="0"
              />
            </Field>

            <Field label="Plazo">
              <select style={inputStyle} value={plazo} onChange={e => setPlazo(Number(e.target.value))}>
                <option value={60}>60 meses (5 años)</option>
                <option value={72}>72 meses (6 años)</option>
                <option value={84}>84 meses (7 años)</option>
              </select>
            </Field>

            <Field label="Fecha de inicio">
              <input
                style={inputStyle}
                type="date"
                value={fechaInicio}
                onChange={e => setFechaInicio(e.target.value)}
              />
            </Field>
          </div>

          {/* Calculados */}
          {loteSeleccionado && (
            <div className="mt-5 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
                 style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div>
                <p style={labelStyle}>Precio del lote</p>
                <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  {formatCurrency(precioLote)}
                </p>
              </div>
              <div>
                <p style={labelStyle}>Saldo financiado</p>
                <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  {formatCurrency(saldoFinanciado)}
                </p>
              </div>
              <div>
                <p style={labelStyle}>Mensualidad estimada</p>
                <p className="text-base font-bold" style={{ color: 'var(--accent)' }}>
                  {formatCurrency(mensualidad)}
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-6">
            <button
              onClick={goBack}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-secondary)' }}
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <button
              onClick={goNext}
              disabled={!projectId || !lotId}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </StepCard>
      )}

      {/* ── PASO 3 ── */}
      {step === 3 && (
        <StepCard
          title="Confirmar registro"
          subtitle="Revisa los datos antes de generar el contrato"
        >
          <div className="space-y-4">
            <SummaryCard
              title="Datos del cliente"
              rows={[
                { label: 'Nombre completo', value: `${firstName} ${lastName}` },
                { label: 'Teléfono',        value: phone },
                { label: 'Email',           value: email },
                { label: 'INE',             value: ine },
                { label: 'Estado civil',    value: estadoCivil },
              ]}
            />
            <SummaryCard
              title="Datos del inmueble"
              rows={[
                { label: 'Proyecto',    value: proyectoSeleccionado ? `${proyectoSeleccionado.name} (${proyectoSeleccionado.code})` : '' },
                { label: 'Lote',        value: loteSeleccionado ? `M${loteSeleccionado.manzana} L-${loteSeleccionado.lotNumber}` : '' },
                { label: 'Superficie',  value: loteSeleccionado ? `${loteSeleccionado.areaM2.toFixed(2)} m²` : '' },
                { label: 'Precio',      value: formatCurrency(precioLote) },
              ]}
            />
            <SummaryCard
              title="Condiciones financieras"
              rows={[
                { label: 'Enganche',     value: formatCurrency(downPayment) },
                { label: 'Saldo',        value: formatCurrency(saldoFinanciado) },
                { label: 'Plazo',        value: `${plazo} meses` },
                { label: 'Mensualidad',  value: formatCurrency(mensualidad) },
                { label: 'Fecha inicio', value: new Date(fechaInicio + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) },
              ]}
            />
          </div>

          {submitError && (
            <div className="flex items-start gap-2 mt-4 p-3 rounded-xl text-sm"
                 style={{ backgroundColor: 'var(--danger-pale)', color: 'var(--danger)' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {submitError}
            </div>
          )}

          <div className="flex justify-between mt-6">
            <button
              onClick={goBack}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
              style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-secondary)' }}
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
                : <><Check className="w-4 h-4" /> Generar contrato</>}
            </button>
          </div>
        </StepCard>
      )}

    </div>
  );
}
