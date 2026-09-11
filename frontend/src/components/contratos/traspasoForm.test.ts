import { describe, it, expect } from 'vitest';
import { validarFormularioTraspaso, resumenDinero } from './traspasoForm';

const base = {
  clienteNuevoId: 'cli2', lotIdsDestino: ['l1'], projectIdDestino: 'p1',
  montoRespetado: '40000', abonado: 40000, nota: '',
};

describe('validarFormularioTraspaso', () => {
  it('acepta un traspaso completo', () => {
    expect(validarFormularioTraspaso(base)).toBeNull();
  });

  it('exige elegir al cliente nuevo', () => {
    expect(validarFormularioTraspaso({ ...base, clienteNuevoId: '' })).toMatch(/cliente/i);
  });

  it('exige elegir al menos un lote destino', () => {
    expect(validarFormularioTraspaso({ ...base, lotIdsDestino: [] })).toMatch(/lote/i);
  });

  it('exige nota cuando no se respeta todo lo abonado', () => {
    expect(validarFormularioTraspaso({ ...base, montoRespetado: '10000' })).toMatch(/nota/i);
    expect(validarFormularioTraspaso({ ...base, montoRespetado: '10000', nota: 'Solo enganche' })).toBeNull();
  });

  it('no deja respetar más de lo abonado', () => {
    expect(validarFormularioTraspaso({ ...base, montoRespetado: '99999', nota: 'x' })).toMatch(/más de lo abonado/i);
  });
});

describe('resumenDinero — lo que la secretaria ve mientras captura', () => {
  it('respetar todo no deja diferencia', () => {
    expect(resumenDinero(40000, '40000')).toEqual({ respetado: 40000, sePierde: 0, hayDiferencia: false });
  });

  it('respetar menos muestra cuánto se pierde', () => {
    expect(resumenDinero(40000, '10000')).toEqual({ respetado: 10000, sePierde: 30000, hayDiferencia: true });
  });

  it('el campo vacío se lee como cero, no como NaN', () => {
    expect(resumenDinero(40000, '')).toEqual({ respetado: 0, sePierde: 40000, hayDiferencia: true });
  });

  it('tolera que escriban el monto con comas y signo de pesos', () => {
    expect(resumenDinero(40000, '$10,000')).toMatchObject({ respetado: 10000 });
  });
});
