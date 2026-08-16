import { describe, it, expect } from 'vitest';
import { buildAuthRateLimitKey } from '../rateLimitKey';

describe('buildAuthRateLimitKey (identidad compuesta email+IP)', () => {
  it('test 1: email + ip → llave compuesta normalizada (lowercase)', () => {
    expect(buildAuthRateLimitKey('User@Example.com', '1.2.3.4')).toBe('user@example.com|1.2.3.4');
  });

  it('test 2: recorta espacios del email antes de normalizar', () => {
    expect(buildAuthRateLimitKey('  user@example.com  ', '1.2.3.4')).toBe('user@example.com|1.2.3.4');
  });

  it('test 3: mismo email, distinta IP → llaves distintas', () => {
    const a = buildAuthRateLimitKey('user@example.com', '1.2.3.4');
    const b = buildAuthRateLimitKey('user@example.com', '5.6.7.8');
    expect(a).not.toBe(b);
  });

  it('test 4: distinto email, misma IP → llaves distintas (no bloquea cuentas ajenas)', () => {
    const a = buildAuthRateLimitKey('victima@example.com', '1.2.3.4');
    const b = buildAuthRateLimitKey('atacante@example.com', '1.2.3.4');
    expect(a).not.toBe(b);
  });

  it('test 5: sin email (undefined) → fallback solo-IP con prefijo noemail', () => {
    expect(buildAuthRateLimitKey(undefined, '1.2.3.4')).toBe('noemail|1.2.3.4');
  });

  it('test 6: email vacío o solo espacios → mismo fallback que sin email', () => {
    expect(buildAuthRateLimitKey('', '1.2.3.4')).toBe('noemail|1.2.3.4');
    expect(buildAuthRateLimitKey('   ', '1.2.3.4')).toBe('noemail|1.2.3.4');
  });
});
