import { describe, it, expect } from 'vitest';
import { partirNombre } from '../ClienteNuevoEnTraspaso';

describe('partirNombre', () => {
  it('toma las dos últimas palabras como apellidos', () => {
    expect(partirNombre('Vanessa Anahi Pulido Castillo'))
      .toEqual({ firstName: 'Vanessa Anahi', lastName: 'Pulido Castillo' });
  });

  it('con dos palabras, una es nombre y otra apellido', () => {
    expect(partirNombre('Juan Pérez')).toEqual({ firstName: 'Juan', lastName: 'Pérez' });
  });

  it('con una sola palabra deja los apellidos vacíos para que los capturen', () => {
    expect(partirNombre('Juan')).toEqual({ firstName: 'Juan', lastName: '' });
  });

  it('aguanta espacios de más y un campo vacío', () => {
    expect(partirNombre('  Ana   María   López  Ruiz '))
      .toEqual({ firstName: 'Ana María', lastName: 'López Ruiz' });
    expect(partirNombre('   ')).toEqual({ firstName: '', lastName: '' });
  });
});
