import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DIRECCION_EMPRESA, TELEFONOS_EMPRESA, PIE_EMPRESA } from '../empresa';

const RAIZ = path.resolve(__dirname, '../../..');

// Todo archivo que puede acabar frente a un cliente: PDFs y correos.
const PLANTILLAS = [
  'frontend/src/components/pdf/ReciboContrato.tsx',
  'frontend/src/components/pdf/EstadoDeCuenta.tsx',
  'frontend/src/components/pdf/ContratoCompraventa.tsx',
  'frontend/src/components/pdf/ComprobanteCorte.tsx',
  'src/services/email.service.ts',
];

const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

describe('datos de la empresa — una sola fuente de verdad', () => {
  it('el domicilio y los teléfonos backend coinciden con los del frontend', () => {
    const front = leer('frontend/src/components/pdf/reciboHelpers.ts');
    expect(front).toContain(`export const DIRECCION_EMPRESA = '${DIRECCION_EMPRESA}';`);
    expect(front).toContain(`export const TELEFONOS_RECIBO = '${TELEFONOS_EMPRESA}';`);
  });

  it.each(PLANTILLAS)('%s no trae la dirección vieja de Las Arboledas', rel => {
    expect(leer(rel)).not.toMatch(/Arboledas|87448/);
  });

  it.each(PLANTILLAS)('%s no escribe el domicilio a mano: usa la constante', rel => {
    // Un literal con la calle o el CP dentro de una plantilla significa que
    // alguien volvió a copiarlo en vez de importar PIE_EMPRESA.
    expect(leer(rel)).not.toMatch(/Dieciséis 530|87350/);
  });

  it('el pie arma domicilio + ambos teléfonos', () => {
    expect(PIE_EMPRESA).toContain(DIRECCION_EMPRESA);
    expect(PIE_EMPRESA).toContain('868 156 1069');
    expect(PIE_EMPRESA).toContain('868 363 0211');
  });
});
