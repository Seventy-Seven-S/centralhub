import { describe, it, expect, vi, beforeEach } from 'vitest';

// Con el portal de clientes apagado por instrucción del arquitecto, el correo
// de bienvenida NO debe mencionarlo ni filtrar la contraseña temporal. Esta
// prueba existe para que nadie lo reactive sin darse cuenta.
const enviados: any[] = [];
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: async (m: any) => { enviados.push(m); return { error: null }; } };
  },
}));

describe('correo de bienvenida con el portal apagado', () => {
  beforeEach(() => {
    enviados.length = 0;
    process.env.RESEND_API_KEY = 'test';
    vi.resetModules();
  });

  const enviarCon = async (tempPassword?: string) => {
    const m = await import('../email.service');
    await m.sendWelcomeEmail(
      'cliente@example.com', 'Ana', 'SAN-H001', 'Santander', 'M1 L1', 3473,
      'https://portal.example.com', tempPassword,
    );
    return enviados.at(-1)!.html as string;
  };

  it('no muestra la contraseña temporal aunque se la pasen', async () => {
    const html = await enviarCon('perez1234');
    expect(html).not.toContain('perez1234');
    expect(html).not.toMatch(/contraseña temporal/i);
    expect(html).not.toMatch(/credenciales/i);
  });

  it('no trae el botón ni la liga del portal', async () => {
    const html = await enviarCon('perez1234');
    expect(html).not.toContain('https://portal.example.com');
    expect(html).not.toMatch(/acceder a mi portal/i);
  });

  it('no menciona el portal en ninguna parte del texto', async () => {
    const html = await enviarCon('perez1234');
    expect(html).not.toMatch(/portal/i);
  });

  it('sigue diciendo lo importante: contrato, proyecto, lote y mensualidad', async () => {
    const html = await enviarCon();
    expect(html).toContain('SAN-H001');
    expect(html).toContain('Santander');
    expect(html).toContain('M1 L1');
    expect(html).toContain('3,473');
  });
});
