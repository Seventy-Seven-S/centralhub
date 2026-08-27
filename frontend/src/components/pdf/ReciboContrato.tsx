import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { ContratoDetalle, Cuota } from '@/hooks/useContratos';
import { formatMoney, buildReciboFolio, TELEFONOS_RECIBO, buildDescripcion } from './reciboHelpers';

// Misma identidad visual del correo de bienvenida (email.service.ts —
// sendWelcomeEmail): fondo beige cálido, header verde bosque, acento
// dorado. react-pdf no soporta linear-gradient ni box-shadow en style —
// el gradiente del header se aproxima con el tono sólido intermedio, y
// la elevación de las tarjetas se aproxima con un borde sutil.
const C = {
  beige:        '#F0EDE8',
  forest:       '#0D2818',
  forestMid:    '#1A3A2A',
  green:        '#2D6A4F',
  greenPale:    '#A8C5B0',
  gold:         '#C9972C',
  goldLight:    '#E8B84B',
  goldPaleBg:   'rgba(201,151,44,0.15)',
  white:        '#FFFFFF',
  ink:          '#0D2818',
  textSecondary:'#6B7C74',
  sectionAlt:   '#F7F9F7',
  border:       '#E5EDE5',
};

const s = StyleSheet.create({
  page:             { padding: 22, fontSize: 9, fontFamily: 'Helvetica', color: C.ink, backgroundColor: C.beige },
  card:             { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },

  // HEADER
  header:           { backgroundColor: C.forestMid, paddingTop: 18, paddingBottom: 16, paddingHorizontal: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  reciboTitle:      { fontSize: 21, fontFamily: 'Helvetica-Bold', color: C.white, letterSpacing: 0.3 },
  companyTagline:   { fontSize: 8, color: C.greenPale, marginTop: 3 },
  folioBadge:       { backgroundColor: C.goldPaleBg, borderWidth: 1, borderColor: C.gold, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 12 },
  folioLabel:       { fontSize: 6.5, color: C.gold, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  folioValue:       { fontSize: 11, color: C.goldLight, fontFamily: 'Helvetica-Bold', letterSpacing: 0.3, marginTop: 1, textAlign: 'right' },

  // Placeholder de QR de validación — solo el espacio maquetado, el
  // código real se agrega después. Centrado entre las cláusulas y el
  // footer.
  qrSection:        { alignItems: 'center', marginHorizontal: 24, marginTop: 2, marginBottom: 10 },
  qrBox:            { width: 56, height: 56, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.sectionAlt },
  qrImage:          { width: 56, height: 56, borderRadius: 8 },
  qrBoxLabel:       { fontSize: 6.5, color: C.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' },
  qrCaption:        { fontSize: 6.5, color: C.textSecondary, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', marginTop: 5, fontFamily: 'Helvetica-Bold' },

  // INFO CLIENTE / PROYECTO / FECHA
  infoRow:          { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  infoBox:          { flex: 1, backgroundColor: C.sectionAlt, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 9 },
  infoLabel:        { fontSize: 6.5, color: C.textSecondary, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  infoValue:        { fontSize: 9.5, color: C.ink, fontFamily: 'Helvetica-Bold' },
  infoValueSub:     { fontSize: 7.5, color: C.textSecondary, marginTop: 2 },

  // SECCIÓN
  sectionLabel:     { fontSize: 7, color: C.ink, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: 20, marginBottom: 7 },

  // TABLA
  tableWrap:        { marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderColor: C.border, borderRadius: 8, overflow: 'hidden' },
  tableHeaderRow:    { flexDirection: 'row', backgroundColor: C.forest, paddingVertical: 7, paddingHorizontal: 14 },
  tableHeaderCell:  { color: C.white, fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 0.5, textTransform: 'uppercase' },
  tableRow:         { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 14, backgroundColor: C.white },
  colDesc:          { flex: 3 },
  colFecha:         { flex: 2 },
  colMonto:         { flex: 1.5, textAlign: 'right' },

  // TOTALES
  totalsBox:        { marginHorizontal: 20, marginBottom: 10, alignItems: 'flex-end' },
  totalRow:         { flexDirection: 'row', justifyContent: 'flex-end', gap: 40, marginBottom: 3 },
  totalLabel:       { fontSize: 8, color: C.textSecondary },
  totalValue:       { fontSize: 8, color: C.ink, fontFamily: 'Helvetica-Bold', minWidth: 90, textAlign: 'right' },
  totalFinal:       { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.forest, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 8, marginTop: 4 },
  totalFinalLabel:  { fontSize: 9, color: C.greenPale, fontFamily: 'Helvetica-Bold', letterSpacing: 0.3, textTransform: 'uppercase' },
  totalFinalValue:  { fontSize: 14, color: C.white, fontFamily: 'Helvetica-Bold' },
  balanceRow:       { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.sectionAlt, borderWidth: 1, borderColor: C.border, paddingVertical: 7, paddingHorizontal: 16, borderRadius: 8, marginTop: 6 },
  balanceLabel:     { fontSize: 8, color: C.textSecondary },
  balanceValue:     { fontSize: 10, color: C.ink, fontFamily: 'Helvetica-Bold' },

  // CLÁUSULAS
  legalBox:         { marginHorizontal: 20, marginBottom: 10, backgroundColor: C.sectionAlt, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 11 },
  legalTitle:       { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.ink, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 },
  legalClause:      { fontSize: 6.5, color: C.textSecondary, marginBottom: 4, lineHeight: 1.35 },

  // FOOTER
  footer:           { backgroundColor: C.forest, paddingVertical: 12, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText:       { fontSize: 7.5, color: C.greenPale, flex: 1 },
  footerBrand:      { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.white, textAlign: 'right' },
});

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}

export interface ReciboProps {
  contrato:       ContratoDetalle;
  cuota:          Cuota;
  pago:           { montoPagado: number; fechaPago: string; concepto: string };
  balanceDespues: number;
  // Data-uri PNG del QR de validación (ver reciboHelpers.ts:buildQrDataUri),
  // ya generado por el caller antes de renderizar. Opcional: si el pago se
  // guardó pero el ReciboLog falló (no debe tumbar el pago — ver
  // reciboLog.service.ts), no hay id que codificar y se muestra el
  // placeholder en su lugar en vez de romper el recibo.
  qrDataUri?: string;
}

export function ReciboContrato({ contrato, cuota, pago, balanceDespues, qrDataUri }: ReciboProps) {
  const codigo        = contrato.codigoLegado ?? contrato.contractNumber;
  const reciboNum     = buildReciboFolio(codigo, cuota.numeroCuota, contrato.installmentCount);
  const clienteNombre = `${contrato.client.firstName} ${contrato.client.lastName}`;
  const lote          = contrato.lots?.[0]?.lot;
  const loteLabel     = lote ? `M${lote.manzana} L-${lote.lotNumber}` : '—';
  const descripcion   = buildDescripcion(pago.concepto, cuota.numeroCuota);

  return (
    <Document title={reciboNum} author="Central Inmobiliaria">
      <Page size="A4" style={s.page}>
        <View style={s.card}>

          {/* HEADER */}
          <View style={s.header}>
            <View>
              <Text style={s.reciboTitle}>RECIBO DE PAGO</Text>
              <Text style={s.companyTagline}>Central Inmobiliaria</Text>
            </View>
            <View style={s.folioBadge}>
              <Text style={s.folioLabel}>Folio</Text>
              <Text style={s.folioValue}>{reciboNum}</Text>
            </View>
          </View>

          {/* INFO CLIENTE + PROYECTO + FECHA */}
          <View style={s.infoRow}>
            <View style={s.infoBox}>
              <Text style={s.infoLabel}>Cliente</Text>
              <Text style={s.infoValue}>{clienteNombre}</Text>
              <Text style={s.infoValueSub}>Código: {codigo}</Text>
            </View>
            <View style={s.infoBox}>
              <Text style={s.infoLabel}>Proyecto</Text>
              <Text style={s.infoValue}>{contrato.project.name}</Text>
              <Text style={s.infoValueSub}>Lote: {loteLabel}</Text>
            </View>
            <View style={s.infoBox}>
              <Text style={s.infoLabel}>Fecha de emisión</Text>
              <Text style={s.infoValue}>{fmtDate(new Date().toISOString())}</Text>
              <Text style={s.infoValueSub}>Cuota #{cuota.numeroCuota} — {cuota.mes}</Text>
            </View>
          </View>

          {/* TABLA */}
          <Text style={s.sectionLabel}>Detalle del pago</Text>
          <View style={s.tableWrap}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, s.colDesc]}>Descripción</Text>
              <Text style={[s.tableHeaderCell, s.colFecha]}>Fecha de recepción</Text>
              <Text style={[s.tableHeaderCell, s.colMonto]}>Monto</Text>
            </View>
            <View style={s.tableRow}>
              <Text style={[{ fontSize: 9 }, s.colDesc]}>{descripcion}</Text>
              <Text style={[{ fontSize: 9, color: C.textSecondary }, s.colFecha]}>{fmtDate(pago.fechaPago)}</Text>
              <Text style={[{ fontSize: 9, fontFamily: 'Helvetica-Bold' }, s.colMonto]}>{formatMoney(pago.montoPagado)}</Text>
            </View>
          </View>

          {/* TOTALES */}
          <View style={s.totalsBox}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Subtotal</Text>
              <Text style={s.totalValue}>{formatMoney(pago.montoPagado)}</Text>
            </View>
            <View style={s.totalFinal}>
              <Text style={s.totalFinalLabel}>Total recibido</Text>
              <Text style={s.totalFinalValue}>{formatMoney(pago.montoPagado)}</Text>
            </View>
            <View style={s.balanceRow}>
              <Text style={s.balanceLabel}>Saldo restante después del pago</Text>
              <Text style={s.balanceValue}>{formatMoney(balanceDespues)}</Text>
            </View>
          </View>

          {/* CLÁUSULAS LEGALES */}
          <View style={s.legalBox}>
            <Text style={s.legalTitle}>Condiciones del contrato</Text>
            <Text style={s.legalClause}>
              1. EN CASO DE QUE EL COMPRADOR DECIDA CANCELAR EL CONTRATO CELEBRADO CON LA EMPRESA ADMINISTRADORA, ÚNICAMENTE TENDRÁ DERECHO A LA DEVOLUCIÓN DEL 20% DEL TOTAL DE LOS PAGOS REALIZADOS, EXCLUYENDO EXPRESAMENTE CUALQUIER CANTIDAD ENTREGADA EN CONCEPTO DE ENGANCHE. ESTA DISPOSICIÓN SE ESTABLECE EN VIRTUD DE QUE EL CONTRATO CELEBRADO CON LA EMPRESA ADMINISTRADORA NO GENERA INTERESES A CARGO DEL COMPRADOR, Y DEBIDO A QUE LA CELEBRACIÓN DEL MISMO IMPLICA COMPROMETER EL INMUEBLE CON UN TERCERO, LO QUE CONLLEVA LA PÉRDIDA DE OPORTUNIDAD DE COMERCIALIZARLO CON OTRO POSIBLE COMPRADOR QUE CUMPLA OPORTUNAMENTE CON SUS OBLIGACIONES DE PAGO.
            </Text>
            <Text style={s.legalClause}>
              2. RESPECTO AL INCUMPLIMIENTO EN EL PAGO DE MENSUALIDADES, SE ESTABLECE UN PLAZO MÁXIMO DE TRES (3) MESES NATURALES DE TOLERANCIA. EN CASO DE QUE EL COMPRADOR INCURRA EN UNA MORA SUPERIOR A DICHO PERIODO, PODRÁ SOLICITAR, POR ÚNICA OCASIÓN, UNA PRÓRROGA ADICIONAL DE HASTA TRES (3) MESES, SIEMPRE Y CUANDO JUSTIFIQUE DEBIDAMENTE SU SITUACIÓN Y LO SOLICITE POR ESCRITO, LO QUE DARÁ INICIO A UN PROCEDIMIENTO DE NOTIFICACIÓN FORMAL.
            </Text>
            <Text style={[s.legalClause, { marginBottom: 0 }]}>
              3. TRANSCURRIDO EL PLAZO DE PRÓRROGA SIN QUE EL COMPRADOR HAYA REGULARIZADO SU SITUACIÓN DE PAGO, EL CONTRATO CELEBRADO CON LA EMPRESA ADMINISTRADORA SE CONSIDERARÁ RESUELTO DE PLENO DERECHO, SIN NECESIDAD DE DECLARACIÓN JUDICIAL PREVIA, Y TODOS LOS MONTOS ENTREGADOS POR EL COMPRADOR HASTA ESA FECHA SE CONSIDERARÁN EN FAVOR DE LA EMPRESA ADMINISTRADORA, SIN QUE EXISTA OBLIGACIÓN DE REINTEGRO ALGUNO. EN CONSECUENCIA, EL INMUEBLE OBJETO DEL CONTRATO CELEBRADO CON LA EMPRESA ADMINISTRADORA REVERTIRÁ A LA PLENA PROPIEDAD Y DISPOSICIÓN DE LA EMPRESA ADMINISTRADORA.
            </Text>
          </View>

          {/* VALIDACIÓN (QR) */}
          <View style={s.qrSection}>
            {qrDataUri ? (
              <Image src={qrDataUri} style={s.qrImage} />
            ) : (
              <View style={s.qrBox}>
                <Text style={s.qrBoxLabel}>QR</Text>
              </View>
            )}
            <Text style={s.qrCaption}>Escanea para validar</Text>
          </View>

          {/* FOOTER */}
          <View style={s.footer}>
            <Text style={s.footerText}>
              C. Dieciséis 530, San Francisco, 87350 Heroica Matamoros, Tamps.{'   '}|{'   '}Tel: {TELEFONOS_RECIBO}
            </Text>
            <Text style={s.footerBrand}>Central Inmobiliaria</Text>
          </View>

        </View>
      </Page>
    </Document>
  );
}
