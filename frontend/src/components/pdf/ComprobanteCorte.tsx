import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatDateUTC } from '@/lib/utils';
import { formatMoney } from './reciboHelpers';
import type { CorteDetalle } from '@/hooks/useCortes';

// Comprobante sencillo de entrega al dueño del terreno: qué ingresos se
// reportan en el corte, cómo se repartieron y cuánto se entrega, con firmas.
const C = { forest: '#0D2818', gold: '#C9972C', ink: '#0D2818', muted: '#6B7C74', border: '#CBDBCE', alt: '#F7F9F7' };

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: 'Helvetica', color: C.ink },
  header: { backgroundColor: C.forest, color: '#fff', padding: 14, borderRadius: 6, marginBottom: 14 },
  h1: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 9, color: '#C9D6CC', marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  cell: { width: '50%', marginBottom: 5 },
  label: { fontSize: 8, color: C.muted },
  val: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  section: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.forest, marginTop: 10, marginBottom: 5, borderBottomWidth: 1, borderBottomColor: C.gold, paddingBottom: 2 },
  row: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: C.border },
  rowAlt: { backgroundColor: C.alt },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.muted },
  cFecha: { width: '13%' }, cFolio: { width: '20%' }, cCod: { width: '10%' }, cCli: { width: '37%' }, cMonto: { width: '20%', textAlign: 'right' },
  total: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  totalLabel: { fontFamily: 'Helvetica-Bold', marginRight: 10 },
  totalVal: { fontFamily: 'Helvetica-Bold', width: 110, textAlign: 'right' },
  entregado: { marginTop: 12, padding: 10, borderWidth: 1, borderColor: C.gold, borderRadius: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  entregadoVal: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.forest },
  firmas: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 44 },
  firma: { width: '44%', borderTopWidth: 1, borderTopColor: C.ink, paddingTop: 4, alignItems: 'center' },
  firmaNombre: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  firmaRol: { fontSize: 8, color: C.muted },
  foot: { position: 'absolute', bottom: 24, left: 36, right: 36, fontSize: 7.5, color: C.muted, textAlign: 'center' },
});

export function ComprobanteCorte({ corte }: { corte: CorteDetalle }) {
  const proyecto = corte.project ? `${corte.project.name} (${corte.project.code})` : corte.projectId;
  const periodo = corte.periodoInicio && corte.periodoFin ? `${formatDateUTC(corte.periodoInicio)} — ${formatDateUTC(corte.periodoFin)}` : '—';
  return (
    <Document title={`Corte #${corte.numero} ${corte.project?.code ?? ''}`} author="Central Inmobiliaria">
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <Text style={s.h1}>Comprobante de entrega — Corte #{corte.numero}</Text>
          <Text style={s.sub}>Central Inmobiliaria · {proyecto}</Text>
        </View>

        <View style={s.grid}>
          <View style={s.cell}><Text style={s.label}>Fecha del corte</Text><Text style={s.val}>{formatDateUTC(corte.fecha)}</Text></View>
          <View style={s.cell}><Text style={s.label}>Período de pagos incluidos</Text><Text style={s.val}>{periodo}</Text></View>
          <View style={s.cell}><Text style={s.label}>Recibe</Text><Text style={s.val}>{corte.dueno}</Text></View>
          <View style={s.cell}><Text style={s.label}>Pagos incluidos</Text><Text style={s.val}>{corte.payments.length}</Text></View>
        </View>

        <Text style={s.section}>Ingresos reportados</Text>
        <View style={s.row}>
          <Text style={[s.th, s.cFecha]}>Fecha</Text><Text style={[s.th, s.cFolio]}>Folio</Text><Text style={[s.th, s.cCod]}>Código</Text>
          <Text style={[s.th, s.cCli]}>Cliente</Text><Text style={[s.th, s.cMonto]}>Monto</Text>
        </View>
        {corte.payments.map((p, i) => (
          <View key={p.id} style={[s.row, ...(i % 2 ? [s.rowAlt] : [])]}>
            <Text style={s.cFecha}>{formatDateUTC(p.paymentDate, 'short')}</Text>
            <Text style={s.cFolio}>{p.paymentNumber}</Text>
            <Text style={s.cCod}>{p.contract.codigoLegado ?? ''}</Text>
            <Text style={s.cCli}>{p.contract.client.firstName} {p.contract.client.lastName}</Text>
            <Text style={s.cMonto}>{formatMoney(p.amount)}</Text>
          </View>
        ))}
        <View style={s.total}><Text style={s.totalLabel}>Total de ingresos</Text><Text style={s.totalVal}>{formatMoney(corte.totalIngresos)}</Text></View>

        <Text style={s.section}>Reparto</Text>
        {corte.expenses.map(e => (
          <View key={e.id} style={s.row}>
            <Text style={{ width: '80%' }}>{e.category.name}{e.description ? ` — ${e.description}` : ''}</Text>
            <Text style={s.cMonto}>{formatMoney(Number(e.amount))}</Text>
          </View>
        ))}

        <View style={s.entregado}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Entregado a {corte.dueno}</Text>
          <Text style={s.entregadoVal}>{formatMoney(corte.entregadoDueno)}</Text>
        </View>

        {corte.notas ? <Text style={{ marginTop: 8, color: C.muted }}>Notas: {corte.notas}</Text> : null}

        <View style={s.firmas}>
          <View style={s.firma}><Text style={s.firmaNombre}>Central Inmobiliaria</Text><Text style={s.firmaRol}>Entrega</Text></View>
          <View style={s.firma}><Text style={s.firmaNombre}>{corte.dueno}</Text><Text style={s.firmaRol}>Recibí de conformidad · fecha: ____________</Text></View>
        </View>

        <Text style={s.foot}>Documento generado por CentralHub · Corte #{corte.numero} · {proyecto}</Text>
      </Page>
    </Document>
  );
}
