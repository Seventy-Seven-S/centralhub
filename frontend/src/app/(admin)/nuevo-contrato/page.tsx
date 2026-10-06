'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronLeft, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useProyectos } from '@/hooks/useProyectos';
import { useLotes } from '@/hooks/useLotes';
import { useVendedores } from '@/hooks/useVendedores';
import { formatCurrency, todayLocalISO } from '@/lib/utils';
import api from '@/lib/api';
import { InputMoneda } from '@/components/ui/InputMoneda';
import { validarDatosDelCliente } from '@/lib/datosCliente';
import { PLAZOS_COMUNES, validarPlazo, etiquetaPlazo } from '@/lib/plazoContrato';
import { mesSiguienteA, fechaInicioDesdeMes } from '@/lib/mesPrimeraMensualidad';
import { precioDeLotes, resumenLotes, validarCotitulares, Cotitular } from '@/lib/contratoMultiLote';

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

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
  // Cotitulares: un lote puede comprarse entre dos o más personas. El modelo y
  // el endpoint ya existían; faltaba poder capturarlos al dar de alta.
  const [cotitulares,     setCotitulares]     = useState<Cotitular[]>([]);
  const [step2Error,      setStep2Error]      = useState('');

  // ── Paso 2: datos del contrato
  const [projectId,    setProjectId]    = useState('');
  // Varios lotes en un mismo contrato: el backend siempre lo aceptó, el
  // formulario era el que mandaba uno solo.
  const [lotIds,       setLotIds]       = useState<string[]>([]);
  const lotId = lotIds[0] ?? '';
  const [downPayment,  setDownPayment]  = useState(0);
  const [plazoTexto,   setPlazoTexto]   = useState('60');
  const plazo = Number(plazoTexto) || 0;
  // El calendario ancla en startDate y la cuota 1 vence un mes después. La
  // secretaria captura el MES de la primera mensualidad, que es como lo piensa,
  // y de ahí se deriva la fecha de inicio.
  const [mesPrimeraMensualidad, setMesPrimeraMensualidad] = useState(() => mesSiguienteA(todayLocalISO()));
  const fechaInicio = fechaInicioDesdeMes(mesPrimeraMensualidad, todayLocalISO());
  const [precioEditado, setPrecioEditado] = useState<number>(0);
  const [agentId,      setAgentId]      = useState('');
  // La comisión se captura en PESOS: el equipo acuerda el monto con el
  // vendedor, no la proporción, y con el porcentaje tenían que sacar la cuenta
  // al revés para llegar a la cifra pactada.
  const [comisionPesos, setComisionPesos] = useState(0);

  const { data: proyectos = [] } = useProyectos();
  const { data: todosLotes = [] } = useLotes(projectId);
  const { data: vendedores = [] } = useVendedores();

  const lotesDisponibles = useMemo(
    () => todosLotes.filter(l => l.status === 'AVAILABLE' || l.status === 'RESERVED'),
    [todosLotes]
  );

  const lotesSeleccionados = useMemo(
    () => lotIds.map(id => lotesDisponibles.find(l => l.id === id)).filter(Boolean) as typeof lotesDisponibles,
    [lotesDisponibles, lotIds]
  );
  // El primero manda para lo que solo aplica a un lote: el depósito de apartado
  // y el asesor que lo apartó.
  const loteSeleccionado = lotesSeleccionados[0] ?? null;

  const proyectoSeleccionado = useMemo(
    () => proyectos.find(p => p.id === projectId) ?? null,
    [proyectos, projectId]
  );

  // El precio propuesto es la SUMA de los lotes elegidos; sigue siendo editable.
  useEffect(() => {
    setPrecioEditado(precioDeLotes(lotesSeleccionados));
  }, [lotesSeleccionados]);

  // Herencia visible del asesor del apartado ("yo aparto, yo cobro"): al
  // elegir/cambiar de lote, precarga el select con quien lo apartó. Si el
  // usuario ya había tocado el select para OTRO lote, esto lo sobreescribe
  // a propósito — cambiar de lote es un apartado distinto, con su propio
  // "quién lo apartó"; el humano ve el nuevo precargado y decide de nuevo
  // (confirma o cambia). El backend también hereda como red de seguridad
  // aunque este efecto fallara — ver finalAgentId en contract.service.ts.
  useEffect(() => {
    setAgentId(loteSeleccionado?.reservedByAgentId ?? '');
  }, [loteSeleccionado]);

  // Si varios lotes traían apartado, cuentan todos.
  const totalDeposit    = lotesSeleccionados.reduce((s, l) => s + (l.reservationDeposit ?? 0), 0);
  const totalUpfront    = totalDeposit + downPayment;
  const saldoFinanciado = Math.max(0, precioEditado - totalUpfront);
  const mensualidad     = plazo > 0 ? saldoFinanciado / plazo : 0;
  const comisionMonto   = comisionPesos > 0 ? comisionPesos : 0;
  // Solo para enseñar a qué proporción equivale lo que tecleó.
  const comisionPct     = precioEditado > 0 ? (comisionMonto * 100) / precioEditado : 0;

  // ── Navegación entre pasos
  function goNext() {
    if (step === 1) {
      const problema = validarDatosDelCliente({ firstName, lastName, phone, email })
        ?? validarCotitulares(cotitulares);
      if (problema) { setStep1Error(problema); return; }
      setStep1Error('');
    }
    if (step === 2) {
      // El plazo dejó de ser un menú cerrado, así que ahora hay que validarlo.
      const problema = validarPlazo(plazoTexto);
      if (problema) { setStep2Error(problema); return; }
      setStep2Error('');
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
        lotIds,
        totalPrice:    precioEditado,
        downPayment,
        financedAmount: saldoFinanciado,
        interestRate:  0,
        termMonths:    plazo,
        // installmentAmount lo calcula el backend (RF1.3) — mensualidad
        // arriba solo se usa para el preview visual del wizard, ya no se envía.
        startDate:     new Date(fechaInicio + 'T12:00:00'),
        // null explícito (no undefined): una vez que hay lote seleccionado
        // el select ya viene precargado/decidido — "sin asesor" consciente
        // debe distinguirse de "nunca se mandó nada" para que el backend no
        // reimponga la herencia sobre una elección explícita de vaciarlo.
        agentId:       agentId || null,
        commissionAmount: agentId && comisionPesos > 0 ? comisionPesos : undefined,
      });

      const contractId = contractRes.data.data.id;

      // 4. Cotitulares. Van después porque tienen su propio endpoint. Si alguno
      // falla NO se tumba el alta: el contrato ya existe y perderlo por un
      // cotitular sería peor — se avisa y se puede agregar desde la ficha.
      const fallidos: string[] = [];
      for (const c of cotitulares) {
        try {
          await api.post(`/contracts/${contractId}/coowners`, {
            firstName: c.firstName.trim(),
            lastName: c.lastName.trim(),
            ine: c.ine.trim(),
            estadoCivil: c.estadoCivil?.trim() || undefined,
            lugarNacimiento: c.lugarNacimiento?.trim() || undefined,
            isPrimary: false,
          });
        } catch {
          fallidos.push(`${c.firstName} ${c.lastName}`.trim());
        }
      }
      if (fallidos.length) {
        setSubmitError(`El contrato se creó, pero no se pudieron guardar estos titulares: ${fallidos.join(', ')}. Agrégalos desde la ficha del contrato.`);
        setLoading(false);
        return;
      }

      router.push(`/contratos/${contractId}`);
    } catch (err: any) {
      const apiError = err?.response?.data;
      if (apiError?.code === 'TOTAL_UPFRONT_EXCEEDS_PRICE') {
        // Mostrar mensaje accionable del backend SIN resetear el form.
        // El usuario puede volver al paso 2, ajustar el enganche y reintentar.
        setSubmitError(apiError.message);
        return;
      }
      setSubmitError(apiError?.message || err.message || 'Error al generar el contrato');
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
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {email.trim()
                  ? 'Recibirá su comprobante por correo en cada pago'
                  : 'Opcional. Sin correo no se le podrán enviar sus comprobantes de pago'}
              </p>
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

          {/* Cotitulares — quienes firman el contrato junto al titular */}
          <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Otros titulares {cotitulares.length > 0 && `(${cotitulares.length})`}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Si el lote se compra entre dos o más personas
                </p>
              </div>
              <button type="button"
                      onClick={() => setCotitulares(c => [...c, { firstName: '', lastName: '', ine: '', estadoCivil: '', lugarNacimiento: '' }])}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg"
                      style={{ backgroundColor: 'var(--accent-pale)', color: 'var(--accent)' }}>
                + Agregar titular
              </button>
            </div>

            {cotitulares.map((c, i) => (
              <div key={i} className="rounded-xl p-3 mb-2" style={{ border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Titular {i + 2}</span>
                  <button type="button" onClick={() => setCotitulares(cs => cs.filter((_, j) => j !== i))}
                          className="text-xs underline" style={{ color: 'var(--danger)' }}>quitar</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    ['Nombre(s)', 'firstName'], ['Apellidos', 'lastName'],
                    ['INE', 'ine'], ['Estado civil', 'estadoCivil'], ['Lugar de nacimiento', 'lugarNacimiento'],
                  ] as const).map(([etq, campo]) => (
                    <input key={campo} style={inputStyle} type="text" placeholder={etq}
                           value={(c as any)[campo] ?? ''}
                           onChange={e => setCotitulares(cs => cs.map((x, j) => j === i ? { ...x, [campo]: e.target.value } : x))} />
                  ))}
                </div>
              </div>
            ))}
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
                onChange={e => { setProjectId(e.target.value); setLotIds([]); }}
              >
                <option value="">— Seleccionar proyecto —</option>
                {proyectos.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                ))}
              </select>
            </Field>

            {/* Un contrato puede llevar varios lotes: el cliente compra dos o
                tres juntos y se cobran como uno solo. */}
            <Field label={lotIds.length > 1 ? `Lotes (${lotIds.length})` : 'Lote'} required>
              <select
                style={inputStyle}
                value=""
                onChange={e => { if (e.target.value) setLotIds(ids => [...ids, e.target.value]); }}
                disabled={!projectId}
              >
                <option value="">
                  {lotIds.length ? '— Agregar otro lote —' : '— Seleccionar lote —'}
                </option>
                {lotesDisponibles.filter(l => !lotIds.includes(l.id)).map(l => (
                  <option key={l.id} value={l.id}>
                    M{l.manzana} L-{l.lotNumber} · {l.areaM2.toFixed(0)}m² · {formatCurrency(l.currentPrice)}
                    {l.status === 'RESERVED' ? ' (Apartado)' : ''}
                  </option>
                ))}
              </select>

              {lotesSeleccionados.length > 0 && (
                <div className="mt-2 space-y-1">
                  {lotesSeleccionados.map(l => (
                    <div key={l.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm"
                         style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      <span style={{ color: 'var(--text-primary)' }}>
                        M{l.manzana} L-{l.lotNumber}
                        <span style={{ color: 'var(--text-tertiary)' }}> · {formatCurrency(l.currentPrice)}</span>
                      </span>
                      <button type="button" onClick={() => setLotIds(ids => ids.filter(x => x !== l.id))}
                              className="text-xs underline" style={{ color: 'var(--danger)' }}>quitar</button>
                    </div>
                  ))}
                  {lotesSeleccionados.length > 1 && (
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {lotesSeleccionados.length} lotes en un solo contrato · suman {formatCurrency(precioDeLotes(lotesSeleccionados))}
                    </p>
                  )}
                </div>
              )}
            </Field>

            {loteSeleccionado && (loteSeleccionado.reservationDeposit ?? 0) > 0 && (
              <div
                className="rounded-xl p-4 mb-4 border-l-4 sm:col-span-2"
                style={{
                  backgroundColor: 'var(--gold-pale)',
                  borderColor: 'var(--gold)',
                }}
              >
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  <strong>Depósito de apartado registrado:</strong> este lote tiene{' '}
                  <strong>{formatCurrency(loteSeleccionado.reservationDeposit ?? 0)}</strong> registrado el{' '}
                  {formatDate(loteSeleccionado.reservedAt)}. Quedará registrado como pago al formalizar el
                  contrato, <strong>separado del enganche</strong> que captures abajo.
                </p>
              </div>
            )}

            <Field label="Enganche al firmar">
              <InputMoneda
                style={inputStyle}
                valor={downPayment === 0 ? '' : String(downPayment)}
                onValorChange={v => setDownPayment(Number(v) || 0)}
                placeholder="Monto que cobrarás al firmar"
              />
            </Field>

            {/* El plazo se escribe: el menú cerrado de 60/72/84 no cabía la
                realidad (JSA 1 vende a 2 y a 4 años) y forzaba capturas malas. */}
            <Field label="Plazo (meses)" required>
              <input
                style={inputStyle}
                type="text"
                inputMode="numeric"
                value={plazoTexto}
                onChange={e => setPlazoTexto(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="Ej: 24"
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {PLAZOS_COMUNES.map(m => (
                  <button key={m} type="button" onClick={() => setPlazoTexto(String(m))}
                          className="px-2 py-1 text-xs rounded-lg transition"
                          style={{
                            border: '1px solid var(--border)',
                            backgroundColor: plazo === m ? 'var(--accent-pale)' : 'transparent',
                            color: plazo === m ? 'var(--accent)' : 'var(--text-secondary)',
                          }}>
                    {m}
                  </button>
                ))}
              </div>
              {plazo > 0 && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{etiquetaPlazo(plazo)}</p>
              )}
            </Field>

            {/* Lo que la secretaria piensa es "¿en qué mes le toca su primera
                mensualidad?", no una fecha de inicio: la cuota 1 cae un mes
                DESPUÉS de esa fecha y nadie lo veía. Después del día 20 le dan
                al cliente la opción de arrancar el mes siguiente. */}
            <Field label="Mes de la primera mensualidad" required>
              <input
                style={inputStyle}
                type="month"
                value={mesPrimeraMensualidad}
                onChange={e => setMesPrimeraMensualidad(e.target.value)}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Su cuota 1 quedará en este mes
              </p>
            </Field>
          </div>

          {/* Calculados */}
          {loteSeleccionado && (
            <div className="mt-5 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
                 style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div>
                <p style={labelStyle}>Precio del lote</p>
                <input
                  type="text"
                  value={
                    precioEditado === 0
                      ? ''
                      : new Intl.NumberFormat('es-MX', {
                          style: 'currency',
                          currency: 'MXN',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        }).format(precioEditado)
                  }
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setPrecioEditado(raw ? Number(raw) : 0);
                  }}
                  className="w-full text-base font-bold bg-transparent border-b outline-none"
                  style={{ color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                  placeholder="$0"
                />
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

          {/* Vendedor + comisión (opcional) */}
          <div className="mt-5 rounded-xl p-4"
               style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-tertiary)' }}>
              Vendedor y comisión <span style={{ textTransform: 'none', fontWeight: 400 }}>(opcional)</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Vendedor">
                <select
                  style={inputStyle}
                  value={agentId}
                  onChange={e => { setAgentId(e.target.value); if (!e.target.value) setComisionPesos(0); }}
                >
                  <option value="">— Sin asignar —</option>
                  {vendedores.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.firstName} {v.lastName} · {v.role === 'MANAGER' ? 'Gerente' : 'Agente'}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Comisión del vendedor">
                <InputMoneda
                  style={inputStyle}
                  valor={comisionPesos === 0 ? '' : String(comisionPesos)}
                  onValorChange={v => setComisionPesos(Number(v) || 0)}
                  placeholder="Lo que le toca al vendedor"
                />
              </Field>
            </div>

            {agentId && comisionPesos <= 0 && (
              <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
                Asignaste un vendedor. Captura su comisión en pesos para registrarla; si la dejas
                en cero, el contrato se crea sin comisión.
              </p>
            )}
            {agentId && comisionPesos > 0 && (
              <p className="text-sm font-semibold mt-3" style={{ color: 'var(--accent)' }}>
                Comisión: {formatCurrency(comisionMonto)}
                <span className="font-normal" style={{ color: 'var(--text-secondary)' }}>
                  {' '}(equivale al {comisionPct.toFixed(2)}% de {formatCurrency(precioEditado)})
                </span>
              </p>
            )}
          </div>

          {step2Error && (
            <p className="mt-4 text-sm px-4 py-2.5 rounded-xl"
               style={{ backgroundColor: 'var(--danger-pale)', color: 'var(--danger)' }}>
              {step2Error}
            </p>
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
                ...(cotitulares.length ? [{ label: cotitulares.length > 1 ? 'Otros titulares' : 'Otro titular',
                    value: cotitulares.map(c => `${c.firstName} ${c.lastName}`.trim()).join(', ') }] : []),
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
                { label: lotesSeleccionados.length > 1 ? 'Lotes' : 'Lote', value: resumenLotes(lotesSeleccionados) },
                { label: 'Superficie',  value: lotesSeleccionados.length ? `${lotesSeleccionados.reduce((a, l) => a + l.areaM2, 0).toFixed(2)} m²` : '' },
                { label: 'Precio',      value: formatCurrency(precioEditado) },
              ]}
            />
            <SummaryCard
              title="Condiciones financieras"
              rows={[
                { label: 'Enganche al firmar', value: formatCurrency(downPayment) },
                { label: 'Saldo',              value: formatCurrency(saldoFinanciado) },
                { label: 'Plazo',              value: etiquetaPlazo(plazo) },
                { label: 'Mensualidad',        value: formatCurrency(mensualidad) },
                // Ojo: el mes es el de la PRIMERA CUOTA, no el de fechaInicio,
                // que va un mes antes por cómo se arma el calendario.
                { label: 'Primera mensualidad', value: new Date(mesPrimeraMensualidad + '-01T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase()) },
                ...(agentId && comisionMonto > 0
                  ? [{ label: 'Comisión del vendedor', value: formatCurrency(comisionMonto) }]
                  : []),
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
