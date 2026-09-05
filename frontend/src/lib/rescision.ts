export interface RescisionForm {
  motivo: string;
  fecha: string;      // YYYY-MM-DD
  devolucion: string; // texto del input; vacío = sin devolución
}

const ESTADOS_RESCINDIBLES = ['DRAFT', 'SIGNED', 'ACTIVE', 'IN_MORA'];

export function puedeRescindir(status: string): boolean {
  return ESTADOS_RESCINDIBLES.includes(status);
}

/** Devuelve el mensaje de error del formulario, o null si es válido. */
export function validarRescision(f: RescisionForm): string | null {
  if (!f.motivo || f.motivo.trim().length < 5) return 'Escribe el motivo de la rescisión';
  if (!f.fecha) return 'Indica la fecha de rescisión';
  const hoy = new Date(); hoy.setHours(23, 59, 59, 999);
  if (new Date(f.fecha + 'T00:00:00') > hoy) return 'La fecha no puede ser futura';
  if (f.devolucion.trim() !== '') {
    const n = Number(f.devolucion);
    if (!Number.isFinite(n) || n < 0) return 'La devolución debe ser un monto válido (0 o mayor)';
  }
  return null;
}
