import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('resend', () => ({ Resend: vi.fn(function () { return { emails: { send: mocks.send } }; }) }));
vi.mock('../../utils/logger', () => ({ logger: mocks.logger }));

const RECIBO = {
  folio: 'REC-V463-9de60',
  clienteNombre: 'Dulce Maria Guijarro Rosado',
  proyecto: 'Valle del Roble',
  loteLabel: 'M13 L-29',
  numeroCuota: 9,
  plazoTotal: 60,
  mes: 'septiembre de 2026',
  montoPagado: 4500,
  fechaPago: new Date('2026-09-09T12:00:00Z'),
  concepto: 'Mensualidad',
  balanceDespues: 229500,
  reciboId: 'rec-uuid-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.RESEND_API_KEY = 're_test';
  process.env.CORS_ORIGIN = 'https://frontend-production-96a0.up.railway.app';
  mocks.send.mockResolvedValue({ data: { id: 'e1' }, error: null });
});

async function enviar(over: Partial<typeof RECIBO> = {}, email = 'cliente@gmail.com') {
  const { sendReciboEmail } = await import('../email.service');
  await sendReciboEmail(email, { ...RECIBO, ...over });
  return mocks.send.mock.calls[0]?.[0];
}

describe('sendReciboEmail — el comprobante que recibe el cliente al pagar', () => {
  it('lleva el folio, el monto y de qué cuota se trata', async () => {
    const msg = await enviar();
    expect(msg.to).toBe('cliente@gmail.com');
    expect(msg.html).toContain('REC-V463-9de60');
    expect(msg.html).toContain('4,500.00');
    expect(msg.html).toContain('9');
    expect(msg.html).toContain('60');
  });

  it('el asunto identifica el pago sin obligar a abrirlo', async () => {
    expect((await enviar()).subject).toMatch(/recibo/i);
  });

  it('incluye el enlace público de validación con el id del recibo', async () => {
    const { html } = await enviar();
    expect(html).toContain('https://frontend-production-96a0.up.railway.app/validar/rec-uuid-1');
  });

  it('muestra el saldo que queda después del pago', async () => {
    expect((await enviar()).html).toContain('229,500.00');
  });

  it('un saldo liquidado se dice, no se muestra $0.00 a secas', async () => {
    const { html } = await enviar({ balanceDespues: 0 });
    expect(html).toMatch(/liquidad/i);
  });

  it('sin lote no imprime "null" en el papel', async () => {
    const { html } = await enviar({ loteLabel: null as any });
    expect(html).not.toContain('null');
    expect(html).not.toContain('undefined');
  });

  it('nunca deja marcadores de plantilla sin sustituir', async () => {
    expect((await enviar()).html).not.toContain('${');
  });

  it('si Resend falla NO lanza —el pago ya se registró— pero lo loguea', async () => {
    mocks.send.mockResolvedValue({ data: null, error: { message: 'rate limited', name: 'error' } });
    const { sendReciboEmail } = await import('../email.service');
    await expect(sendReciboEmail('c@gmail.com', RECIBO)).resolves.toBeUndefined();
    expect(mocks.logger.error).toHaveBeenCalledOnce();
    expect(mocks.logger.error.mock.calls[0][0]).toContain('REC-V463-9de60');
  });

  it('sin correo no intenta enviar ni truena', async () => {
    const { sendReciboEmail } = await import('../email.service');
    await expect(sendReciboEmail('', RECIBO)).resolves.toBeUndefined();
    await expect(sendReciboEmail(null as any, RECIBO)).resolves.toBeUndefined();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
