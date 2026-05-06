import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ContratoDetalle, Cuota } from '@/hooks/useContratos';

const C = { navy: '#0F1F3D', gold: '#C9972C', gray: '#6B7280', lightGray: '#F3F4F6', border: '#E5E7EB' };

const s = StyleSheet.create({
  page:           { padding: 48, fontSize: 9, fontFamily: 'Helvetica', color: '#1F2937', backgroundColor: '#fff' },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, marginBottom: 16, borderBottomWidth: 2, borderBottomColor: C.navy },
  reciboTitle:    { fontSize: 30, fontFamily: 'Helvetica-Bold', color: C.navy, letterSpacing: 3 },
  reciboNum:      { fontSize: 8, color: C.gray, marginTop: 4 },
  companyName:    { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right' },
  companyTagline: { fontSize: 8, color: C.gray, textAlign: 'right', marginTop: 2 },
  goldBar:        { width: 40, height: 3, backgroundColor: C.gold, marginTop: 4, alignSelf: 'flex-end' },
  infoRow:        { flexDirection: 'row', gap: 12, marginBottom: 14 },
  infoBox:        { flex: 1, backgroundColor: C.lightGray, borderRadius: 4, padding: 10 },
  infoLabel:      { fontSize: 7, color: C.gray, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  infoValue:      { fontSize: 9, color: '#111827', fontFamily: 'Helvetica-Bold' },
  infoValueSub:   { fontSize: 8, color: '#374151', marginTop: 2 },
  table:          { marginBottom: 12, borderWidth: 1, borderColor: C.border, borderRadius: 4 },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: C.navy, padding: 8, borderRadius: 3 },
  tableHeaderCell:{ color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  tableRow:       { flexDirection: 'row', padding: 8, borderTopWidth: 1, borderTopColor: C.border },
  colDesc:        { flex: 3 },
  colFecha:       { flex: 2 },
  colMonto:       { flex: 1.5, textAlign: 'right' },
  totalsBox:      { alignItems: 'flex-end', marginBottom: 14 },
  totalRow:       { flexDirection: 'row', justifyContent: 'flex-end', gap: 40, marginBottom: 3 },
  totalLabel:     { fontSize: 8, color: C.gray },
  totalValue:     { fontSize: 8, color: '#111827', fontFamily: 'Helvetica-Bold', minWidth: 80, textAlign: 'right' },
  totalFinal:     { flexDirection: 'row', justifyContent: 'flex-end', gap: 40, backgroundColor: C.navy, padding: '6 10', borderRadius: 4, marginTop: 4 },
  totalFinalLabel:{ fontSize: 9, color: '#fff', fontFamily: 'Helvetica-Bold' },
  totalFinalValue:{ fontSize: 9, color: C.gold, fontFamily: 'Helvetica-Bold', minWidth: 80, textAlign: 'right' },
  balanceRow:     { flexDirection: 'row', justifyContent: 'flex-end', gap: 40, marginTop: 6 },
  balanceLabel:   { fontSize: 8, color: C.gray },
  balanceValue:   { fontSize: 9, color: C.navy, fontFamily: 'Helvetica-Bold', minWidth: 80, textAlign: 'right' },
  legalBox:       { borderWidth: 1, borderColor: C.border, borderRadius: 4, padding: 10, marginBottom: 14 },
  legalTitle:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 6 },
  legalClause:    { fontSize: 7.5, color: '#4B5563', marginBottom: 5, lineHeight: 1.5 },
  footer:         { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText:     { fontSize: 7.5, color: C.gray, flex: 1 },
  footerBrand:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right' },
});

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}

export interface ReciboProps {
  contrato:       ContratoDetalle;
  cuota:          Cuota;
  pago:           { montoPagado: number; fechaPago: string; concepto: string };
  balanceDespues: number;
}

export function ReciboContrato({ contrato, cuota, pago, balanceDespues }: ReciboProps) {
  const codigo        = contrato.codigoLegado ?? contrato.contractNumber;
  const reciboNum     = `REC-${codigo}-${String(cuota.numeroCuota).padStart(3, '0')}`;
  const clienteNombre = `${contrato.client.firstName} ${contrato.client.lastName}`;
  const lote          = contrato.lots?.[0]?.lot;
  const loteLabel     = lote ? `M${lote.manzana} L-${lote.lotNumber}` : '—';

  return (
    <Document title={reciboNum} author="Central Inmobiliaria">
      <Page size="A4" style={s.page}>

        {/* HEADER */}
        <View style={s.header}>
          <View>
            <Text style={s.reciboTitle}>RECIBO</Text>
            <Text style={s.reciboNum}>{reciboNum}</Text>
          </View>
          <View>
            <Text style={s.companyName}>Central Inmobiliaria</Text>
            <Text style={s.companyTagline}>Gestión Inmobiliaria de Confianza</Text>
            <View style={s.goldBar} />
          </View>
        </View>

        {/* INFO CLIENTE + PROYECTO + FECHA */}
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>CLIENTE</Text>
            <Text style={s.infoValue}>{clienteNombre}</Text>
            <Text style={s.infoValueSub}>Código: {codigo}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>PROYECTO</Text>
            <Text style={s.infoValue}>{contrato.project.name}</Text>
            <Text style={s.infoValueSub}>Lote: {loteLabel}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>FECHA DE EMISIÓN</Text>
            <Text style={s.infoValue}>{fmtDate(new Date().toISOString())}</Text>
            <Text style={s.infoValueSub}>Cuota #{cuota.numeroCuota} — {cuota.mes}</Text>
          </View>
        </View>

        {/* TABLA */}
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.tableHeaderCell, s.colDesc]}>Descripción</Text>
            <Text style={[s.tableHeaderCell, s.colFecha]}>Fecha de Recepción</Text>
            <Text style={[s.tableHeaderCell, s.colMonto]}>Monto</Text>
          </View>
          <View style={s.tableRow}>
            <Text style={[{ fontSize: 9 }, s.colDesc]}>{pago.concepto}</Text>
            <Text style={[{ fontSize: 9, color: C.gray }, s.colFecha]}>{fmtDate(pago.fechaPago)}</Text>
            <Text style={[{ fontSize: 9, fontFamily: 'Helvetica-Bold' }, s.colMonto]}>{fmt(pago.montoPagado)}</Text>
          </View>
        </View>

        {/* TOTALES */}
        <View style={s.totalsBox}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>{fmt(pago.montoPagado)}</Text>
          </View>
          <View style={s.totalFinal}>
            <Text style={s.totalFinalLabel}>Total recibido</Text>
            <Text style={s.totalFinalValue}>{fmt(pago.montoPagado)}</Text>
          </View>
          <View style={s.balanceRow}>
            <Text style={s.balanceLabel}>Saldo restante después del pago</Text>
            <Text style={s.balanceValue}>{fmt(balanceDespues)}</Text>
          </View>
        </View>

        {/* CLÁUSULAS LEGALES */}
        <View style={s.legalBox}>
          <Text style={s.legalTitle}>CONDICIONES DEL CONTRATO</Text>
          <Text style={s.legalClause}>
            1. EN CASO DE QUE EL COMPRADOR DECIDA CANCELAR EL CONTRATO CELEBRADO CON LA EMPRESA ADMINISTRADORA, ÚNICAMENTE TENDRÁ DERECHO A LA DEVOLUCIÓN DEL 20% DEL TOTAL DE LOS PAGOS REALIZADOS, EXCLUYENDO EXPRESAMENTE CUALQUIER CANTIDAD ENTREGADA EN CONCEPTO DE ENGANCHE. ESTA DISPOSICIÓN SE ESTABLECE EN VIRTUD DE QUE EL CONTRATO CELEBRADO CON LA EMPRESA ADMINISTRADORA NO GENERA INTERESES A CARGO DEL COMPRADOR, Y DEBIDO A QUE LA CELEBRACIÓN DEL MISMO IMPLICA COMPROMETER EL INMUEBLE CON UN TERCERO, LO QUE CONLLEVA LA PÉRDIDA DE OPORTUNIDAD DE COMERCIALIZARLO CON OTRO POSIBLE COMPRADOR QUE CUMPLA OPORTUNAMENTE CON SUS OBLIGACIONES DE PAGO.
          </Text>
          <Text style={s.legalClause}>
            2. RESPECTO AL INCUMPLIMIENTO EN EL PAGO DE MENSUALIDADES, SE ESTABLECE UN PLAZO MÁXIMO DE TRES (3) MESES NATURALES DE TOLERANCIA. EN CASO DE QUE EL COMPRADOR INCURRA EN UNA MORA SUPERIOR A DICHO PERIODO, PODRÁ SOLICITAR, POR ÚNICA OCASIÓN, UNA PRÓRROGA ADICIONAL DE HASTA TRES (3) MESES, SIEMPRE Y CUANDO JUSTIFIQUE DEBIDAMENTE SU SITUACIÓN Y LO SOLICITE POR ESCRITO, LO QUE DARÁ INICIO A UN PROCEDIMIENTO DE NOTIFICACIÓN FORMAL.
          </Text>
          <Text style={s.legalClause}>
            3. TRANSCURRIDO EL PLAZO DE PRÓRROGA SIN QUE EL COMPRADOR HAYA REGULARIZADO SU SITUACIÓN DE PAGO, EL CONTRATO CELEBRADO CON LA EMPRESA ADMINISTRADORA SE CONSIDERARÁ RESUELTO DE PLENO DERECHO, SIN NECESIDAD DE DECLARACIÓN JUDICIAL PREVIA, Y TODOS LOS MONTOS ENTREGADOS POR EL COMPRADOR HASTA ESA FECHA SE CONSIDERARÁN EN FAVOR DE LA EMPRESA ADMINISTRADORA, SIN QUE EXISTA OBLIGACIÓN DE REINTEGRO ALGUNO. EN CONSECUENCIA, EL INMUEBLE OBJETO DEL CONTRATO CELEBRADO CON LA EMPRESA ADMINISTRADORA REVERTIRÁ A LA PLENA PROPIEDAD Y DISPOSICIÓN DE LA EMPRESA ADMINISTRADORA.
          </Text>
        </View>

        {/* FOOTER */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            Av. Las Arboledas No. 84, Esq. con Maple, Fracc. Las Arboledas. 87448{'   '}|{'   '}Tel: 868 156 1069
          </Text>
          <Text style={s.footerBrand}>Central Inmobiliaria</Text>
        </View>

      </Page>
    </Document>
  );
}
