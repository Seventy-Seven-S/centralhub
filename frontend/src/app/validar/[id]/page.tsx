'use client';

// Página PÚBLICA de validación de recibos — a propósito NO vive dentro de
// (admin) ni ningún grupo con guard de sesión (ver AdminLayout), así que
// cualquiera con el QR del recibo puede abrirla sin login. Solo muestra el
// snapshot inmutable guardado al emitir el recibo (GET /verificar/recibo/:id,
// también público) — nunca datos en vivo del contrato/cliente.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface ReciboValidado {
  valid: true;
  folio: string;
  cliente: string;
  codigoLegado: string | null;
  proyecto: string;
  lote: string | null;
  cuota: number;
  mes: string;
  monto: number;
  fecha: string;
  concepto: string;
  emitidoEn: string;
}

const C = { beige: '#F0EDE8', forest: '#0D2818', forestMid: '#1A3A2A', gold: '#C9972C', greenPale: '#A8C5B0', textSecondary: '#6B7C74', border: '#E5EDE5' };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function ValidarReciboPage() {
  const params = useParams<{ id: string }>();
  const [estado, setEstado] = useState<'cargando' | 'valido' | 'invalido'>('cargando');
  const [recibo, setRecibo] = useState<ReciboValidado | null>(null);

  useEffect(() => {
    let cancelado = false;
    api.get(`/verificar/recibo/${params.id}`)
      .then(({ data }) => {
        if (cancelado) return;
        if (data?.valid) { setRecibo(data); setEstado('valido'); }
        else setEstado('invalido');
      })
      .catch(() => { if (!cancelado) setEstado('invalido'); });
    return () => { cancelado = true; };
  }, [params.id]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.beige, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 440, backgroundColor: '#fff', borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>

        <div style={{ backgroundColor: C.forestMid, padding: '28px 32px', textAlign: 'center' }}>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Central Inmobiliaria</p>
          <h1 style={{ margin: '4px 0 0', color: '#fff', fontSize: 22, fontWeight: 800 }}>Validación de recibo</h1>
        </div>

        <div style={{ padding: '32px' }}>
          {estado === 'cargando' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0', color: C.textSecondary }}>
              <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
              <p style={{ margin: 0, fontSize: 14 }}>Verificando…</p>
            </div>
          )}

          {estado === 'invalido' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '16px 0' }}>
              <XCircle size={44} color="#DC2626" />
              <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#DC2626' }}>Recibo no encontrado</p>
              <p style={{ margin: 0, fontSize: 13, color: C.textSecondary, textAlign: 'center' }}>
                Este código no corresponde a ningún recibo emitido por Central Inmobiliaria.
              </p>
            </div>
          )}

          {estado === 'valido' && recibo && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                <CheckCircle2 size={44} color={C.gold} />
                <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.forest }}>Recibo auténtico</p>
                <p style={{ margin: 0, fontSize: 12, color: C.textSecondary, letterSpacing: '0.05em' }}>{recibo.folio}</p>
              </div>

              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <Row label="Cliente" value={recibo.cliente} />
                <Row label="Código" value={recibo.codigoLegado ?? '—'} alt />
                <Row label="Proyecto" value={recibo.proyecto} />
                {recibo.lote && <Row label="Lote" value={recibo.lote} alt />}
                <Row label="Cuota" value={`#${recibo.cuota} — ${recibo.mes}`} />
                <Row label="Fecha de pago" value={fmtDate(recibo.fecha)} alt />
                <Row label="Concepto" value={recibo.concepto} />
                <Row label="Monto" value={formatCurrency(recibo.monto)} alt strong />
              </div>

              <p style={{ margin: '16px 0 0', fontSize: 11, color: C.textSecondary, textAlign: 'center' }}>
                Emitido el {fmtDate(recibo.emitidoEn)}
              </p>
            </div>
          )}
        </div>

        <div style={{ backgroundColor: C.forest, padding: '14px 32px', textAlign: 'center' }}>
          <p style={{ margin: 0, color: C.greenPale, fontSize: 10 }}>C. Dieciséis 530, San Francisco, 87350 Heroica Matamoros, Tamps.</p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, alt, strong }: { label: string; value: string; alt?: boolean; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', backgroundColor: alt ? '#F7F9F7' : '#fff', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 12, color: C.textSecondary }}>{label}</span>
      <span style={{ fontSize: 13, color: C.forest, fontWeight: strong ? 800 : 700 }}>{value}</span>
    </div>
  );
}
