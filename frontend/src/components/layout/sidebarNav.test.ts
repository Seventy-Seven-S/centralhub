import { describe, it, expect } from 'vitest';
import { navParaRol } from './Sidebar';

const hrefs = (rol: string | null) => navParaRol(rol).flatMap(g => g.items.map(i => i.href));

describe('navParaRol — qué ve cada rol en el menú', () => {
  it('ADMIN ve todo', () => {
    const h = hrefs('ADMIN');
    for (const r of ['/dashboard', '/ingresos', '/cortes', '/gastos', '/comisiones', '/usuarios']) {
      expect(h).toContain(r);
    }
  });

  it('MANAGER NO ve las pantallas con totales del negocio', () => {
    const h = hrefs('MANAGER');
    // La queja original: los clientes ven las cifras por encima del hombro.
    expect(h).not.toContain('/ingresos');
    expect(h).not.toContain('/cortes');          // liquidaciones al dueño
    expect(h).not.toContain('/cortes-diarios');  // los cortes de TODAS
    expect(h).not.toContain('/comisiones');
    expect(h).not.toContain('/usuarios');
  });

  it('quien cobra ve "Mi corte"; el ADMIN ve la bandeja de cortes diarios', () => {
    expect(hrefs('MANAGER')).toContain('/mi-corte');
    expect(hrefs('AGENT')).toContain('/mi-corte');
    // El ADMIN recibe el dinero, no lo entrega.
    expect(hrefs('ADMIN')).toContain('/cortes-diarios');
    expect(hrefs('ADMIN')).not.toContain('/mi-corte');
  });

  it('MANAGER SÍ conserva lo que usa para trabajar', () => {
    const h = hrefs('MANAGER');
    for (const r of ['/dashboard', '/contratos', '/cuotas', '/clientes', '/lotes', '/proyectos']) {
      expect(h).toContain(r);
    }
    // Las secretarias capturan y corrigen gastos a diario: no se les quita.
    expect(h).toContain('/gastos');
  });

  it('AGENT mantiene lo que ya tenía: lotes, proyectos y sus comisiones', () => {
    const h = hrefs('AGENT');
    expect(h).toEqual(expect.arrayContaining(['/proyectos', '/lotes', '/comisiones']));
    expect(h).not.toContain('/dashboard');
    expect(h).not.toContain('/clientes');
    expect(h).not.toContain('/gastos');
  });

  it('sin rol no se filtra nada a la vista: no aparece ningún item restringido', () => {
    expect(hrefs(null)).not.toContain('/ingresos');
    expect(hrefs(null)).not.toContain('/usuarios');
  });

  it('no quedan grupos vacíos en el menú', () => {
    for (const rol of ['ADMIN', 'MANAGER', 'AGENT', null]) {
      expect(navParaRol(rol).every(g => g.items.length > 0)).toBe(true);
    }
  });
});
