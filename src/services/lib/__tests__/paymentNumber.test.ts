import { describe, it, expect } from 'vitest';
import { nextPaymentNumber } from '../paymentNumber';

describe('nextPaymentNumber', () => {
  it('continúa la serie del proyecto a partir del último número', () => {
    expect(nextPaymentNumber('MON2-PAY-020036', 'MON2-PAY-')).toBe('MON2-PAY-020037');
  });

  it('sin pagos previos del proyecto arranca en 000001', () => {
    expect(nextPaymentNumber(null, 'VSR-PAY-')).toBe('VSR-PAY-000001');
  });

  it('tolera sufijos no numéricos arrancando la serie', () => {
    expect(nextPaymentNumber('JSA1-PAY-XXXX', 'JSA1-PAY-')).toBe('JSA1-PAY-000001');
  });

  it('mantiene el padding de 6 dígitos', () => {
    expect(nextPaymentNumber('BET-PAY-000009', 'BET-PAY-')).toBe('BET-PAY-000010');
  });

  it('crece más allá de 999999 sin truncar', () => {
    expect(nextPaymentNumber('VDR-PAY-999999', 'VDR-PAY-')).toBe('VDR-PAY-1000000');
  });
});
