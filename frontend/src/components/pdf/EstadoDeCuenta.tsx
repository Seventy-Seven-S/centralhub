import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ContratoDetalle, Cuota } from '@/hooks/useContratos';

// ── Paleta (idéntica a ReciboContrato) ───────────────────────────────────────
const C = { navy: '#0F1F3D', gold: '#C9972C', gray: '#6B7280', lightGray: '#F3F4F6', border: '#E5E7EB' };

const CUOTA_STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  PAGADA:    { bg: '#F0F9F4', color: '#166534', label: 'Pagada'    },
  PENDIENTE: { bg: '#F3F4F6', color: '#374151', label: 'Pendiente' },
  MORA:      { bg: '#FFF7ED', color: '#9A3412', label: 'En mora'   },
  VENCIDA:   { bg: '#FEF2F2', color: '#991B1B', label: 'Vencida'   },
};

// ── Estilos ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page:            { padding: 48, fontSize: 9, fontFamily: 'Helvetica', color: '#1F2937', backgroundColor: '#fff' },
  // Header
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, marginBottom: 16, borderBottomWidth: 2, borderBottomColor: C.navy },
  edcTitle:        { fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.navy, letterSpacing: 2 },
  edcNum:          { fontSize: 8, color: C.gray, marginTop: 4 },
  companyName:     { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right' },
  companyTagline:  { fontSize: 8, color: C.gray, textAlign: 'right', marginTop: 2 },
  goldBar:         { width: 40, height: 3, backgroundColor: C.gold, marginTop: 4, alignSelf: 'flex-end' },
  // Info boxes
  infoRow:         { flexDirection: 'row', gap: 8, marginBottom: 14 },
  infoBox:         { flex: 1, backgroundColor: C.lightGray, borderRadius: 4, padding: 10 },
  infoLabel:       { fontSize: 7, color: C.gray, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  infoValue:       { fontSize: 9, color: '#111827', fontFamily: 'Helvetica-Bold' },
  infoValueSub:    { fontSize: 8, color: '#374151', marginTop: 2 },
  // Resumen financiero
  summaryRow:      { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryBox:      { flex: 1, borderLeftWidth: 3, borderLeftColor: C.navy, paddingLeft: 10, paddingVertical: 8, backgroundColor: C.lightGray, borderRadius: 4 },
  summaryLabel:    { fontSize: 7, color: C.gray, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  summaryValue:    { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.navy },
  // Tabla
  sectionTitle:    { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 8 },
  contLabel:       { fontSize: 8, color: C.gray, marginBottom: 8 },
  table:           { borderWidth: 1, borderColor: C.border, borderRadius: 4, marginBottom: 12 },
  tableHeaderRow:  { flexDirection: 'row', backgroundColor: C.navy, padding: 8, borderRadius: 3 },
  tableHeaderCell: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  tableRow:        { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.border },
  colNum:          { flex: 0.5 },
  colVencimiento:  { flex: 2 },
  colMonto:        { flex: 1.5, alignItems: 'flex-end', paddingRight: 8 },
  colFechaPago:    { flex: 2, paddingLeft: 4 },
  colStatus:       { flex: 1.5 },
  // Resumen final
  finalBox:        { borderWidth: 1, borderColor: C.border, borderRadius: 4, padding: 12, marginBottom: 14 },
  finalTitle:      { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 8 },
  finalRow:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  finalLabel:      { fontSize: 8, color: C.gray },
  finalValue:      { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#111827' },
  // Footer
  footer:          { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText:      { fontSize: 7.5, color: C.gray, flex: 1 },
  footerBrand:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right' },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg = CUOTA_STATUS_CFG[status] ?? CUOTA_STATUS_CFG.PENDIENTE;
  return (
    <View style={{ backgroundColor: cfg.bg, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: cfg.color }}>{cfg.label}</Text>
    </View>
  );
}

function TableHeader() {
  return (
    <View style={s.tableHeaderRow}>
      <Text style={[s.tableHeaderCell, s.colNum]}>#</Text>
      <Text style={[s.tableHeaderCell, s.colVencimiento]}>Vencimiento</Text>
      <View style={s.colMonto}>
        <Text style={s.tableHeaderCell}>Monto</Text>
      </View>
      <Text style={[s.tableHeaderCell, s.colFechaPago]}>Fecha Pago</Text>
      <Text style={[s.tableHeaderCell, s.colStatus]}>Status</Text>
    </View>
  );
}

function CuotaRows({ rows }: { rows: Cuota[] }) {
  return (
    <>
      {rows.map((c, i) => (
        <View key={c.id} style={[s.tableRow, { backgroundColor: i % 2 === 0 ? '#fff' : C.lightGray }]}>
          <Text style={[{ fontSize: 8, color: C.gray }, s.colNum]}>{c.numeroCuota}</Text>
          <Text style={[{ fontSize: 8 }, s.colVencimiento]}>{fmtDateShort(c.fechaVencimiento)}</Text>
          <View style={s.colMonto}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>{fmt(c.montoEsperado)}</Text>
          </View>
          <Text style={[{ fontSize: 8, color: C.gray }, s.colFechaPago]}>
            {c.fechaPago ? fmtDateShort(c.fechaPago) : '—'}
          </Text>
          <View style={s.colStatus}>
            <StatusBadge status={c.status} />
          </View>
        </View>
      ))}
    </>
  );
}

function ResumenFinal({ cuotas, cuotasPagadas, cuotasVencidas, proximaCuota }: {
  cuotas:         Cuota[];
  cuotasPagadas:  number;
  cuotasVencidas: number;
  proximaCuota:   Cuota | undefined;
}) {
  return (
    <View style={s.finalBox}>
      <Text style={s.finalTitle}>RESUMEN</Text>
      <View style={s.finalRow}>
        <Text style={s.finalLabel}>Total cuotas pagadas</Text>
        <Text style={s.finalValue}>{cuotasPagadas} de {cuotas.length}</Text>
      </View>
      <View style={s.finalRow}>
        <Text style={s.finalLabel}>Cuotas vencidas</Text>
        <Text style={[s.finalValue, { color: cuotasVencidas > 0 ? '#DC2626' : '#111827' }]}>
          {cuotasVencidas}
        </Text>
      </View>
      <View style={s.finalRow}>
        <Text style={s.finalLabel}>Próxima cuota</Text>
        <Text style={s.finalValue}>
          {proximaCuota
            ? `#${proximaCuota.numeroCuota} — ${fmtDateShort(proximaCuota.fechaVencimiento)}`
            : 'Al corriente'}
        </Text>
      </View>
    </View>
  );
}

function Footer({ folio }: { folio?: string }) {
  return (
    <View style={s.footer}>
      <View style={s.footerText}>
        <Text>Av. Las Arboledas No. 84, Esq. con Maple, Fracc. Las Arboledas. 87448{'   '}|{'   '}Tel: 868 156 1069</Text>
        <Text style={{ fontSize: 7, color: C.gray, marginTop: 2 }}>
          Verifica en: centralinmob.com/verificar/{folio ?? '—'}
        </Text>
      </View>
      <Text style={s.footerBrand}>Central Inmobiliaria</Text>
    </View>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface EstadoDeCuentaProps {
  contrato:     ContratoDetalle;
  cuotas:       Cuota[];
  pagos:        Array<{ id: string; amount: number; paymentDate: string; concept: string; status: string }>;
  folio?:       string;
  contentHash?: string;
}

// ── Componente principal ──────────────────────────────────────────────────────
const PAGE_ROWS = 38;

export function EstadoDeCuenta({ contrato, cuotas, pagos, folio, contentHash }: EstadoDeCuentaProps) {
  const codigo        = contrato.codigoLegado ?? contrato.contractNumber;
  const clienteNombre = `${contrato.client.firstName} ${contrato.client.lastName}`;
  const lote          = contrato.lots?.[0]?.lot;
  const loteLabel     = lote ? `M${lote.manzana} L-${lote.lotNumber}` : '—';
  const loteArea      = lote ? `${lote.areaM2} m²` : '';

  const totalPagado   = pagos
    .filter(p => p.status === 'CONFIRMED')
    .reduce((sum, p) => sum + p.amount, 0);
  const saldo         = contrato.totalPrice - totalPagado;

  const cuotasPagadas  = cuotas.filter(c => c.status === 'PAGADA').length;
  const cuotasVencidas = cuotas.filter(c => c.status === 'MORA').length;
  const proximaCuota   = cuotas.find(c => c.status === 'PENDIENTE');

  // Paginar cuotas en bloques de PAGE_ROWS
  const chunks: Cuota[][] = [];
  for (let i = 0; i < cuotas.length; i += PAGE_ROWS) {
    chunks.push(cuotas.slice(i, i + PAGE_ROWS));
  }
  if (chunks.length === 0) chunks.push([]);

  return (
    <Document title={`Estado de Cuenta — ${codigo}`} author="Central Inmobiliaria">

      {/* ── Página 1: header + info + resumen + primera tabla ── */}
      <Page size="A4" style={s.page}>

        {/* HEADER */}
        <View style={s.header}>
          <View>
            <Text style={s.edcTitle}>ESTADO DE CUENTA</Text>
            <Text style={s.edcNum}>Contrato: {codigo}</Text>
            <Text style={s.edcNum}>Folio: {folio ?? '—'}</Text>
          </View>
          <View>
            <Text style={s.companyName}>Central Inmobiliaria</Text>
            <Text style={s.companyTagline}>Gestión Inmobiliaria de Confianza</Text>
            <View style={s.goldBar} />
          </View>
        </View>

        {/* INFO BOXES */}
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>CLIENTE</Text>
            <Text style={s.infoValue}>{clienteNombre}</Text>
            <Text style={s.infoValueSub}>Código: {codigo}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>PROYECTO</Text>
            <Text style={s.infoValue}>{contrato.project.name}</Text>
            <Text style={s.infoValueSub}>{contrato.project.code}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>LOTE</Text>
            <Text style={s.infoValue}>{loteLabel}</Text>
            <Text style={s.infoValueSub}>{loteArea}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>FECHA DE EMISIÓN</Text>
            <Text style={s.infoValue}>{fmtDate(new Date().toISOString())}</Text>
            <Text style={s.infoValueSub}>Válido al día de hoy</Text>
          </View>
        </View>

        {/* RESUMEN DEL CONTRATO */}
        <View style={s.summaryRow}>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>PRECIO TOTAL</Text>
            <Text style={s.summaryValue}>{fmt(contrato.totalPrice)}</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>TOTAL PAGADO</Text>
            <Text style={s.summaryValue}>{fmt(totalPagado)}</Text>
          </View>
          <View style={[s.summaryBox, { borderLeftColor: saldo > 0 ? '#DC2626' : '#16A34A' }]}>
            <Text style={s.summaryLabel}>SALDO PENDIENTE</Text>
            <Text style={[s.summaryValue, { color: saldo > 0 ? '#DC2626' : '#16A34A' }]}>
              {fmt(saldo)}
            </Text>
          </View>
        </View>

        {/* TABLA — primer bloque */}
        <Text style={s.sectionTitle}>Plan de Pagos</Text>
        <View style={s.table}>
          <TableHeader />
          <CuotaRows rows={chunks[0]} />
        </View>

        {chunks.length === 1 && (
          <ResumenFinal
            cuotas={cuotas}
            cuotasPagadas={cuotasPagadas}
            cuotasVencidas={cuotasVencidas}
            proximaCuota={proximaCuota}
          />
        )}

        {chunks.length === 1 && <Footer folio={folio} />}
      </Page>

      {/* ── Páginas adicionales ── */}
      {chunks.slice(1).map((chunk, pageIdx) => {
        const isLast = pageIdx === chunks.length - 2;
        return (
          <Page key={pageIdx} size="A4" style={s.page}>
            <Text style={s.contLabel}>Estado de Cuenta — {codigo} (continuación)</Text>
            <View style={s.table}>
              <TableHeader />
              <CuotaRows rows={chunk} />
            </View>
            {isLast && (
              <ResumenFinal
                cuotas={cuotas}
                cuotasPagadas={cuotasPagadas}
                cuotasVencidas={cuotasVencidas}
                proximaCuota={proximaCuota}
              />
            )}
            {isLast && <Footer folio={folio} />}
          </Page>
        );
      })}

    </Document>
  );
}

export default EstadoDeCuenta;
