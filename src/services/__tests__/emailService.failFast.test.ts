import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('resend', () => ({ Resend: vi.fn() }));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('email.service — fail-fast de RESEND_API_KEY', () => {
  it('producción sin RESEND_API_KEY → lanza al importar el módulo (no arranca el server)', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.RESEND_API_KEY;

    await expect(import('../email.service')).rejects.toThrow(/RESEND_API_KEY es obligatorio en producción/);
  });

  it('producción con RESEND_API_KEY presente → importa sin lanzar', async () => {
    process.env.NODE_ENV = 'production';
    process.env.RESEND_API_KEY = 're_test_key';

    await expect(import('../email.service')).resolves.toBeDefined();
  });

  it('desarrollo sin RESEND_API_KEY → importa sin lanzar (fail-fast solo aplica en producción)', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.RESEND_API_KEY;

    await expect(import('../email.service')).resolves.toBeDefined();
  });

  it('desarrollo sin RESEND_API_KEY → el intento de ENVIAR sí falla, con mensaje accionable', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.RESEND_API_KEY;

    const { sendVerificationCode } = await import('../email.service');
    await expect(sendVerificationCode('a@b.com', 'Ana', '123456')).rejects.toThrow(
      /RESEND_API_KEY no configurada/,
    );
  });
});
