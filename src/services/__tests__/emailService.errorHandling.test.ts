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
  process.env.RESEND_API_KEY = 're_test_key';
});

describe('sendVerificationCode — revisa .error de Resend, no asume éxito', () => {
  it('Resend responde error → lanza EmailSendError y loguea el error real + destino', async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { message: 'You can only send testing emails to your own email address', statusCode: 403, name: 'validation_error' },
    });

    const { sendVerificationCode } = await import('../email.service');
    const { EmailSendError } = await import('../../utils/errors');

    await expect(sendVerificationCode('otro@example.com', 'Ana', '123456')).rejects.toThrow(EmailSendError);

    expect(mocks.logger.error).toHaveBeenCalledOnce();
    const logged = mocks.logger.error.mock.calls[0][0];
    expect(logged).toContain('otro@example.com');
    expect(logged).toContain('You can only send testing emails to your own email address');
  });

  it('Resend responde éxito → no lanza, no loguea error', async () => {
    mocks.send.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    const { sendVerificationCode } = await import('../email.service');

    await expect(sendVerificationCode('ana@example.com', 'Ana', '123456')).resolves.toBeUndefined();
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });
});

describe('sendWelcomeEmail — falla registrada, pero NO bloquea (el contrato ya existe)', () => {
  it('Resend responde error → NO lanza (no se puede bloquear), pero loguea el fallo con detalle', async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { message: 'Domain not verified', statusCode: 403, name: 'validation_error' },
    });

    const { sendWelcomeEmail } = await import('../email.service');

    await expect(
      sendWelcomeEmail('cliente@example.com', 'Juan', 'MON1-001', 'Monarca', 'M1 L1', 5000),
    ).resolves.toBeUndefined();

    expect(mocks.logger.error).toHaveBeenCalledOnce();
    const logged = mocks.logger.error.mock.calls[0][0];
    expect(logged).toContain('cliente@example.com');
    expect(logged).toContain('Domain not verified');
  });

  it('Resend responde éxito → no loguea error', async () => {
    mocks.send.mockResolvedValue({ data: { id: 'email-2' }, error: null });

    const { sendWelcomeEmail } = await import('../email.service');
    await sendWelcomeEmail('cliente@example.com', 'Juan', 'MON1-001', 'Monarca', 'M1 L1', 5000);

    expect(mocks.logger.error).not.toHaveBeenCalled();
  });
});
