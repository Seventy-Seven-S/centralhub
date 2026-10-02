import { formatDateUTC } from '@/lib/utils';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ContratoDetalle, Cuota } from '@/hooks/useContratos';
import { formatLotsLabel } from '@/lib/utils';
import { PIE_EMPRESA } from './reciboHelpers';

// ── Paleta (idéntica a ReciboContrato) ───────────────────────────────────────
import { C, marca } from './marcaPdf';
import { desglosarPagado } from '@/lib/desglosePagado';
import { paginarCuotas } from '@/lib/paginarCuotas';

// Estados de una cuota. Verde para lo pagado, rojo solo para lo de verdad
// vencido: si todo lo pendiente se pinta de alarma, nada destaca.
const CUOTA_STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  PAGADA:    { bg: C.successPaleBg, color: C.green,         label: 'Pagada'    },
  PENDIENTE: { bg: C.sectionAlt,    color: C.textSecondary, label: 'Pendiente' },
  MORA:      { bg: C.dangerPaleBg,  color: C.danger,        label: 'En mora'   },
  VENCIDA:   { bg: C.dangerPaleBg,  color: C.danger,        label: 'Vencida'   },
};

const s = StyleSheet.create({
  page:            marca.page,
  card:            marca.card,

  header:          marca.header,
  edcTitle:        marca.docTitle,
  companyTagline:  marca.companyTagline,
  folioBadge:      marca.folioBadge,
  folioLabel:      marca.folioLabel,
  folioValue:      marca.folioValue,
  headerSub:       { fontSize: 7.5, color: C.greenPale, marginTop: 6 },

  infoRow:         marca.infoRow,
  infoBox:         marca.infoBox,
  infoLabel:       marca.infoLabel,
  infoValue:       marca.infoValue,
  infoValueSub:    marca.infoValueSub,

  // Las tres cifras que el cliente busca primero.
  summaryRow:      { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingBottom: 14 },
  summaryBox:      { flex: 1, backgroundColor: C.sectionAlt, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10 },
  summaryLabel:    { fontSize: 6.5, color: C.textSecondary, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 },
  summaryValue:    { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.ink },
  // El desglose nació a 6.5pt en gris claro y no se leía al imprimir. Va al
  // tamaño del texto normal y en la tinta oscura, con el monto en negritas.
  summaryDesglose:     { fontSize: 8.5, color: C.ink, marginTop: 3 },
  summaryDesgloseDato: { fontFamily: 'Helvetica-Bold' },
  saldoBox:        { flex: 1, backgroundColor: C.forest, borderRadius: 8, padding: 10 },
  saldoLabel:      { fontSize: 6.5, color: C.greenPale, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 },
  saldoValue:      { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.white },

  sectionTitle:    marca.sectionLabel,
  contLabel:       { fontSize: 7.5, color: C.textSecondary, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginHorizontal: 20, marginTop: 16, marginBottom: 8 },

  table:           { marginHorizontal: 20, borderWidth: 1, borderColor: C.border, borderRadius: 8, overflow: 'hidden', marginBottom: 14 },
  tableHeaderRow:  marca.tableHeaderRow,
  tableHeaderCell: marca.tableHeaderCell,
  tableRow:        marca.tableRow,
  colNum:          { flex: 0.5 },
  colVencimiento:  { flex: 2 },
  colMonto:        { flex: 1.5, alignItems: 'flex-end', paddingRight: 8 },
  colFechaPago:    { flex: 2, paddingLeft: 4 },
  colStatus:       { flex: 1.5 },

  finalBox:        { marginHorizontal: 20, backgroundColor: C.sectionAlt, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 12, marginBottom: 14 },
  finalTitle:      { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.ink, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  finalRow:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  finalLabel:      { fontSize: 8, color: C.textSecondary },
  finalValue:      { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.ink },

  footer:          { marginTop: 'auto', marginHorizontal: 20, marginBottom: 16, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText:      { fontSize: 7, color: C.textSecondary, flex: 1 },
  footerBrand:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.ink, textAlign: 'right' },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return formatDateUTC(iso, 'long');
}

function fmtDateShort(iso: string) {
  return formatDateUTC(iso, 'short');
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
        <View key={c.id} style={[s.tableRow, { backgroundColor: i % 2 === 0 ? '#fff' : C.sectionAlt }]}>
          <Text style={[{ fontSize: 8, color: C.textSecondary }, s.colNum]}>{c.numeroCuota}</Text>
          <Text style={[{ fontSize: 8 }, s.colVencimiento]}>{fmtDateShort(c.fechaVencimiento)}</Text>
          <View style={s.colMonto}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>{fmt(c.montoEsperado)}</Text>
          </View>
          <Text style={[{ fontSize: 8, color: C.textSecondary }, s.colFechaPago]}>
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
      <Text style={s.finalTitle}>Resumen</Text>
      <View style={s.finalRow}>
        <Text style={s.finalLabel}>Total cuotas pagadas</Text>
        <Text style={s.finalValue}>{cuotasPagadas} de {cuotas.length}</Text>
      </View>
      <View style={s.finalRow}>
        <Text style={s.finalLabel}>Cuotas vencidas</Text>
        <Text style={[s.finalValue, cuotasVencidas > 0 ? { color: C.danger } : {}]}>
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
        <Text>{PIE_EMPRESA}</Text>
        <Text style={{ fontSize: 7, color: C.textSecondary, marginTop: 2 }}>
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
// Se imprime en CARTA, no en A4: era lo que lo hacía salir cortado. Cuántos
// renglones caben por hoja vive en paginarCuotas.ts, con sus pruebas.
const TAMANO_HOJA = 'LETTER' as const;

export function EstadoDeCuenta({ contrato, cuotas, pagos, folio, contentHash }: EstadoDeCuentaProps) {
  const codigo        = contrato.codigoLegado ?? contrato.contractNumber;
  const clienteNombre = `${contrato.client.firstName} ${contrato.client.lastName}`;
  // Todos los lotes del contrato (no solo el primero); área total solo si se conoce.
  const loteLabel     = formatLotsLabel(contrato.lots);
  const totalArea     = (contrato.lots ?? []).reduce((s, l) => s + (l.lot.areaM2 || 0), 0);
  const loteArea      = totalArea > 0 ? `${Math.round(totalArea * 100) / 100} m²` : '';

  // El equipo pidió ver la división: lo primero que pregunta el cliente es
  // cuánto dio de enganche, y antes solo salía el total.
  const desglose      = desglosarPagado(pagos as never);
  const totalPagado   = desglose.total;
  const saldo         = contrato.totalPrice - totalPagado;

  const cuotasPagadas  = cuotas.filter(c => c.status === 'PAGADA').length;
  // Vencida = pendiente con fecha de vencimiento pasada (igual que la UI de la app;
  // el status 'MORA' no se usa en los datos — las cuotas viven PENDIENTE/PAGADA).
  const ahora = new Date();
  const cuotasVencidas = cuotas.filter(
    c => c.status === 'PENDIENTE' && new Date(c.fechaVencimiento) < ahora
  ).length;
  const proximaCuota   = cuotas.find(c => c.status === 'PENDIENTE');

  // La primera hoja lleva menos renglones: ahí van también el encabezado y el
  // resumen del contrato.
  const chunks = paginarCuotas(cuotas);

  return (
    <Document title={`Estado de Cuenta — ${codigo}`} author="Central Inmobiliaria">

      {/* ── Página 1: header + info + resumen + primera tabla ── */}
      <Page size={TAMANO_HOJA} style={s.page}>
        <View style={s.card}>

        {/* HEADER — mismo lenguaje que el recibo: franja verde y placa dorada */}
        <View style={s.header}>
          <View>
            <Text style={s.edcTitle}>ESTADO DE CUENTA</Text>
            <Text style={s.companyTagline}>Central Inmobiliaria</Text>
            <Text style={s.headerSub}>Contrato {codigo}</Text>
          </View>
          <View style={s.folioBadge}>
            <Text style={s.folioLabel}>Folio</Text>
            <Text style={s.folioValue}>{folio ?? '—'}</Text>
          </View>
        </View>

        {/* INFO BOXES */}
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>Cliente</Text>
            <Text style={s.infoValue}>{clienteNombre}</Text>
            <Text style={s.infoValueSub}>Código: {codigo}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>Proyecto</Text>
            <Text style={s.infoValue}>{contrato.project.name}</Text>
            <Text style={s.infoValueSub}>{contrato.project.code}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>Lote</Text>
            <Text style={s.infoValue}>{loteLabel}</Text>
            <Text style={s.infoValueSub}>{loteArea}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>Fecha de emisión</Text>
            <Text style={s.infoValue}>{fmtDate(new Date().toISOString())}</Text>
            <Text style={s.infoValueSub}>Válido al día de hoy</Text>
          </View>
        </View>

        {/* RESUMEN DEL CONTRATO */}
        <View style={s.summaryRow}>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Precio total</Text>
            <Text style={s.summaryValue}>{fmt(contrato.totalPrice)}</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Total pagado</Text>
            <Text style={s.summaryValue}>{fmt(totalPagado)}</Text>
            <Text style={s.summaryDesglose}>
              Enganche <Text style={s.summaryDesgloseDato}>{fmt(desglose.enganche)}</Text>
            </Text>
            <Text style={s.summaryDesglose}>
              Mensualidades <Text style={s.summaryDesgloseDato}>{fmt(desglose.mensualidades)}</Text>
            </Text>
          </View>
          <View style={s.saldoBox}>
            <Text style={s.saldoLabel}>{saldo > 0 ? 'Saldo pendiente' : 'Estado'}</Text>
            <Text style={s.saldoValue}>{saldo > 0 ? fmt(saldo) : 'Liquidado'}</Text>
          </View>
        </View>

        {/* TABLA — primer bloque */}
        <Text style={s.sectionTitle}>Plan de pagos</Text>
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
        </View>
      </Page>

      {/* ── Páginas adicionales ── */}
      {chunks.slice(1).map((chunk, pageIdx) => {
        const isLast = pageIdx === chunks.length - 2;
        return (
          <Page key={pageIdx} size={TAMANO_HOJA} style={s.page}>
            <View style={s.card}>
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
            </View>
          </Page>
        );
      })}

    </Document>
  );
}

export default EstadoDeCuenta;
