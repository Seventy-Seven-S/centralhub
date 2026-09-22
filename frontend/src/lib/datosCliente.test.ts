import { describe, it, expect } from 'vitest';
import { validarDatosDelCliente } from './datosCliente';

const base = { firstName: 'Ana', lastName: 'Pérez', phone: '8681234567', email: '' };

describe('validarDatosDelCliente', () => {
  it('deja pasar un cliente sin correo', () => {
    // El correo dejó de ser obligatorio: se pedía para crear el acceso al
    // portal, y el portal está apagado. Hay clientes que no tienen.
    expect(validarDatosDelCliente(base)).toBeNull();
  });

  it('sigue exigiendo nombre, apellidos y teléfono', () => {
    expect(validarDatosDelCliente({ ...base, firstName: '  ' })).toMatch(/nombre/i);
    expect(validarDatosDelCliente({ ...base, lastName: '' })).toMatch(/apellido/i);
    expect(validarDatosDelCliente({ ...base, phone: '' })).toMatch(/tel[ée]fono/i);
  });

  it('acepta un correo bien escrito', () => {
    expect(validarDatosDelCliente({ ...base, email: 'ana@dominio.com' })).toBeNull();
  });

  it('rechaza un correo mal escrito, porque capturarlo mal es peor que no tenerlo', () => {
    // Un correo inválido hace que el recibo de cada pago falle en silencio.
    expect(validarDatosDelCliente({ ...base, email: 'ana@dominio' })).toMatch(/formato/i);
    expect(validarDatosDelCliente({ ...base, email: 'ana' })).toMatch(/formato/i);
    expect(validarDatosDelCliente({ ...base, email: 'ana @dominio.com' })).toMatch(/formato/i);
  });

  it('un correo de puros espacios cuenta como no tener correo', () => {
    expect(validarDatosDelCliente({ ...base, email: '   ' })).toBeNull();
  });
});
