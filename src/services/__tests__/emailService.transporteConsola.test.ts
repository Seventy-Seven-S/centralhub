import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const enviar = vi.fn();
vi.mock('resend', () => ({ Resend: class { emails = { send: enviar }; } }));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => { vi.resetModules(); enviar.mockReset(); });
afterEach(() => { process.env = { ...ORIGINAL_ENV }; vi.restoreAllMocks(); });

describe('email.service — transporte de consola para desarrollo local', () => {
  it('EMAIL_TRANSPORT=console → no llama a Resend aunque haya API key', async () => {
    process.env.NODE_ENV = 'development';
    process.env.EMAIL_TRANSPORT = 'console';
    process.env.RESEND_API_KEY = 're_llave_real_de_produccion';

    const { sendVerificationCode } = await import('../email.service');
    await expect(sendVerificationCode('cliente@real.com', 'Ana', '123456')).resolves.toBeUndefined();

    expect(enviar).not.toHaveBeenCalled();
  });

  it('EMAIL_TRANSPORT=console → deja el destinatario y el asunto en el log, para poder leer el código 2FA', async () => {
    process.env.NODE_ENV = 'development';
    process.env.EMAIL_TRANSPORT = 'console';
    delete process.env.RESEND_API_KEY;

    const { logger } = await import('../../utils/logger');
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => logger);

    const { sendVerificationCode } = await import('../email.service');
    await sendVerificationCode('cliente@real.com', 'Ana', '987654');

    const registrado = JSON.stringify(spy.mock.calls);
    expect(registrado).toContain('cliente@real.com');
    expect(registrado).toContain('987654');
  });

  it('produccion ignora EMAIL_TRANSPORT=console: ahi siempre se envia de verdad', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_TRANSPORT = 'console';
    process.env.RESEND_API_KEY = 're_test_key';
    enviar.mockResolvedValue({ error: null });

    const { sendVerificationCode } = await import('../email.service');
    await sendVerificationCode('cliente@real.com', 'Ana', '123456');

    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('sin EMAIL_TRANSPORT en desarrollo se conserva el comportamiento de hoy (usa Resend)', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.EMAIL_TRANSPORT;
    process.env.RESEND_API_KEY = 're_test_key';
    enviar.mockResolvedValue({ error: null });

    const { sendVerificationCode } = await import('../email.service');
    await sendVerificationCode('cliente@real.com', 'Ana', '123456');

    expect(enviar).toHaveBeenCalledTimes(1);
  });
});
