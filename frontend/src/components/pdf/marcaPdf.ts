// Identidad visual de los documentos de Central Inmobiliaria.
//
// Vivía duplicada: el recibo usaba verde bosque y el estado de cuenta azul
// marino, así que dos documentos del mismo cliente parecían de dos empresas.
// Los correos ya usaban el verde, de modo que el estado de cuenta era el único
// fuera de línea. Una sola fuente para que no vuelva a separarse.

export const C = {
  forest:        '#0D2818',
  forestMid:     '#1A3A2A',
  green:         '#2D6A4F',
  greenPale:     '#A8C5B0',
  gold:          '#C9972C',
  goldLight:     '#E8B84B',
  goldPaleBg:    'rgba(201,151,44,0.15)',
  white:         '#FFFFFF',
  ink:           '#0D2818',
  textSecondary: '#6B7C74',
  sectionAlt:    '#F7F9F7',
  border:        '#E5EDE5',
  // Fondo de página blanco (menos tinta al imprimir en b/n) — la tarjeta ya no
  // contrasta contra un beige, así que su borde exterior usa un tono más
  // marcado que C.border para seguir delimitándose.
  cardBorder:    '#CBDBCE',
  // Estados. El rojo se reserva para lo que de verdad está vencido.
  danger:        '#B4321F',
  dangerPaleBg:  '#FBF0EE',
  successPaleBg: '#EFF5F1',
};

/** Estilos que comparten el recibo y el estado de cuenta. */
export const marca = {
  page:            { padding: 22, fontSize: 9, fontFamily: 'Helvetica', color: C.ink, backgroundColor: C.white },
  card:            { flex: 1, backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder, overflow: 'hidden' as const },

  header:          { backgroundColor: C.forestMid, paddingTop: 18, paddingBottom: 16, paddingHorizontal: 28, flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-start' as const },
  docTitle:        { fontSize: 21, fontFamily: 'Helvetica-Bold', color: C.white, letterSpacing: 0.3 },
  companyTagline:  { fontSize: 8, color: C.greenPale, marginTop: 3 },
  folioBadge:      { backgroundColor: C.goldPaleBg, borderWidth: 1, borderColor: C.gold, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 12 },
  folioLabel:      { fontSize: 6.5, color: C.gold, letterSpacing: 1, textTransform: 'uppercase' as const, fontFamily: 'Helvetica-Bold', textAlign: 'right' as const },
  folioValue:      { fontSize: 11, color: C.goldLight, fontFamily: 'Helvetica-Bold', letterSpacing: 0.3, marginTop: 1, textAlign: 'right' as const },

  infoRow:         { flexDirection: 'row' as const, gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  infoBox:         { flex: 1, backgroundColor: C.sectionAlt, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 9 },
  infoLabel:       { fontSize: 6.5, color: C.textSecondary, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 4 },
  infoValue:       { fontSize: 9.5, color: C.ink, fontFamily: 'Helvetica-Bold' },
  infoValueSub:    { fontSize: 7.5, color: C.textSecondary, marginTop: 2 },

  sectionLabel:    { fontSize: 7, color: C.ink, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textTransform: 'uppercase' as const, marginHorizontal: 20, marginBottom: 7 },

  tableHeaderRow:  { flexDirection: 'row' as const, backgroundColor: C.forest, paddingVertical: 7, paddingHorizontal: 14 },
  tableHeaderCell: { color: C.white, fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 0.5, textTransform: 'uppercase' as const },
  tableRow:        { flexDirection: 'row' as const, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: C.white },
};
