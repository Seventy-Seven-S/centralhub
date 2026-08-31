import { describe, it, expect } from 'vitest';
import { formatMoney, buildReciboFolio, TELEFONOS_RECIBO, buildDescripcion, buildValidacionUrl, buildQrDataUri, getLoteInfo } from './reciboHelpers';

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

describe('TELEFONOS_RECIBO — ambos números fijos en todos los recibos, sin condición por proyecto', () => {
  it('incluye los dos números, sin etiquetas por número', () => {
    expect(TELEFONOS_RECIBO).toBe('868 156 1069 / 868 363 0211');
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

describe('buildValidacionUrl — URL pública que codifica el QR', () => {
  it('arma la URL de validación con el id del recibo', () => {
    expect(buildValidacionUrl('abc-123')).toBe('https://frontend-production-96a0.up.railway.app/validar/abc-123');
  });
});

describe('buildQrDataUri — genera el QR real como data-uri (funciona en navegador y en Node)', () => {
  it('devuelve un data-uri de imagen PNG codificando la URL', async () => {
    const uri = await buildQrDataUri('https://frontend-production-96a0.up.railway.app/validar/abc-123');
    expect(uri).toMatch(/^data:image\/png;base64,/);
  });
});

describe('getLoteInfo — TODOS los lotes del contrato (bug: recibo/contrato solo mostraban lots[0])', () => {
  it('un solo lote — no rompe el caso simple', () => {
    const lots = [{ lot: { manzana: 1, lotNumber: '3', areaM2: 200 } }];
    expect(getLoteInfo(lots)).toEqual({ loteLabel: 'M1 L-3', areaLabel: '200 m²' });
  });

  it('dos lotes en manzanas distintas — se listan ambos, no solo el primero', () => {
    const lots = [
      { lot: { manzana: 1, lotNumber: '3', areaM2: 200 } },
      { lot: { manzana: 7, lotNumber: '3', areaM2: 180 } },
    ];
    expect(getLoteInfo(lots)).toEqual({ loteLabel: 'M1 L-3 · M7 L-3', areaLabel: '380 m²' });
  });

  it('dos lotes en la misma manzana — se agrupan (mismo formato que formatLotsLabel)', () => {
    const lots = [
      { lot: { manzana: 9, lotNumber: '9', areaM2: 200 } },
      { lot: { manzana: 9, lotNumber: '10', areaM2: 210 } },
    ];
    expect(getLoteInfo(lots)).toEqual({ loteLabel: 'M9 L-9, L-10', areaLabel: '410 m²' });
  });

  it('sin lotes / undefined — no revienta', () => {
    expect(getLoteInfo(undefined)).toEqual({ loteLabel: '—', areaLabel: '—' });
    expect(getLoteInfo([])).toEqual({ loteLabel: '—', areaLabel: '—' });
  });

  it('redondea el área total a 2 decimales', () => {
    const lots = [
      { lot: { manzana: 1, lotNumber: '1', areaM2: 100.111 } },
      { lot: { manzana: 1, lotNumber: '2', areaM2: 50.222 } },
    ];
    expect(getLoteInfo(lots).areaLabel).toBe('150.33 m²');
  });
});
