// Formateador MANUAL de montos — a propósito no usa toLocaleString/Intl:
// el entorno donde se renderiza el PDF (@react-pdf/renderer) corre con
// ICU incompleto, así que Intl silenciosamente ignora el locale/las
// opciones y los recibos reales salían como "$3667" sin coma ni
// decimales. Split de miles por regex, sin depender de locale data.
export function formatMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const fixed = Math.abs(n).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${withThousands}.${decPart}`;
}

// Folio derivado (no persiste, no es secuencial) — REC-{código}-{cuota}de{plazoTotal}
export function buildReciboFolio(codigo: string, numeroCuota: number, plazoTotal: number): string {
  return `REC-${codigo}-${numeroCuota}de${plazoTotal}`;
}

const TELEFONO_ALTERNO = '868 363 0211';
const TELEFONO_DEFAULT = '868 156 1069';
const PROYECTOS_TELEFONO_ALTERNO = new Set(['puerta del sol', 'santander']);

function normalizeNombreProyecto(name: string): string {
  return name.trim().toLowerCase();
}

export function getTelefonoPorProyecto(projectName: string): string {
  return PROYECTOS_TELEFONO_ALTERNO.has(normalizeNombreProyecto(projectName))
    ? TELEFONO_ALTERNO
    : TELEFONO_DEFAULT;
}

// Agrega el número de cuota a la descripción si no aparece ya como
// número suelto (evita duplicarlo si el concepto ya lo trae, ej. "#19").
export function buildDescripcion(concepto: string, numeroCuota: number): string {
  const trimmed = concepto.trim();
  const yaTieneNumero = new RegExp(`\\b${numeroCuota}\\b`).test(trimmed);
  if (yaTieneNumero) return trimmed;
  return trimmed ? `${trimmed} — Cuota #${numeroCuota}` : `Cuota #${numeroCuota}`;
}
