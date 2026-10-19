import { describe, it, expect } from 'vitest';
import expenseRouter from '../expense.routes';
import { authenticate } from '../../middlewares/auth';

// El authorize de gastos va con router.use, así que cubre TODAS las rutas del
// router (lectura y escritura). Se prueba el middleware real tal como quedó
// cableado, no una copia.
function middlewaresDelRouter() {
  return (expenseRouter as any).stack.filter((l: any) => !l.route).map((l: any) => l.handle);
}

function pasa(role: string) {
  const [, autorizar] = middlewaresDelRouter();
  let nextCalled = false;
  try {
    autorizar({ user: { role, userId: 'u-1' } } as any, {} as any, () => { nextCalled = true; });
    return nextCalled;
  } catch (err: any) {
    if (err.statusCode === 403) return false;
    throw err;
  }
}

describe('expense.routes — solo ADMIN y MANAGER', () => {
  it('primero autentica y luego autoriza, antes de cualquier ruta', () => {
    const stack = (expenseRouter as any).stack;
    expect(stack[0].handle).toBe(authenticate);
    expect(stack[1].route).toBeUndefined();
    expect(stack.slice(2).every((l: any) => l.route)).toBe(true);
  });

  it('ADMIN y MANAGER pasan (las secretarias capturan y corrigen gastos a diario)', () => {
    expect(pasa('ADMIN')).toBe(true);
    expect(pasa('MANAGER')).toBe(true);
  });

  it('AGENT → 403: no tiene ninguna pantalla de gastos', () => {
    expect(pasa('AGENT')).toBe(false);
  });

  it('CLIENT u otro rol → 403', () => {
    expect(pasa('CLIENT')).toBe(false);
    expect(pasa('VIEWER')).toBe(false);
  });
});
