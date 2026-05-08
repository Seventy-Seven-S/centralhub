import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationCode(email: string, firstName: string, code: string) {
  await resend.emails.send({
    from:    process.env.EMAIL_FROM ?? 'onboarding@resend.dev',
    to:      email,
    subject: `Tu código de verificación: ${code}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F8F7F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#1A3A2A;padding:32px 40px;text-align:center;">
            <div style="display:inline-block;width:52px;height:52px;background:#2D6A4F;border-radius:12px;margin-bottom:14px;line-height:52px;text-align:center;font-size:26px;color:white;">⌂</div>
            <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.2px;">Central Inmobiliaria</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.6);font-size:13px;">CentralHub · Sistema de Gestión</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 32px;">
            <p style="margin:0 0 8px;color:#0D1F17;font-size:16px;font-weight:600;">Hola, ${firstName}</p>
            <p style="margin:0 0 28px;color:#6B7C74;font-size:14px;line-height:1.6;">
              Ingresa el siguiente código para completar tu inicio de sesión.<br>
              Es válido por <strong style="color:#0D1F17;">10 minutos</strong>.
            </p>

            <div style="background:#F0F5F0;border:1px solid #D0E4D0;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;">
              <p style="margin:0 0 12px;color:#6B7C74;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;">Código de verificación</p>
              <p style="margin:0;color:#1A3A2A;font-size:40px;font-weight:700;letter-spacing:0.15em;font-family:'Courier New',Courier,monospace;">${code}</p>
            </div>

            <p style="margin:0;color:#9AADA5;font-size:12px;text-align:center;line-height:1.7;">
              Válido por 10 minutos · Si no solicitaste este código, ignora este correo.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F0F5F0;padding:20px 40px;text-align:center;">
            <p style="margin:0;color:#9AADA5;font-size:12px;">© ${new Date().getFullYear()} Central Inmobiliaria · Seventy Seven Studio</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
