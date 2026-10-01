import { describe, it, expect } from 'vitest';
import { paginarCuotas, FILAS_PRIMERA_PAGINA, FILAS_POR_PAGINA } from './paginarCuotas';

const cuotas = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('paginarCuotas', () => {
  it('la primera página lleva menos renglones que las demás', () => {
    // En la primera van también el encabezado y el resumen del contrato.
    expect(FILAS_PRIMERA_PAGINA).toBeLessThan(FILAS_POR_PAGINA);
  });

  it('un plan corto cabe en una sola página', () => {
    expect(paginarCuotas(cuotas(20))).toHaveLength(1);
  });

  it('parte en dos cuando se pasa de la primera página', () => {
    const p = paginarCuotas(cuotas(FILAS_PRIMERA_PAGINA + 1));
    expect(p).toHaveLength(2);
    expect(p[0]).toHaveLength(FILAS_PRIMERA_PAGINA);
    expect(p[1]).toHaveLength(1);
  });

  it('un plan de 60 meses no deja ninguna cuota fuera', () => {
    const p = paginarCuotas(cuotas(60));
    expect(p.flat()).toHaveLength(60);
  });

  it('un plan de 84 meses tampoco', () => {
    const p = paginarCuotas(cuotas(84));
    expect(p.flat()).toHaveLength(84);
    p.slice(1).forEach(pag => expect(pag.length).toBeLessThanOrEqual(FILAS_POR_PAGINA));
  });

  it('sin cuotas devuelve una página vacía, no cero páginas', () => {
    // El PDF siempre tiene que renderizar al menos su primera hoja.
    expect(paginarCuotas([])).toEqual([[]]);
  });
});
