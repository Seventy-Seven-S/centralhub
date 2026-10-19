'use client';

import { use, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, AlertCircle, FileText, DollarSign,
  Calendar, CheckCircle2, Clock, XCircle, FileDown,
  Upload, ExternalLink, CreditCard, ChevronDown, ChevronUp,
  ArrowRightLeft, Pencil, History, Split,
} from 'lucide-react';
import {
  useContratoById, useCuotasByContrato, usePagosByContrato,
  Cuota,
} from '@/hooks/useContratos';
import { PagarCuotaModal } from '@/components/contratos/PagarCuotaModal';
import { RescindirContratoModal } from '@/components/contratos/RescindirContratoModal';
import { TraspasarContratoModal } from '@/components/contratos/TraspasarContratoModal';
import { EditarDatosContratoModal } from '@/components/contratos/EditarDatosContratoModal';
import { SepararLoteModal } from '@/components/contratos/SepararLoteModal';
import { HistorialTraspasos } from '@/components/contratos/HistorialTraspasos';
import { MenuAcciones, AccionMenu } from '@/components/ui/MenuAcciones';
import { useRole } from '@/hooks/useRole';
import { useCambiosContrato } from '@/hooks/useCambiosContrato';
import { nombreDeCampo, valorLegible } from '@/lib/cambiosContrato';
import { puedeRescindir } from '@/lib/rescision';
import api from '@/lib/api';
import { formatCurrency, formatDate, formatLotsLabel } from '@/lib/utils';
import { PDFDownloadLink, pdf } from '@react-pdf/renderer';
import { ContratoCompraventa } from '@/components/pdf/ContratoCompraventa';
import { EstadoDeCuenta } from '@/components/pdf/EstadoDeCuenta';
import { ReciboContrato } from '@/components/pdf/ReciboContrato';
import { abrirReciboComision } from '@/components/pdf/ReciboComision';
import { buildValidacionUrl, buildQrDataUri } from '@/components/pdf/reciboHelpers';
import { reciboPropsDesdeLog, reciboPropsDesdePago } from '@/lib/reimpresion';
import { resumenPagado } from '@/lib/resumenPagado';
import type { ErrorApi } from '@/lib/errorApi';

// ── Status maps ───────────────────────────────────────────────────────────────
const CONTRACT_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  ACTIVE:    { label: 'Activo',     bg: 'var(--accent-pale)',  color: 'var(--accent)' },
  IN_MORA:   { label: 'En mora',    bg: 'var(--danger-pale)',  color: 'var(--danger)' },
  DRAFT:     { label: 'Borrador',   bg: 'var(--bg-tertiary)',  color: 'var(--text-secondary)' },
  SIGNED:    { label: 'Firmado',    bg: 'var(--accent-pale)',  color: 'var(--accent)' },
  COMPLETED: { label: 'Completado', bg: 'var(--accent-pale)',  color: 'var(--accent)' },
  CANCELED:  { label: 'Cancelado',  bg: 'var(--danger-pale)',  color: 'var(--danger)' },
  RESCISSION: { label: 'Rescindido', bg: 'var(--danger-pale)', color: 'var(--danger)' },
};

const CUOTA_STATUS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  PAGADA:    { label: 'Pagada',    icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'var(--accent)' },
  PENDIENTE: { label: 'Pendiente', icon: <Clock className="w-3.5 h-3.5" />,        color: 'var(--text-secondary)' },
  MORA:      { label: 'En mora',   icon: <XCircle className="w-3.5 h-3.5" />,      color: 'var(--danger)' },
};

const PAYMENT_TYPE: Record<string, string> = {
  ENGANCHE:            'Enganche',
  MENSUALIDAD:         'Mensualidad',
  ABONO:               'Abono',
  LIQUIDACION:         'Liquidación',
  OTRO:                'Otro',
  DOWN_PAYMENT:        'Enganche',
  RESERVATION_DEPOSIT: 'Depósito de apartado',
  INSTALLMENT:         'Mensualidad',
  PARTIAL_PAYMENT:     'Abono parcial',
  FULL_PAYMENT:        'Liquidación total',
  LATE_FEE:            'Recargo por mora',
  DISCOUNT:            'Descuento',
};

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonDetalle() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
      <div className="rounded-2xl p-6 shadow-sm space-y-4" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="h-6 w-40 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />)}
        </div>
      </div>
      <div className="rounded-2xl p-6 shadow-sm space-y-3" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="h-5 w-32 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        {[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />)}
      </div>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = CONTRACT_STATUS[status] ?? { label: status, bg: 'var(--bg-tertiary)', color: 'var(--text-secondary)' };
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ContratoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router     = useRouter();
  const queryClient = useQueryClient();
  // Recién dado de alta con comisión: se ofrece imprimir el recibo del asesor.
  const reciboComision = useSearchParams().get('reciboComision');
  const [imprimiendoComision, setImprimiendoComision] = useState(false);

  const { data: contrato, isLoading: loadingContrato, isError: errorContrato } = useContratoById(id);
  const { data: cuotas   = [], isLoading: loadingCuotas } = useCuotasByContrato(id);
  const { data: pagos    = [], isLoading: loadingPagos }  = usePagosByContrato(id);
  // El historial llega colapsado: hay clientes con decenas de movimientos y la
  // lista completa empuja todo lo demás fuera de la pantalla.
  const [historialAbierto, setHistorialAbierto] = useState<boolean>(false);
  const { data: cambios  = [] } = useCambiosContrato(id);
  const { role } = useRole();
  const esAdmin = role === 'ADMIN';

  const fileInputRef           = useRef<HTMLInputElement>(null);
  const [uploading, setUploading]   = useState(false);
  const [activating, setActivating] = useState(false);
  const [openingSigned, setOpeningSigned] = useState(false);
  const [rescindiendo, setRescindiendo] = useState(false);
  const [traspasando, setTraspasando]   = useState(false);
  const [openingRescision, setOpeningRescision] = useState(false);
  const [editando, setEditando] = useState(false);
  const [separando, setSeparando] = useState(false);

  const [reimprimiendo, setReimprimiendo] = useState<string | null>(null);

  // Reimpresión: mismo folio y QR que el recibo original (snapshot del
  // ReciboLog). Si el pago no tiene recibo emitido (migrado), se arma desde
  // el pago, sin QR de validación.
  async function handleReimprimir(pago: { id: string; amount: number; paymentDate: string; concept: string; balanceAfter: number | null }) {
    if (!contrato) return;
    setReimprimiendo(pago.id);
    try {
      let props; let qrDataUri: string | undefined;
      try {
        const { data } = await api.get(`/payments/${pago.id}/recibo`);
        props = reciboPropsDesdeLog(data.data);
        qrDataUri = await buildQrDataUri(buildValidacionUrl(data.data.id));
      } catch (caught) {
        const err = caught as ErrorApi;
        if (err?.response?.status !== 404) throw err;
        // Los pagos migrados no traen balanceAfter; el saldo se deriva de
        // los pagos confirmados del contrato en vez de salir en cero.
        props = reciboPropsDesdePago(
          pago,
          cuotas,
          { totalPrice: contrato.totalPrice ?? 0 },
          pagos.filter(p => p.status === 'CONFIRMED'),
        );
      }
      const cuotaBase = cuotas.find(c => c.numeroCuota === props.cuota.numeroCuota);
      const blob = await pdf(
        <ReciboContrato
          contrato={contrato}
          cuota={{ ...(cuotaBase ?? { id: '', contractId: id, montoEsperado: 0, montoPagado: null, fechaVencimiento: '', fechaPago: null, status: 'PAGADA' as const }), ...props.cuota }}
          pago={props.pago}
          balanceDespues={props.balanceDespues}
          qrDataUri={qrDataUri}
        />
      ).toBlob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) {
      console.error(err);
      alert('No se pudo generar el recibo.');
    } finally {
      setReimprimiendo(null);
    }
  }

  async function handleVerRescision() {
    setOpeningRescision(true);
    try {
      const res = await api.get(`/contracts/${id}/rescission-file`, { responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch (err) {
      console.error(err);
      alert('No se pudo abrir el documento de rescisión.');
    } finally {
      setOpeningRescision(false);
    }
  }

  // El PDF firmado se sirve con RBAC desde el storage privado (no URL pública)
  async function handleVerFirmado() {
    setOpeningSigned(true);
    try {
      const res = await api.get(`/contracts/${id}/signed-file`, { responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch (err) {
      console.error(err);
      alert('No se pudo abrir el contrato firmado.');
    } finally {
      setOpeningSigned(false);
    }
  }

  async function handleActivate() {
    if (!window.confirm('¿Activar este contrato manualmente, sin requerir el PDF firmado?')) return;
    setActivating(true);
    try {
      await api.patch(`/contracts/${id}/activate`);
      await queryClient.invalidateQueries({ queryKey: ['contratos', id] });
    } catch (err) {
      console.error(err);
      alert('No se pudo activar el contrato.');
    } finally {
      setActivating(false);
    }
  }

  async function handleUploadSigned(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/contracts/${id}/upload-signed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body: form,
      });
      if (!res.ok) throw new Error('Error al subir el archivo');
      await queryClient.invalidateQueries({ queryKey: ['contratos', id] });
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const [selectedCuota, setSelectedCuota] = useState<Cuota | null>(null);
  const [showAllCuotas, setShowAllCuotas] = useState(false);

  const hoy = new Date();

  if (loadingContrato) return <SkeletonDetalle />;

  if (errorContrato || !contrato) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Contrato no encontrado</p>
        <button onClick={() => router.back()} className="text-sm text-blue-600 hover:underline">
          Volver
        </button>
      </div>
    );
  }

  const totalPrice  = contrato.totalPrice ?? 0;
  const balance     = contrato.balance ?? 0;
  // Lo pagado sale de los PAGOS, no de restar el balance: al rescindir, el
  // balance se pone en cero porque ya no se debe nada, y esa resta concluía
  // que el cliente había pagado el terreno completo.
  const { pagado, pct: pctPagado, contratoTerminado } =
    resumenPagado({ totalPrice, balance, status: contrato.status }, pagos);
  const fullName    = `${contrato.client.firstName} ${contrato.client.lastName}`;
  const loteLabel   = formatLotsLabel(contrato.lots);

  // Las acciones del contrato, para el menú. Se arman aquí y no en el JSX para
  // que las condiciones de cuándo aparece cada una se lean de corrido.
  const accionesDelContrato: AccionMenu[] = [
    esAdmin && {
      label: 'Corregir datos del contrato',
      icono: <Pencil size={16} />,
      onClick: () => setEditando(true),
    },
    contrato.status !== 'ACTIVE' && puedeRescindir(contrato.status) && {
      label: 'Activar contrato',
      icono: <CheckCircle2 size={16} />,
      onClick: handleActivate,
      disabled: activating,
      cargando: activating ? 'Activando…' : undefined,
    },
    contrato.status === 'DRAFT' && {
      label: 'Subir contrato firmado',
      icono: <Upload size={16} />,
      onClick: () => fileInputRef.current?.click(),
      disabled: uploading,
      cargando: uploading ? 'Subiendo…' : undefined,
    },
    contrato.status !== 'DRAFT' && contrato.contractFileUrl && {
      label: 'Ver contrato firmado',
      icono: <ExternalLink size={16} />,
      onClick: handleVerFirmado,
      disabled: openingSigned,
      cargando: openingSigned ? 'Abriendo…' : undefined,
    },
    contrato.status === 'RESCISSION' && contrato.rescissionFileUrl && {
      label: 'Ver documento de rescisión',
      icono: <ExternalLink size={16} />,
      onClick: handleVerRescision,
      disabled: openingRescision,
      cargando: openingRescision ? 'Abriendo…' : undefined,
    },
    puedeRescindir(contrato.status) && (contrato.lots ?? []).length > 1 && {
      label: 'Separar un lote',
      icono: <Split size={16} />,
      onClick: () => setSeparando(true),
    },
    puedeRescindir(contrato.status) && {
      label: 'Traspasar contrato',
      icono: <ArrowRightLeft size={16} />,
      onClick: () => setTraspasando(true),
    },
    puedeRescindir(contrato.status) && {
      label: 'Rescindir contrato',
      icono: <XCircle size={16} />,
      onClick: () => setRescindiendo(true),
      peligrosa: true,
    },
  ].filter(Boolean) as AccionMenu[];

  const CUOTAS_INITIAL = 12;
  const cuotasToShow   = showAllCuotas ? cuotas : cuotas.slice(0, CUOTAS_INITIAL);

  return (
    <>
      {selectedCuota && contrato && (
        <PagarCuotaModal
          cuota={selectedCuota}
          contrato={contrato}
          onClose={() => setSelectedCuota(null)}
        />
      )}

      {rescindiendo && contrato && (
        <RescindirContratoModal
          contratoId={id}
          etiqueta={contrato.codigoLegado ?? contrato.contractNumber}
          onClose={() => setRescindiendo(false)}
          onDone={async () => {
            setRescindiendo(false);
            await queryClient.invalidateQueries({ queryKey: ['contratos', id] });
            await queryClient.invalidateQueries({ queryKey: ['cuotas', id] });
          }}
        />
      )}

      {separando && contrato && (
        <SepararLoteModal
          contratoId={id}
          etiqueta={contrato.codigoLegado ?? contrato.contractNumber}
          onClose={() => setSeparando(false)}
          onDone={async () => {
            setSeparando(false);
            await queryClient.invalidateQueries({ queryKey: ['contratos'] });
            await queryClient.invalidateQueries({ queryKey: ['cuotas', id] });
            await queryClient.invalidateQueries({ queryKey: ['pagos', id] });
          }}
        />
      )}

      {editando && contrato && (
        <EditarDatosContratoModal
          contratoId={id}
          etiqueta={contrato.codigoLegado ?? contrato.contractNumber}
          projectId={contrato.project.id}
          actual={{
            totalPrice: contrato.totalPrice ?? 0,
            installmentAmount: contrato.installmentAmount ?? null,
            installmentCount: contrato.installmentCount ?? null,
            startDate: contrato.startDate ?? null,
            lotIds: (contrato.lots ?? []).map(l => l.lot.id),
          }}
          // Lo pagado sale de sus pagos confirmados, no del balance: el balance
          // puede venir arrastrado, los pagos son hechos.
          pagado={pagos.filter(p => p.status === 'CONFIRMED').reduce((s, p) => s + p.amount, 0)}
          onClose={() => setEditando(false)}
          onDone={async () => {
            setEditando(false);
            await queryClient.invalidateQueries({ queryKey: ['contratos'] });
            await queryClient.invalidateQueries({ queryKey: ['cuotas', id] });
            await queryClient.invalidateQueries({ queryKey: ['contratos', id, 'cambios'] });
          }}
        />
      )}

      {traspasando && contrato && (
        <TraspasarContratoModal
          contratoId={id}
          etiqueta={contrato.codigoLegado ?? contrato.contractNumber}
          clienteActual={`${contrato.client.firstName} ${contrato.client.lastName}`}
          projectIdActual={contrato.project.id}
          lotIdsActuales={(contrato.lots ?? []).map(l => l.lot.id)}
          // Lo abonado sale de sus pagos confirmados, no del balance: el
          // balance puede venir arrastrado, los pagos son hechos.
          abonado={pagos.filter(p => p.status === 'CONFIRMED').reduce((s, p) => s + p.amount, 0)}
          onClose={() => setTraspasando(false)}
          onDone={async () => {
            setTraspasando(false);
            await queryClient.invalidateQueries({ queryKey: ['contratos'] });
            await queryClient.invalidateQueries({ queryKey: ['cuotas', id] });
            await queryClient.invalidateQueries({ queryKey: ['lotes'] });
          }}
        />
      )}

      <div className="space-y-5">

        {reciboComision && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm"
               style={{ backgroundColor: 'var(--accent-pale, var(--bg-secondary))', border: '1px solid var(--accent)' }}>
            <span style={{ color: 'var(--text-primary)' }}>
              La comisión del asesor quedó registrada en Gastos. Imprime su recibo para que lo firme.
            </span>
            <div className="flex gap-2">
              <button
                disabled={imprimiendoComision}
                onClick={async () => {
                  setImprimiendoComision(true);
                  try {
                    await abrirReciboComision(reciboComision, contrato ? `${contrato.client.firstName} ${contrato.client.lastName}` : undefined);
                  } finally { setImprimiendoComision(false); }
                }}
                className="rounded-lg px-3 py-1.5 font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: 'var(--accent)' }}>
                {imprimiendoComision ? 'Generando…' : 'Imprimir recibo del asesor'}
              </button>
              <button onClick={() => router.replace(`/contratos/${id}`)}
                className="rounded-lg px-3 py-1.5" style={{ color: 'var(--text-secondary)' }}>
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* SECCIÓN 1 — Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-9 h-9 rounded-xl shadow-sm transition"
            style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}
          >
            <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                {contrato.codigoLegado ?? contrato.contractNumber}
              </h2>
              <StatusBadge status={contrato.status} />
              {contrato.moraMonthsCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: 'var(--danger-pale)', color: 'var(--danger)' }}>
                  <AlertCircle className="w-3 h-3" />
                  {contrato.moraMonthsCount} mes{contrato.moraMonthsCount > 1 ? 'es' : ''} en mora
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <button
                onClick={() => router.push(`/clientes/${contrato.client.id}`)}
                className="text-sm text-blue-600 hover:underline font-medium"
              >
                {fullName}
              </button>
              <span style={{ color: 'var(--border)' }}>·</span>
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{contrato.project.name}</span>
              <span style={{ color: 'var(--border)' }}>·</span>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {loteLabel}
              </span>
            </div>
          </div>

          {/* Input file oculto para upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleUploadSigned}
          />

          {/* Las acciones viven en un menú: antes eran diez botones en fila y
              ahogaban la información que la secretaria necesita de un golpe.
              Los dos PDF se quedan fuera porque PDFDownloadLink necesita
              montarse para generar el archivo. */}
          <div className="hidden sm:flex items-center gap-2">
            <PDFDownloadLink
              document={<EstadoDeCuenta contrato={contrato} cuotas={cuotas} pagos={pagos} />}
              fileName={`estado-cuenta-${contrato.codigoLegado ?? contrato.contractNumber}.pdf`}
            >
              {({ loading }) => (
                <button
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    backgroundColor: 'var(--surface)', color: 'var(--accent)',
                    border: '1px solid var(--accent)',
                    opacity: loading ? 0.7 : 1, cursor: loading ? 'wait' : 'pointer',
                  }}
                >
                  <FileDown size={16} />
                  {loading ? 'Generando…' : 'Estado de cuenta'}
                </button>
              )}
            </PDFDownloadLink>

            <PDFDownloadLink
              document={<ContratoCompraventa contrato={contrato} cuotas={cuotas} showWatermark={contrato.status !== 'ACTIVE'} />}
              fileName={`contrato-${contrato.codigoLegado ?? contrato.contractNumber}.pdf`}
            >
              {({ loading }) => (
                <button
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    backgroundColor: 'var(--accent)', color: 'white',
                    opacity: loading ? 0.7 : 1, cursor: loading ? 'wait' : 'pointer',
                  }}
                >
                  <FileDown size={16} />
                  {loading ? 'Generando…' : 'Contrato'}
                </button>
              )}
            </PDFDownloadLink>
          </div>

          <MenuAcciones acciones={accionesDelContrato} />
        </div>

        {/* SECCIÓN 2 — Resumen financiero */}
        <div className="rounded-2xl p-6 shadow-sm space-y-5" style={{ backgroundColor: 'var(--surface)' }}>
          <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <DollarSign className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            Resumen Financiero
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Precio total */}
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Precio total</p>
              <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalPrice)}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Enganche: {contrato.downPayment != null ? formatCurrency(contrato.downPayment) : '—'}
              </p>
            </div>

            {/* Balance pendiente. En un contrato rescindido o cancelado el cero
                significa que se anuló, no que se liquidó: pintarlo de verde lo
                haría parecer un contrato pagado. */}
            <div className="p-4 rounded-xl"
                 style={{ backgroundColor: contratoTerminado ? 'var(--bg-secondary)' : balance > 0 ? 'var(--danger-pale)' : 'var(--accent-pale)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
                {contratoTerminado && balance === 0 ? 'Ya no se cobra' : 'Balance pendiente'}
              </p>
              <p className="text-xl font-bold"
                 style={{ color: contratoTerminado ? 'var(--text-secondary)' : balance > 0 ? 'var(--danger)' : 'var(--accent)' }}>
                {formatCurrency(balance)}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Pagado: {formatCurrency(pagado)}
              </p>
            </div>

            {/* Mensualidad */}
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Mensualidad</p>
              <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {contrato.installmentAmount != null ? formatCurrency(contrato.installmentAmount) : '—'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {contrato.installmentCount} meses
              </p>
            </div>
          </div>

          {/* Barra de progreso. En un contrato terminado no es avance hacia
              nada: es cuánto alcanzó a cubrir el cliente antes de cerrarse. */}
          <div>
            <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              <span>{contratoTerminado ? `Alcanzó a pagar ${pctPagado}%` : `${pctPagado}% pagado`}</span>
              <span>{formatCurrency(pagado)} de {formatCurrency(totalPrice)}</span>
            </div>
            <div className="w-full rounded-full h-2.5" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <div
                className="h-2.5 rounded-full transition-all duration-500"
                style={{
                  width: `${pctPagado}%`,
                  backgroundColor: contratoTerminado
                    ? 'var(--text-tertiary)'
                    : pctPagado >= 100 ? 'var(--accent)' : 'var(--gold)',
                }}
              />
            </div>
          </div>
        </div>


        {/* SECCIÓN 2B — Datos del contrato (editables por ADMIN) */}
        <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Datos del contrato</h3>
            </div>
            {esAdmin && (
              <button
                onClick={() => setEditando(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition hover:opacity-80"
                style={{ backgroundColor: 'var(--accent-pale)', color: 'var(--accent)' }}
              >
                <Pencil size={14} /> Corregir
              </button>
            )}
          </div>
          <dl className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            {[
              ['Manzana y lote', loteLabel],
              ['Precio total', formatCurrency(totalPrice)],
              ['Mensualidad', contrato.installmentAmount ? formatCurrency(contrato.installmentAmount) : '—'],
              ['Plazo', contrato.installmentCount ? `${contrato.installmentCount} meses` : '—'],
              ['Enganche', formatCurrency(contrato.downPayment ?? 0)],
              ['Primera mensualidad', cuotas[0]?.mes ?? '—'],
              ['Fecha de contrato', contrato.contractDate ? formatDate(contrato.contractDate) : '—'],
              ['Proyecto', contrato.project.name],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{k}</dt>
                <dd className="text-sm font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* SECCIÓN 3 — Tabla de cuotas */}
        <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Plan de pagos
                {!loadingCuotas && (
                  <span className="font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>({cuotas.length} cuotas)</span>
                )}
              </h3>
            </div>
            {contrato.moraMonthsCount > 0 && (
              <span className="text-xs font-medium px-2 py-1 rounded-full"
                    style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-pale)' }}>
                {contrato.moraMonthsCount} vencidas
              </span>
            )}
          </div>

          {loadingCuotas ? (
            <div>
              {[...Array(6)].map((_, i) => (
                <div key={i} className="px-6 py-3 animate-pulse">
                  <div className="h-4 rounded w-3/4" style={{ backgroundColor: 'var(--bg-secondary)' }} />
                </div>
              ))}
            </div>
          ) : cuotas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Calendar className="w-8 h-8" style={{ color: 'var(--bg-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Sin cuotas registradas</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                      <th className="text-left px-5 py-3 font-semibold text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>#</th>
                      <th className="text-left px-5 py-3 font-semibold text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Mes</th>
                      <th className="text-left px-5 py-3 font-semibold text-xs whitespace-nowrap hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>Vencimiento</th>
                      <th className="text-right px-5 py-3 font-semibold text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Esperado</th>
                      <th className="text-right px-5 py-3 font-semibold text-xs whitespace-nowrap hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>Pagado</th>
                      <th className="text-center px-5 py-3 font-semibold text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Estado</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {cuotasToShow.map(cuota => {
                      const vencida = cuota.status === 'PENDIENTE' && new Date(cuota.fechaVencimiento) < hoy;
                      const st      = CUOTA_STATUS[cuota.status];

                      return (
                        <tr
                          key={cuota.id}
                          className="transition-colors"
                          style={{
                            borderBottom: '1px solid var(--border)',
                            backgroundColor: vencida ? 'rgba(var(--danger-rgb, 192,80,80), 0.05)' : undefined,
                          }}
                        >
                          <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{cuota.numeroCuota}</td>
                          <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{cuota.mes}</td>
                          <td className="px-5 py-3 whitespace-nowrap hidden sm:table-cell">
                            <span style={{ color: vencida ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: vencida ? 600 : undefined }}>
                              {formatDate(cuota.fechaVencimiento)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                            {formatCurrency(cuota.montoEsperado)}
                          </td>
                          <td className="px-5 py-3 text-right whitespace-nowrap hidden sm:table-cell">
                            {cuota.montoPagado != null
                              ? <span className="font-medium" style={{ color: 'var(--accent)' }}>{formatCurrency(cuota.montoPagado)}</span>
                              : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className="inline-flex items-center gap-1 text-xs font-medium"
                                  style={{ color: st?.color }}>
                              {st?.icon}
                              {st?.label ?? cuota.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            {cuota.status !== 'PAGADA' && (
                              <button
                                onClick={() => setSelectedCuota(cuota)}
                                className="text-xs px-2.5 py-1 rounded-lg font-medium text-white transition-opacity hover:opacity-80"
                                style={{ backgroundColor: 'var(--accent)' }}
                              >
                                Pagar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {cuotas.length > CUOTAS_INITIAL && (
                <button
                  onClick={() => setShowAllCuotas(v => !v)}
                  className="w-full py-3 text-sm flex items-center justify-center gap-1.5 transition"
                  style={{ borderTop: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                >
                  {showAllCuotas ? (
                    <><ChevronUp className="w-4 h-4" /> Ver menos</>
                  ) : (
                    <><ChevronDown className="w-4 h-4" /> Ver las {cuotas.length - CUOTAS_INITIAL} cuotas restantes</>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* SECCIÓN 4 — Historial de pagos */}
        <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
          <button
            type="button"
            onClick={() => setHistorialAbierto(a => !a)}
            className="w-full px-6 py-4 flex items-center gap-2 text-left transition-colors hover:opacity-80"
            style={{ borderBottom: historialAbierto ? '1px solid var(--border)' : 'none' }}
            aria-expanded={historialAbierto}
          >
            <CreditCard className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              Historial de pagos
              {!loadingPagos && (
                <span className="font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>({pagos.length})</span>
              )}
            </h3>
            <ChevronDown
              className="w-4 h-4 ml-auto flex-shrink-0 transition-transform"
              style={{ color: 'var(--text-tertiary)', transform: historialAbierto ? 'rotate(180deg)' : 'none' }}
            />
          </button>

          {!historialAbierto ? null : loadingPagos ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-secondary)' }} />
              ))}
            </div>
          ) : pagos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <CreditCard className="w-8 h-8" style={{ color: 'var(--bg-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Sin pagos registrados</p>
            </div>
          ) : (
            <div>
              {pagos.map(pago => (
                <div key={pago.id} className="flex items-center justify-between px-6 py-3.5 transition-colors hover:bg-[var(--bg-secondary)]"
                     style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                         style={{ backgroundColor: 'var(--accent-pale)' }}>
                      <DollarSign className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{pago.concept}</p>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {PAYMENT_TYPE[pago.paymentType] ?? pago.paymentType}
                        {' · '}
                        {formatDate(pago.paymentDate)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: 'var(--accent)' }}>{formatCurrency(pago.amount)}</p>
                      {pago.balanceAfter != null && (
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Saldo: {formatCurrency(pago.balanceAfter)}</p>
                      )}
                    </div>
                    {pago.paymentType === 'INSTALLMENT' && (
                      <button
                        onClick={() => handleReimprimir(pago)}
                        disabled={reimprimiendo === pago.id}
                        title="Reimprimir recibo"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
                        style={{ border: '1px solid var(--accent)', color: 'var(--accent)', backgroundColor: 'var(--surface)' }}
                      >
                        <FileDown size={14} />
                        {reimprimiendo === pago.id ? 'Generando…' : 'Recibo'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>


        {/* De quién viene este contrato, junto al historial de cambios:
            las dos cosas responden a "qué le ha pasado a este contrato". */}
        <HistorialTraspasos
          traspasos={[
            ...(contrato.traspasosOrigen ?? []),
            ...(contrato.traspasosDestino ?? []),
          ]}
        />

        {/* SECCIÓN 6 — Historial de cambios */}
        {cambios.length > 0 && (
          <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
            <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <History className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Historial de cambios
                <span className="font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>({cambios.length})</span>
              </h3>
            </div>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {cambios.map(c => (
                <li key={c.id} className="px-6 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{nombreDeCampo(c.campo)}</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>{valorLegible(c.campo, c.valorAnterior)}</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>&rarr;</span>
                    <span className="font-medium" style={{ color: 'var(--accent)' }}>{valorLegible(c.campo, c.valorNuevo)}</span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{c.motivo}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {c.user.firstName} {c.user.lastName} &middot; {formatDate(c.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* SECCIÓN 5 — Botón PDF (móvil) */}
        <div className="sm:hidden">
          <PDFDownloadLink
            document={
              <ContratoCompraventa
                contrato={contrato}
                cuotas={cuotas}
                showWatermark={contrato.status !== 'ACTIVE'}
              />
            }
            fileName={`contrato-${contrato.codigoLegado ?? contrato.contractNumber}.pdf`}
          >
            {({ loading }) => (
              <button
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'white',
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                <FileDown size={16} />
                {loading ? 'Generando...' : 'Descargar Contrato PDF'}
              </button>
            )}
          </PDFDownloadLink>
        </div>

      </div>
    </>
  );
}
