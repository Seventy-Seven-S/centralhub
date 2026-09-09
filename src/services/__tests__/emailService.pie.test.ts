import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn(), logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('resend', () => ({ Resend: vi.fn(function () { return { emails: { send: mocks.send } }; }) }));
vi.mock('../../utils/logger', () => ({ logger: mocks.logger }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 're_test';
  process.env.CORS_ORIGIN = 'https://app.example.com';
  mocks.send.mockResolvedValue({ data: { id: 'e' }, error: null });
});

async function htmlDe(cual: 'staff' | 'recibo' | 'cliente') {
  const m = await import('../email.service');
  if (cual === 'staff') await m.sendStaffWelcomeEmail('a@b.com', 'Ana', 'ADMIN', 'Tmp#1');
  if (cual === 'cliente') await m.sendWelcomeEmail('a@b.com', 'Ana', 'C-1', 'Proyecto', 'M1 L1', 5000);
  if (cual === 'recibo') await m.sendReciboEmail('a@b.com', {
    reciboId: 'r1', folio: 'REC-1', clienteNombre: 'Ana', proyecto: 'P', loteLabel: 'M1 L1',
    numeroCuota: 1, plazoTotal: 60, mes: 'enero de 2026', montoPagado: 100,
    fechaPago: new Date('2026-01-01T12:00:00Z'), concepto: 'Mensualidad', balanceDespues: 900,
  });
  return mocks.send.mock.calls.at(-1)![0].html as string;
}

describe('pie de los correos — apilado, no en dos columnas', () => {
  it.each(['staff', 'recibo', 'cliente'] as const)('%s trae domicilio y ambos teléfonos completos', async cual => {
    const html = await htmlDe(cual);
    expect(html).toContain('C. Dieciséis 530, San Francisco, 87350 Heroica Matamoros, Tamps.');
    expect(html).toContain('868 156 1069 / 868 363 0211');
  });

  it.each(['staff', 'recibo', 'cliente'] as const)('%s NO usa el layout de dos columnas que partía la dirección', async cual => {
    const html = await htmlDe(cual);
    // El pie viejo metía el © en una celda con align="right" junto al domicilio,
    // y en pantallas angostas se encimaba con el teléfono.
    expect(html).not.toMatch(/align="right"[^>]*>\s*<p[^>]*>©/);
  });

  it('los tres correos comparten exactamente el mismo pie', async () => {
    const pie = (html: string) => html.slice(html.lastIndexOf('background:#0D2818'));
    const [a, b, c] = [await htmlDe('staff'), await htmlDe('recibo'), await htmlDe('cliente')];
    expect(pie(a)).toBe(pie(b));
    expect(pie(b)).toBe(pie(c));
  });
});
