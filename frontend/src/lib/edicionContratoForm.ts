// Lógica pura del formulario de edición de datos del contrato (sin React).
// Las mismas reglas viven en el backend (services/lib/edicionContrato.ts):
// aquí es para que el ADMIN vea el error antes de enviar, no para confiar en
// el cliente.

export interface DatosContrato {
  totalPrice: number;
  installmentAmount: number | null;
  installmentCount: number | null;
  startDate: string | null;
  lotIds: string[];
}

export interface FormEdicion {
  totalPrice: string;
  installmentAmount: string;
  installmentCount: string;
  mesInicioCalendario: string;
  lotIds: string[];
}

export interface CambiosAEnviar {
  totalPrice?: number;
  installmentAmount?: number;
  installmentCount?: number;
  mesInicioCalendario?: string;
  lotIds?: string[];
}

const aNumero = (s: string): number | null => {
  const n = Number((s ?? '').replace(/[$,\s]/g, ''));
  return (s ?? '').trim() === '' || !Number.isFinite(n) ? null : n;
};

/**
 * El calendario ancla en startDate y la cuota 1 vence un mes después. Lo que el
 * ADMIN captura y ve es el mes de la PRIMERA MENSUALIDAD, no el ancla.
 */
export function mesDeFecha(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const primera = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${primera.getFullYear()}-${String(primera.getMonth() + 1).padStart(2, '0')}`;
}

/** Solo los campos que el ADMIN de verdad tocó. Enviar lo demás haría que el
 *  backend rehiciera el calendario por nada. */
export function cambiosDelFormulario(actual: DatosContrato, f: FormEdicion): CambiosAEnviar {
  const out: CambiosAEnviar = {};

  const precio = aNumero(f.totalPrice);
  if (precio !== null && precio !== actual.totalPrice) out.totalPrice = precio;

  const mensualidad = aNumero(f.installmentAmount);
  if (mensualidad !== null && mensualidad !== actual.installmentAmount) out.installmentAmount = mensualidad;

  const plazo = aNumero(f.installmentCount);
  if (plazo !== null && plazo !== actual.installmentCount) out.installmentCount = plazo;

  if (f.mesInicioCalendario && f.mesInicioCalendario !== mesDeFecha(actual.startDate)) {
    out.mesInicioCalendario = f.mesInicioCalendario;
  }

  if ([...f.lotIds].sort().join('|') !== [...actual.lotIds].sort().join('|')) {
    out.lotIds = f.lotIds;
  }

  return out;
}

export function validarFormulario(actual: DatosContrato, f: FormEdicion, motivo: string): string | null {
  if (!motivo.trim()) return 'Escribe el motivo del cambio: queda registrado y es lo que explica el movimiento después';
  if (motivo.trim().length < 10) return 'El motivo es muy corto — describe qué se está corrigiendo';

  if (f.totalPrice.trim() && aNumero(f.totalPrice) === null) return 'El precio total no es un número válido';
  if (f.installmentAmount.trim() && aNumero(f.installmentAmount) === null) return 'La mensualidad no es un número válido';
  if (f.installmentCount.trim() && aNumero(f.installmentCount) === null) return 'El plazo no es un número válido';
  if (!f.lotIds.length) return 'El contrato necesita al menos un lote';

  if (Object.keys(cambiosDelFormulario(actual, f)).length === 0) return 'No hay ningún cambio que guardar';
  return null;
}
