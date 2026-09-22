// Validación de los datos del cliente al dar de alta un contrato.
//
// El correo dejó de ser obligatorio: se exigía para crear el acceso del
// cliente al portal, y el portal está apagado por instrucción del arquitecto.
// Además hay clientes que simplemente no tienen correo, y eso no debe
// impedir venderles un lote.
//
// Sí se valida el FORMATO cuando lo capturan: un correo mal escrito es peor
// que no tener correo, porque el recibo de cada pago falla en silencio
// mientras todos creen que le está llegando.

export interface DatosCliente {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Devuelve el mensaje de error, o null si los datos sirven. */
export function validarDatosDelCliente(d: DatosCliente): string | null {
  if (!d.firstName.trim()) return 'El nombre es obligatorio';
  if (!d.lastName.trim()) return 'Los apellidos son obligatorios';
  if (!d.phone.trim()) return 'El teléfono es obligatorio';

  const correo = (d.email ?? '').trim();
  if (correo && !FORMATO_CORREO.test(correo)) {
    return 'El email no tiene un formato válido (ej: nombre@dominio.com). Déjalo vacío si el cliente no tiene correo.';
  }
  return null;
}
