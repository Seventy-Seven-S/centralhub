import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const send = vi.fn();
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
  return { send, logger };
});

vi.mock('resend', () => ({
  Resend: vi.fn(function () {
    return { emails: { send: mocks.send } };
  }),
}));
vi.mock('../../utils/logger', () => ({ logger: mocks.logger }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.CORS_ORIGIN = 'https://frontend-production-96a0.up.railway.app';
  delete process.env.APP_URL;
  mocks.send.mockResolvedValue({ data: { id: 'email-1' }, error: null });
});

async function enviar(over: Partial<Record<string, string>> = {}) {
  const { sendStaffWelcomeEmail } = await import('../email.service');
  await sendStaffWelcomeEmail(
    over.email ?? 'arquitecto@example.com',
    over.firstName ?? 'Alberto',
    over.role ?? 'ADMIN',
    over.tempPassword ?? 'Tmp#2026abc',
  );
  return mocks.send.mock.calls[0][0];
}

describe('sendStaffWelcomeEmail — alta de usuario interno', () => {
  it('incluye las credenciales: el correo y la contraseña temporal', async () => {
    const msg = await enviar();
    expect(msg.to).toBe('arquitecto@example.com');
    expect(msg.html).toContain('arquitecto@example.com');
    expect(msg.html).toContain('Tmp#2026abc');
  });

  it('traduce el rol a español en vez de mostrar el enum', async () => {
    expect((await enviar({ role: 'ADMIN' })).html).toContain('Administrador');
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ data: { id: 'e' }, error: null });
    expect((await enviar({ role: 'MANAGER' })).html).toContain('Gerente');
  });

  it('anticipa el 2FA: avisa que llegará un código a este mismo correo', async () => {
    const { html } = await enviar();
    expect(html).toMatch(/código/i);
    expect(html).toContain('10 minutos');
  });

  it('apunta el botón al /login del frontend real, derivado de CORS_ORIGIN', async () => {
    const { html } = await enviar();
    expect(html).toContain('https://frontend-production-96a0.up.railway.app/login');
  });

  it('APP_URL gana sobre CORS_ORIGIN cuando está definida', async () => {
    process.env.APP_URL = 'https://app.centralinmob.com';
    const { html } = await enviar();
    expect(html).toContain('https://app.centralinmob.com/login');
  });

  it('con varios orígenes en CORS_ORIGIN toma el primero', async () => {
    process.env.CORS_ORIGIN = 'https://app.centralinmob.com,http://localhost:3000';
    const { html } = await enviar();
    expect(html).toContain('https://app.centralinmob.com/login');
  });

  it('si Resend falla NO lanza (el usuario ya se creó), pero loguea el fallo con destino y motivo', async () => {
    mocks.send.mockResolvedValue({ data: null, error: { message: 'domain not verified', name: 'validation_error' } });
    const { sendStaffWelcomeEmail } = await import('../email.service');

    await expect(sendStaffWelcomeEmail('arq@example.com', 'Alberto', 'ADMIN', 'Tmp#1')).resolves.toBeUndefined();

    expect(mocks.logger.error).toHaveBeenCalledOnce();
    const logged = mocks.logger.error.mock.calls[0][0];
    expect(logged).toContain('arq@example.com');
    expect(logged).toContain('domain not verified');
  });

  it('nunca deja el marcador de la plantilla sin sustituir', async () => {
    const { html } = await enviar();
    expect(html).not.toContain('${');
    expect(html).not.toContain('undefined');
  });
});
