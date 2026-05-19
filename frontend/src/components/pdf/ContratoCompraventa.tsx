import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ContratoDetalle, CoOwner, Cuota } from '@/hooks/useContratos';

const C = { navy: '#0F1F3D', gold: '#C9972C', gray: '#6B7280', lightGray: '#F3F4F6', border: '#E5E7EB' };

const CUOTA_STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  PAGADA:    { bg: '#F0F9F4', color: '#166534', label: 'Pagada'    },
  PENDIENTE: { bg: '#F3F4F6', color: '#374151', label: 'Pendiente' },
  MORA:      { bg: '#FFF7ED', color: '#9A3412', label: 'En mora'   },
};

const CLAUSULAS = [
  {
    num:  '1. OBJETO DEL CONTRATO',
    text: 'EL VENDEDOR SE OBLIGA A TRANSFERIR AL COMPRADOR LA PROPIEDAD DEL INMUEBLE DESCRITO EN LA CLÁUSULA ANTERIOR, LIBRE DE TODO GRAVAMEN.',
  },
  {
    num:  '2. PRECIO Y FORMA DE PAGO',
    text: 'EL PRECIO TOTAL PACTADO ES EL INDICADO EN ESTE CONTRATO, PAGADERO EN LAS MENSUALIDADES SEÑALADAS EN LA TABLA DE AMORTIZACIÓN ADJUNTA.',
  },
  {
    num:  '3. MORA',
    text: 'EN CASO DE ATRASO EN EL PAGO DE 3 O MÁS MENSUALIDADES CONSECUTIVAS, EL COMPRADOR ENTRARÁ EN UN PERÍODO DE GRACIA DE 3 MESES ADICIONALES. SI PERSISTE EL INCUMPLIMIENTO, EL VENDEDOR PODRÁ RESCINDIR EL CONTRATO.',
  },
  {
    num:  '4. CANCELACIÓN',
    text: 'EN CASO DE CANCELACIÓN POR PARTE DEL COMPRADOR, SE RETENDRÁ EL 10% DEL TOTAL PAGADO COMO PENALIZACIÓN, RESTITUYENDO EL RESTO EN UN PLAZO DE 30 DÍAS HÁBILES.',
  },
  {
    num:  '5. JURISDICCIÓN',
    text: 'PARA LA INTERPRETACIÓN Y CUMPLIMIENTO DEL PRESENTE CONTRATO, LAS PARTES SE SOMETEN A LAS LEYES Y TRIBUNALES DEL ESTADO DE TAMAULIPAS.',
  },
];

const s = StyleSheet.create({
  page:            { padding: 48, fontSize: 9, fontFamily: 'Helvetica', color: '#1F2937', backgroundColor: '#fff' },
  // Header
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, marginBottom: 16, borderBottomWidth: 2, borderBottomColor: C.navy },
  contratoTitle:   { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.navy },
  contratoNum:     { fontSize: 8, color: C.gray, marginTop: 4 },
  companyName:     { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right' },
  companyTagline:  { fontSize: 8, color: C.gray, textAlign: 'right', marginTop: 2 },
  goldBar:         { width: 40, height: 3, backgroundColor: C.gold, marginTop: 4, alignSelf: 'flex-end' },
  // Section titles
  sectionTitle:    { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 8 },
  contLabel:       { fontSize: 8, color: C.gray, marginBottom: 8 },
  // Info boxes
  infoRow:         { flexDirection: 'row', gap: 8, marginBottom: 10 },
  infoBox:         { flex: 1, backgroundColor: C.lightGray, borderRadius: 4, padding: 10 },
  infoLabel:       { fontSize: 7, color: C.gray, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  infoValue:       { fontSize: 9, color: '#111827', fontFamily: 'Helvetica-Bold' },
  infoValueSub:    { fontSize: 8, color: '#374151', marginTop: 2 },
  // Vendor box (left border navy)
  vendorBox:       { borderLeftWidth: 3, borderLeftColor: C.navy, paddingLeft: 12, paddingVertical: 10, backgroundColor: C.lightGray, borderRadius: 4, marginBottom: 14 },
  vendorName:      { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 4 },
  vendorDetail:    { fontSize: 8, color: '#374151', marginBottom: 2 },
  // Table
  table:           { borderWidth: 1, borderColor: C.border, borderRadius: 4, marginBottom: 12 },
  tableHeaderRow:  { flexDirection: 'row', backgroundColor: C.navy, padding: 8, borderRadius: 3 },
  tableHeaderCell: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  tableRow:        { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.border },
  colNum:          { flex: 0.5 },
  colVencimiento:  { flex: 2.5 },
  colMonto:        { flex: 2, alignItems: 'flex-end', paddingRight: 8 },
  colStatus:       { flex: 2 },
  // Clauses
  clausesBox:      { borderWidth: 1, borderColor: C.border, borderRadius: 4, padding: 12, marginBottom: 16 },
  clausesTitle:    { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 10 },
  clauseRow:       { marginBottom: 8 },
  clauseNum:       { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 2 },
  clauseText:      { fontSize: 7.5, color: '#4B5563', lineHeight: 1.5 },
  // Signatures
  signaturesRow:   { flexDirection: 'row', gap: 60, marginBottom: 14 },
  sigBox:          { flex: 1, alignItems: 'center' },
  sigLabel:        { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 48 },
  sigLine:         { width: '100%', borderTopWidth: 1, borderTopColor: '#374151', marginBottom: 6 },
  sigName:         { fontSize: 8, color: '#374151', textAlign: 'center' },
  sigRole:         { fontSize: 7.5, color: C.gray, textAlign: 'center', marginTop: 2 },
  // Footer
  footer:          { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText:      { fontSize: 7.5, color: C.gray, flex: 1 },
  footerBrand:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right' },
  // Watermark
  watermark:       { position: 'absolute', top: '35%', left: '5%', fontSize: 80, fontFamily: 'Helvetica-Bold', color: '#E5E7EB', opacity: 0.4, transform: 'rotate(-45deg)', zIndex: 999 },
});

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

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
          <View style={s.colStatus}>
            <StatusBadge status={c.status} />
          </View>
        </View>
      ))}
    </>
  );
}

export interface ContratoProps {
  contrato:       ContratoDetalle;
  cuotas:         Cuota[];
  showWatermark?: boolean;
}

const PAGE_ROWS = 38;

export function ContratoCompraventa({ contrato, cuotas, showWatermark }: ContratoProps) {
  const codigo        = contrato.codigoLegado ?? contrato.contractNumber;
  const clienteNombre = `${contrato.client.firstName} ${contrato.client.lastName}`;
  const lote          = contrato.lots?.[0]?.lot;
  const loteLabel     = lote ? `M${lote.manzana} L-${lote.lotNumber}` : '—';
  const financiado    = contrato.totalPrice - (contrato.downPayment ?? 0);
  const ultimaCuota   = cuotas[cuotas.length - 1];
  const coOwners      = contrato.coOwners ?? [];

  const domicilio = [contrato.client.address, contrato.client.city, contrato.client.state]
    .filter(Boolean)
    .join(', ') || 'No registrado';

  const chunks: Cuota[][] = [];
  for (let i = 0; i < cuotas.length; i += PAGE_ROWS) {
    chunks.push(cuotas.slice(i, i + PAGE_ROWS));
  }
  if (chunks.length === 0) chunks.push([]);

  return (
    <Document title={`Contrato de Compraventa — ${codigo}`} author="Central Inmobiliaria">

      {/* ── PÁGINA 1: DATOS ── */}
      <Page size="A4" style={s.page}>
        {showWatermark && <Text style={s.watermark}>BORRADOR</Text>}

        {/* HEADER */}
        <View style={s.header}>
          <View>
            <Text style={s.contratoTitle}>CONTRATO DE COMPRAVENTA</Text>
            <Text style={s.contratoNum}>No. {codigo}</Text>
          </View>
          <View>
            <Text style={s.companyName}>Central Inmobiliaria</Text>
            <Text style={s.companyTagline}>Gestión Inmobiliaria de Confianza</Text>
            <View style={s.goldBar} />
          </View>
        </View>

        {/* VENDEDOR */}
        <Text style={s.sectionTitle}>DATOS DEL VENDEDOR</Text>
        <View style={[s.vendorBox, { marginBottom: 14 }]}>
          <Text style={s.vendorName}>Central Inmobiliaria, S.A. de C.V.</Text>
          <Text style={s.vendorDetail}>Av. Las Arboledas No. 84, Esq. con Maple, Fracc. Las Arboledas. 87448</Text>
          <Text style={s.vendorDetail}>Tel: 868 156 1069</Text>
        </View>

        {/* COMPRADOR */}
        <Text style={s.sectionTitle}>DATOS DEL COMPRADOR</Text>
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>NOMBRE COMPLETO</Text>
            <Text style={s.infoValue}>{clienteNombre}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>INE</Text>
            <Text style={s.infoValue}>{contrato.client.ine ?? 'No registrado'}</Text>
          </View>
        </View>
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>CURP</Text>
            <Text style={s.infoValue}>{contrato.client.curp ?? 'No registrado'}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>ESTADO CIVIL</Text>
            <Text style={s.infoValue}>{contrato.client.estadoCivil ?? 'No registrado'}</Text>
          </View>
        </View>
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>LUGAR DE NACIMIENTO</Text>
            <Text style={s.infoValue}>{contrato.client.lugarNacimiento ?? 'No registrado'}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>DOMICILIO</Text>
            <Text style={s.infoValue}>{domicilio}</Text>
          </View>
        </View>
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>TELÉFONO</Text>
            <Text style={s.infoValue}>{contrato.client.phone ?? 'No registrado'}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>EMAIL</Text>
            <Text style={s.infoValue}>{contrato.client.email || 'No registrado'}</Text>
          </View>
        </View>

        {/* CO-TITULARES */}
        {coOwners.length > 0 && (
          <>
            <Text style={s.sectionTitle}>CO-TITULAR</Text>
            {coOwners.map((co: CoOwner) => (
              <View key={co.id} style={s.infoRow}>
                <View style={s.infoBox}>
                  <Text style={s.infoLabel}>NOMBRE COMPLETO</Text>
                  <Text style={s.infoValue}>{co.firstName} {co.lastName}</Text>
                </View>
                <View style={s.infoBox}>
                  <Text style={s.infoLabel}>INE</Text>
                  <Text style={s.infoValue}>{co.ine}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* INMUEBLE */}
        <Text style={s.sectionTitle}>DATOS DEL INMUEBLE</Text>
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>PROYECTO</Text>
            <Text style={s.infoValue}>{contrato.project.name}</Text>
            <Text style={s.infoValueSub}>{contrato.project.code}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>LOTE</Text>
            <Text style={s.infoValue}>{loteLabel}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>SUPERFICIE</Text>
            <Text style={s.infoValue}>{lote ? `${lote.areaM2} m²` : '—'}</Text>
          </View>
        </View>
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>PRECIO TOTAL</Text>
            <Text style={s.infoValue}>{fmt(contrato.totalPrice)}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>ENGANCHE</Text>
            <Text style={s.infoValue}>{fmt(contrato.downPayment ?? 0)}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>SALDO FINANCIADO</Text>
            <Text style={s.infoValue}>{fmt(financiado)}</Text>
          </View>
        </View>

        {/* PLAN DE PAGOS */}
        <Text style={s.sectionTitle}>PLAN DE PAGOS</Text>
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>PLAZO</Text>
            <Text style={s.infoValue}>{contrato.installmentCount} meses</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>MENSUALIDAD</Text>
            <Text style={s.infoValue}>{fmt(contrato.installmentAmount ?? 0)}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>FECHA INICIO</Text>
            <Text style={s.infoValue}>{contrato.startDate ? fmtDate(contrato.startDate) : '—'}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>FECHA FIN ESTIMADA</Text>
            <Text style={s.infoValue}>{ultimaCuota ? fmtDate(ultimaCuota.fechaVencimiento) : '—'}</Text>
          </View>
        </View>

      </Page>

      {/* ── PÁGINAS DE AMORTIZACIÓN ── */}
      {chunks.map((chunk, pageIdx) => (
        <Page key={`amort-${pageIdx}`} size="A4" style={s.page}>
          {showWatermark && <Text style={s.watermark}>BORRADOR</Text>}
          {pageIdx === 0
            ? <Text style={s.sectionTitle}>TABLA DE AMORTIZACIÓN</Text>
            : <Text style={s.contLabel}>Contrato {codigo} — continuación</Text>
          }
          <View style={s.table}>
            <TableHeader />
            <CuotaRows rows={chunk} />
          </View>
        </Page>
      ))}

      {/* ── ÚLTIMA PÁGINA: CLÁUSULAS Y FIRMAS ── */}
      <Page size="A4" style={s.page}>
        {showWatermark && <Text style={s.watermark}>BORRADOR</Text>}

        <View style={s.clausesBox}>
          <Text style={s.clausesTitle}>CLÁUSULAS</Text>
          {CLAUSULAS.map((c) => (
            <View key={c.num} style={s.clauseRow}>
              <Text style={s.clauseNum}>{c.num}</Text>
              <Text style={s.clauseText}>{c.text}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexGrow: 1 }} />

        <View style={s.signaturesRow}>
          <View style={s.sigBox}>
            <Text style={s.sigLabel}>EL VENDEDOR</Text>
            <View style={s.sigLine} />
            <Text style={s.sigName}>Central Inmobiliaria</Text>
            <Text style={s.sigRole}>Representante Legal</Text>
          </View>
          <View style={s.sigBox}>
            <Text style={s.sigLabel}>EL COMPRADOR</Text>
            <View style={s.sigLine} />
            <Text style={s.sigName}>{clienteNombre.toUpperCase()}</Text>
          </View>
        </View>

        <View style={s.footer}>
          <View style={s.footerText}>
            <Text>Av. Las Arboledas No. 84, Esq. con Maple, Fracc. Las Arboledas. 87448{'   '}|{'   '}Tel: 868 156 1069</Text>
            <Text style={{ fontSize: 7, color: C.gray, marginTop: 2 }}>
              Verifica en: centralinmob.com/verificar/{contrato.contractNumber}
            </Text>
          </View>
          <Text style={s.footerBrand}>Central Inmobiliaria</Text>
        </View>

      </Page>

    </Document>
  );
}

export default ContratoCompraventa;
