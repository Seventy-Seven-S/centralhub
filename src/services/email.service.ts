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

export async function sendWelcomeEmail(
  email: string,
  firstName: string,
  contractNumber: string,
  projectName: string,
  lotLabel: string,
  monthlyPayment: number,
  portalUrl: string = 'http://localhost:3000/portal',
  tempPassword?: string
): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const monthlyFormatted = monthlyPayment.toLocaleString('es-MX', { minimumFractionDigits: 2 });

  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
    to: email,
    subject: `Bienvenido a Central Inmobiliaria — Contrato ${contractNumber}`,
    html: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#F0EDE8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0EDE8;padding:48px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#0D2818 0%,#1A3A2A 60%,#2D5A3D 100%);padding:40px 48px 36px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="margin:0 0 4px;color:rgba(255,255,255,0.5);font-size:11px;letter-spacing:0.15em;text-transform:uppercase;font-weight:600;">Sistema de Gestión Inmobiliaria</p>
            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">CentralHub</h1>
            <p style="margin:6px 0 0;color:#A8C5B0;font-size:13px;">Central Inmobiliaria</p>
          </td>
          <td align="right" valign="top">
            <div style="display:inline-block;background:rgba(201,151,44,0.15);border:1.5px solid #C9972C;border-radius:8px;padding:8px 16px;">
              <p style="margin:0;color:#C9972C;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Contrato</p>
              <p style="margin:2px 0 0;color:#E8B84B;font-size:20px;font-weight:800;letter-spacing:0.05em;">${contractNumber}</p>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- BANNER BIENVENIDA -->
  <tr>
    <td style="background:#F7F9F7;padding:40px 48px 32px;border-bottom:1px solid #E8EDE8;">
      <p style="margin:0 0 6px;color:#2D6A4F;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">¡Felicidades!</p>
      <h2 style="margin:0 0 12px;color:#0D2818;font-size:32px;font-weight:800;line-height:1.15;letter-spacing:-0.5px;">${firstName},<br>ya eres parte de<br>nuestra familia.</h2>
      <p style="margin:0;color:#6B7C74;font-size:15px;line-height:1.65;">Tu contrato ha sido registrado exitosamente en nuestro sistema. A continuación encontrarás los detalles de tu inversión.</p>
    </td>
  </tr>

  <!-- DETALLES DEL CONTRATO -->
  <tr>
    <td style="padding:32px 48px;">
      <p style="margin:0 0 16px;color:#0D2818;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Detalles de tu contrato</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5EDE5;border-radius:10px;overflow:hidden;">
        <tr style="background:#F7F9F7;">
          <td style="padding:14px 20px;border-bottom:1px solid #E5EDE5;">
            <span style="color:#6B7C74;font-size:13px;">Número de contrato</span>
            <span style="float:right;color:#0D2818;font-size:14px;font-weight:800;letter-spacing:0.05em;">${contractNumber}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid #E5EDE5;">
            <span style="color:#6B7C74;font-size:13px;">Proyecto</span>
            <span style="float:right;color:#0D2818;font-size:14px;font-weight:700;">${projectName}</span>
          </td>
        </tr>
        <tr style="background:#F7F9F7;">
          <td style="padding:14px 20px;border-bottom:1px solid #E5EDE5;">
            <span style="color:#6B7C74;font-size:13px;">Lote</span>
            <span style="float:right;color:#0D2818;font-size:14px;font-weight:700;">${lotLabel}</span>
          </td>
        </tr>
        <tr style="background:#1A3A2A;">
          <td style="padding:16px 20px;">
            <span style="color:#A8C5B0;font-size:13px;font-weight:600;">Mensualidad</span>
            <span style="float:right;color:#ffffff;font-size:20px;font-weight:800;">$${monthlyFormatted} <span style="font-size:12px;font-weight:400;color:#A8C5B0;">MXN</span></span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- PRÓXIMOS PASOS -->
  <tr>
    <td style="padding:0 48px 32px;">
      <p style="margin:0 0 16px;color:#0D2818;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Próximos pasos</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9F7;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;border-bottom:1px solid #E8EDE8;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:14px;vertical-align:top;">
                  <div style="width:28px;height:28px;background:#2D6A4F;border-radius:50%;text-align:center;line-height:28px;color:#ffffff;font-size:13px;font-weight:700;">1</div>
                </td>
                <td>
                  <p style="margin:0;color:#0D2818;font-size:14px;font-weight:700;">Accede a tu portal</p>
                  <p style="margin:2px 0 0;color:#6B7C74;font-size:13px;">Ingresa con tu email y contraseña para ver tu cuenta</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 20px;border-bottom:1px solid #E8EDE8;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:14px;vertical-align:top;">
                  <div style="width:28px;height:28px;background:#2D6A4F;border-radius:50%;text-align:center;line-height:28px;color:#ffffff;font-size:13px;font-weight:700;">2</div>
                </td>
                <td>
                  <p style="margin:0;color:#0D2818;font-size:14px;font-weight:700;">Descarga tu estado de cuenta</p>
                  <p style="margin:2px 0 0;color:#6B7C74;font-size:13px;">Disponible en PDF desde tu portal en cualquier momento</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 20px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:14px;vertical-align:top;">
                  <div style="width:28px;height:28px;background:#2D6A4F;border-radius:50%;text-align:center;line-height:28px;color:#ffffff;font-size:13px;font-weight:700;">3</div>
                </td>
                <td>
                  <p style="margin:0;color:#0D2818;font-size:14px;font-weight:700;">Consulta tu plan de pagos completo</p>
                  <p style="margin:2px 0 0;color:#6B7C74;font-size:13px;">Revisa fechas de vencimiento y montos de cada cuota</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${tempPassword ? `
  <!-- CREDENCIALES -->
  <tr>
    <td style="padding:0 48px 32px;">
      <p style="margin:0 0 16px;color:#0D2818;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Tus credenciales de acceso</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5EDE5;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid #E5EDE5;background:#F7F9F7;">
            <span style="color:#6B7C74;font-size:13px;">Email</span>
            <span style="float:right;color:#0D2818;font-size:14px;font-weight:700;">${email}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 20px;background:#FFFBEB;">
            <span style="color:#6B7C74;font-size:13px;display:block;margin-bottom:10px;">Contraseña temporal</span>
            <div style="background:#FEF3C7;border:1.5px dashed #F59E0B;border-radius:8px;padding:14px 20px;text-align:center;">
              <p style="margin:0;color:#92400E;font-size:24px;font-weight:800;letter-spacing:0.12em;font-family:'Courier New',Courier,monospace;">${tempPassword}</p>
            </div>
          </td>
        </tr>
      </table>
      <p style="margin:12px 0 0;color:#9CA3AF;font-size:12px;line-height:1.6;">⚠️ Por tu seguridad, te recomendamos cambiar tu contraseña al ingresar por primera vez.</p>
    </td>
  </tr>
  ` : ''}

  <!-- CTA -->
  <tr>
    <td style="padding:0 48px 40px;text-align:center;">
      <a href="${portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#1A3A2A,#2D6A4F);color:#ffffff;padding:16px 40px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.02em;box-shadow:0 4px 12px rgba(26,58,42,0.3);">Acceder a mi portal →</a>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#0D2818;padding:28px 48px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="margin:0 0 2px;color:#ffffff;font-size:15px;font-weight:700;letter-spacing:-0.2px;">Central Inmobiliaria</p>
            <p style="margin:0;color:#A8C5B0;font-size:12px;">Av. Las Arboledas No. 84 · Tel: 868 156 1069</p>
          </td>
          <td align="right" valign="middle">
            <p style="margin:0;color:#4A7A5A;font-size:11px;">© ${new Date().getFullYear()} CentralHub</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`,
  });
}
