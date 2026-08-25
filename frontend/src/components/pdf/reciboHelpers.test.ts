import { describe, it, expect } from 'vitest';
import { formatMoney, buildReciboFolio, getTelefonoPorProyecto, buildDescripcion } from './reciboHelpers';

describe('formatMoney — formateador manual, sin toLocaleString/Intl (ICU incompleto en el entorno de render)', () => {
  it('agrega coma de miles y dos decimales', () => {
    expect(formatMoney(3667)).toBe('$3,667.00');
  });

  it('funciona con millones (varias comas)', () => {
    expect(formatMoney(1234567)).toBe('$1,234,567.00');
  });

  it('cero', () => {
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('menos de mil no lleva coma', () => {
    expect(formatMoney(999)).toBe('$999.00');
  });

  it('centavos exactos', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
  });

  it('redondea a 2 decimales', () => {
    expect(formatMoney(1234.567)).toBe('$1,234.57');
  });

  it('negativos (saldo a favor / corrección)', () => {
    expect(formatMoney(-500)).toBe('-$500.00');
  });
});

describe('buildReciboFolio — REC-{código}-{cuota}de{plazoTotal}, derivado, sin padding', () => {
  it('ejemplo del formato pedido', () => {
    expect(buildReciboFolio('V148', 19, 60)).toBe('REC-V148-19de60');
  });

  it('cuota de un solo dígito, sin ceros a la izquierda', () => {
    expect(buildReciboFolio('SAN-004', 3, 24)).toBe('REC-SAN-004-3de24');
  });
});

describe('getTelefonoPorProyecto — Puerta del Sol y Santander tienen teléfono distinto al resto', () => {
  it('Puerta del Sol → 868 363 0211', () => {
    expect(getTelefonoPorProyecto('Puerta del Sol')).toBe('868 363 0211');
  });

  it('Santander → 868 363 0211', () => {
    expect(getTelefonoPorProyecto('Santander')).toBe('868 363 0211');
  });

  it('cualquier otro proyecto → 868 156 1069', () => {
    expect(getTelefonoPorProyecto('Valle del Roble')).toBe('868 156 1069');
    expect(getTelefonoPorProyecto('JSA 1')).toBe('868 156 1069');
    expect(getTelefonoPorProyecto('Monarca II')).toBe('868 156 1069');
  });

  it('es robusto a mayúsculas y espacios extra — no falla el match por acento/caso', () => {
    expect(getTelefonoPorProyecto('SANTANDER')).toBe('868 363 0211');
    expect(getTelefonoPorProyecto('  puerta del sol  ')).toBe('868 363 0211');
    expect(getTelefonoPorProyecto('PUERTA DEL SOL')).toBe('868 363 0211');
  });
});

describe('buildDescripcion — agrega el número de cuota si no está ya en el concepto', () => {
  it('concepto ya incluye el número de cuota → no lo duplica', () => {
    expect(buildDescripcion('Mensualidad #19 — Agosto', 19)).toBe('Mensualidad #19 — Agosto');
  });

  it('el número aparece como palabra suelta dentro del texto → tampoco lo duplica', () => {
    expect(buildDescripcion('Pago de la cuota 19 de agosto', 19)).toBe('Pago de la cuota 19 de agosto');
  });

  it('concepto sin el número → lo agrega al final', () => {
    expect(buildDescripcion('Pago mensual', 19)).toBe('Pago mensual — Cuota #19');
  });

  it('concepto vacío → solo el número de cuota', () => {
    expect(buildDescripcion('', 19)).toBe('Cuota #19');
  });

  it('no confunde un número que solo contiene el de la cuota como substring (19 dentro de 190)', () => {
    expect(buildDescripcion('Pago de $190 pesos', 19)).toBe('Pago de $190 pesos — Cuota #19');
  });
});
