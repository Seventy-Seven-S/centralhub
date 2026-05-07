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
<body style="margin:0;padding:0;background:#F4F6F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <tr>
          <td style="background:#0F1F3D;padding:32px 40px;text-align:center;">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:#C9972C;border-radius:12px;margin-bottom:14px;font-size:26px;">🏠</div>
            <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Central Inmobiliaria</h1>
            <p style="margin:6px 0 0;color:#9BB0D0;font-size:13px;">Sistema de Gestión CentralHub</p>
          </td>
        </tr>

        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 6px;color:#374151;font-size:16px;">Hola, <strong>${firstName}</strong></p>
            <p style="margin:0 0 32px;color:#6B7280;font-size:14px;line-height:1.6;">
              Ingresa el siguiente código para completar tu inicio de sesión.<br>
              Es válido por <strong>10 minutos</strong>.
            </p>

            <div style="background:#F9FAFB;border:2px dashed #C9972C;border-radius:12px;padding:28px;text-align:center;margin-bottom:32px;">
              <p style="margin:0 0 10px;color:#9CA3AF;font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Código de verificación</p>
              <p style="margin:0;color:#0F1F3D;font-size:44px;font-weight:800;letter-spacing:14px;font-family:'Courier New',monospace;">${code}</p>
            </div>

            <p style="margin:0;color:#9CA3AF;font-size:12px;text-align:center;line-height:1.7;">
              Si no solicitaste este código, ignora este correo.<br>Tu cuenta permanece segura.
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#F9FAFB;padding:18px 40px;text-align:center;border-top:1px solid #E5E7EB;">
            <p style="margin:0;color:#D1D5DB;font-size:12px;">© ${new Date().getFullYear()} Central Inmobiliaria · Seventy Seven Studio</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
