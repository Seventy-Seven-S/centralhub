// Reglas del acceso de clientes al portal que comparten la pantalla de
// activación, el cambio obligatorio de contraseña y la ficha del cliente.

export const LARGO_MINIMO_CONTRASENA = 8;

/** Mensaje para el cliente, o null si la contraseña nueva se puede enviar. */
export function validarContrasenaNueva(nueva: string, confirmacion: string): string | null {
  if (nueva.length < LARGO_MINIMO_CONTRASENA) {
    return `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`;
  }
  if (nueva !== confirmacion) return 'Las contraseñas no coinciden';
  return null;
}

export type MotivoEnlaceInvalido = 'INVALIDO' | 'VENCIDO' | 'USADO' | 'SUSPENDIDA';
const MOTIVOS: readonly MotivoEnlaceInvalido[] = ['INVALIDO', 'VENCIDO', 'USADO', 'SUSPENDIDA'];

/**
 * Por qué el backend rechazó el enlace, leído del `codigo` de la respuesta
 * (no del texto). null si el error es de otro tipo (contraseña corta, red,
 * demasiados intentos) y el formulario debe seguir a la vista.
 */
export function motivoEnlaceInvalido(err: unknown): MotivoEnlaceInvalido | null {
  const codigo = (err as { response?: { data?: { codigo?: unknown } } })?.response?.data?.codigo;
  return MOTIVOS.includes(codigo as MotivoEnlaceInvalido) ? (codigo as MotivoEnlaceInvalido) : null;
}

export type EstadoAccesoPortal = 'SIN_CUENTA' | 'PENDIENTE' | 'ACTIVA' | 'SUSPENDIDA';

export const TEXTO_ESTADO_ACCESO: Record<EstadoAccesoPortal, string> = {
  SIN_CUENTA: 'Sin cuenta todavía',
  PENDIENTE: 'Pendiente de activar',
  ACTIVA: 'Activa',
  SUSPENDIDA: 'Suspendida',
};
