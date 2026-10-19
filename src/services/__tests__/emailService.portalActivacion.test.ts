import { describe, it, expect, vi, beforeEach } from 'vitest';

// Con el portal encendido, el correo de bienvenida lleva el enlace de
// activación y NUNCA una contraseña.
const enviados: any[] = [];
const respuesta = { error: null as null | { message: string; name: string } };
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: async (m: any) => { enviados.push(m); return respuesta; } };
  },
}));
vi.mock('../../utils/portalClientes', () => ({ PORTAL_DE_CLIENTES_ACTIVO: true }));

const URL_ACTIVACION = 'https://app.example.com/portal/activar?token=abc123';

beforeEach(() => {
  enviados.length = 0;
  respuesta.error = null;
  process.env.RESEND_API_KEY = 'test';
  vi.resetModules();
});

describe('bienvenida con el portal encendido', () => {
  it('trae el botón al enlace de activación y ninguna contraseña', async () => {
    const m = await import('../email.service');
    await m.sendWelcomeEmail('ana@correo.com', 'Ana', 'SAN-H001', 'Santander', 'M1 L1', 3473, undefined, URL_ACTIVACION);
    const html = enviados.at(-1)!.html as string;
    expect(html).toContain(`href="${URL_ACTIVACION}"`);
    expect(html).toMatch(/crear mi contraseña/i);
    expect(html).not.toMatch(/contraseña temporal/i);
    expect(html).toMatch(/vence en 7 días/i);
  });

  it('sin enlace (ya tenía cuenta) lleva al login del portal', async () => {
    const m = await import('../email.service');
    await m.sendWelcomeEmail('ana@correo.com', 'Ana', 'SAN-H001', 'Santander', 'M1 L1', 3473, 'https://app.example.com/portal');
    const html = enviados.at(-1)!.html as string;
    expect(html).toContain('href="https://app.example.com/portal"');
    expect(html).not.toContain('activar?token');
  });
});

describe('sendPortalAccessEmail (reenvío desde la ficha)', () => {
  it('manda el enlace al cliente', async () => {
    const m = await import('../email.service');
    await m.sendPortalAccessEmail('ana@correo.com', 'Ana', URL_ACTIVACION);
    expect(enviados.at(-1)!.to).toBe('ana@correo.com');
    expect(enviados.at(-1)!.html).toContain(`href="${URL_ACTIVACION}"`);
  });

  it('si Resend falla, lanza para que el equipo se entere', async () => {
    respuesta.error = { message: 'dominio no verificado', name: 'validation_error' };
    const m = await import('../email.service');
    await expect(m.sendPortalAccessEmail('ana@correo.com', 'Ana', URL_ACTIVACION)).rejects.toMatchObject({
      code: 'EMAIL_SEND_FAILED',
    });
  });
});
