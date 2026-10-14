import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import api from '@/lib/api';
import { formatDateUTC } from '@/lib/utils';
import { cantidadEnLetra } from '@/lib/cantidadEnLetra';
import { formatMoney, NOMBRE_EMPRESA, PIE_EMPRESA } from './reciboHelpers';

// Recibo que firma el asesor al cobrar su comisión. Sin rellenos de color,
// igual que los demás recibos: se imprimen a diario y el equipo pidió no
// gastar tóner. Media carta: es un comprobante corto.
const C = { forest: '#0D2818', gold: '#C9972C', ink: '#0D2818', muted: '#6B7C74', border: '#CBDBCE' };

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica', color: C.ink },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: C.forest, paddingBottom: 10, marginBottom: 14 },
  h1: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: C.forest },
  sub: { fontSize: 8.5, color: C.muted, marginTop: 2 },
  folio: { borderWidth: 1, borderColor: C.gold, borderRadius: 5, paddingVertical: 4, paddingHorizontal: 10, alignItems: 'flex-end' },
  folioLabel: { fontSize: 6.5, color: C.gold, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  folioVal: { fontSize: 10.5, fontFamily: 'Helvetica-Bold' },
  monto: { borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 10, marginBottom: 12 },
  montoVal: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.forest },
  montoLetra: { fontSize: 8.5, color: C.muted, marginTop: 3 },
  texto: { fontSize: 10, lineHeight: 1.5, marginBottom: 12 },
  bold: { fontFamily: 'Helvetica-Bold' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', marginBottom: 6 },
  label: { fontSize: 7.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  val: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  firmas: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 40 },
  firma: { width: '44%', borderTopWidth: 1, borderTopColor: C.ink, paddingTop: 4, alignItems: 'center' },
  firmaNombre: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  firmaRol: { fontSize: 8, color: C.muted },
  foot: { position: 'absolute', bottom: 18, left: 32, right: 32, fontSize: 7, color: C.muted, textAlign: 'center' },
});

export interface DatosReciboComision {
  gastoId:  string;
  fecha:    string;
  asesor:   string;
  monto:    number;
  proyecto: string;
  concepto: string;
  cliente?: string;
}

/** Folio estable por gasto: reimprimir da el mismo folio. */
export const folioComision = (gastoId: string) => `COM-${gastoId.slice(0, 8).toUpperCase()}`;

export function ReciboComision({ d }: { d: DatosReciboComision }) {
  return (
    <Document title={`Recibo de comisión ${folioComision(d.gastoId)}`} author={NOMBRE_EMPRESA}>
      <Page size={[612, 396]} style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.h1}>Recibo de comisión</Text>
            <Text style={s.sub}>{NOMBRE_EMPRESA} · {d.proyecto}</Text>
          </View>
          <View style={s.folio}>
            <Text style={s.folioLabel}>FOLIO</Text>
            <Text style={s.folioVal}>{folioComision(d.gastoId)}</Text>
          </View>
        </View>

        <View style={s.monto}>
          <Text style={s.montoVal}>{formatMoney(d.monto)}</Text>
          <Text style={s.montoLetra}>({cantidadEnLetra(d.monto)})</Text>
        </View>

        <Text style={s.texto}>
          Recibí de <Text style={s.bold}>{NOMBRE_EMPRESA}</Text> la cantidad arriba indicada por concepto de
          comisión por la venta de <Text style={s.bold}>{d.concepto.replace(/^comisi[oó]n\s*/i, '')}</Text>.
        </Text>

        <View style={s.grid}>
          <View style={s.cell}><Text style={s.label}>Fecha</Text><Text style={s.val}>{formatDateUTC(d.fecha)}</Text></View>
          <View style={s.cell}><Text style={s.label}>Asesor</Text><Text style={s.val}>{d.asesor}</Text></View>
          {d.cliente ? <View style={s.cell}><Text style={s.label}>Cliente</Text><Text style={s.val}>{d.cliente}</Text></View> : null}
        </View>

        <View style={s.firmas}>
          <View style={s.firma}><Text style={s.firmaNombre}>{NOMBRE_EMPRESA}</Text><Text style={s.firmaRol}>Entrega</Text></View>
          <View style={s.firma}><Text style={s.firmaNombre}>{d.asesor}</Text><Text style={s.firmaRol}>Recibí de conformidad</Text></View>
        </View>

        <Text style={s.foot}>{PIE_EMPRESA}</Text>
      </Page>
    </Document>
  );
}

/** Arma el recibo desde el gasto de la comisión y lo abre para imprimir. */
export async function abrirReciboComision(gastoId: string, cliente?: string) {
  const g = (await api.get(`/expenses/${gastoId}`)).data.data;
  const d: DatosReciboComision = {
    gastoId,
    fecha: g.date,
    asesor: g.beneficiario ?? '—',
    monto: Number(g.amount),
    proyecto: g.project ? `${g.project.name} (${g.project.code})` : '',
    concepto: g.description ?? 'Comisión',
    cliente,
  };
  const blob = await pdf(<ReciboComision d={d} />).toBlob();
  window.open(URL.createObjectURL(blob), '_blank');
}
