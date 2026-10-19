// src/jobs/verificarCorreo.job.ts
// Verificación diaria de que el correo sale. Si Resend se cae, la llave se
// revoca o el dominio pierde su verificación, los recibos fallan uno por uno
// sin que nadie se entere hasta que un cliente reclama — y el 2FA del staff
// también depende del correo. Este job lo detecta y avisa a los ADMIN en la
// campana de la app (no por correo: justo es lo que está caído).
//
// Cómo verifica:
//   - Con EMAIL_HEALTHCHECK_TO: manda un correo de prueba a esa dirección. Es
//     la prueba completa (llave + dominio + envío real).
//   - Sin ella: consulta a Resend el estado del dominio del remitente, sin
//     mandar nada. Si la llave es "solo envío" Resend no deja leer dominios;
//     entonces no se puede verificar y solo se deja aviso en el log.
//   - Con EMAIL_TRANSPORT=console (local, fuera de producción) no hace nada:
//     la copia local trae correos reales de clientes.
import cron from 'node-cron';
import { Resend } from 'resend';
import notificationService from '../services/notification.service';
import { logger } from '../utils/logger';
import { resumirError } from '../services/lib/envioRecibo';
import { dominioDeRemitente, evaluarDominio, esLlaveSoloEnvio } from '../services/lib/saludCorreo';

export type ResultadoVerificacion =
  | { estado: 'OK'; metodo: 'PRUEBA' | 'DOMINIO' }
  | { estado: 'FALLA'; motivo: string }
  | { estado: 'SIN_VERIFICAR'; motivo: string }
  | { estado: 'OMITIDO'; motivo: string };

/** Lo que el job usa de Resend; se inyecta en las pruebas. */
export interface ClienteCorreo {
  emails:  { send(payload: { from: string; to: string; subject: string; html: string }): Promise<{ error: unknown }> };
  domains: { list(): Promise<{ data: { data: Array<{ name: string; status: string }> } | null; error: { name?: string; message?: string } | null }> };
}

interface Dependencias {
  env?: NodeJS.ProcessEnv;
  crearCliente?: (apiKey: string) => ClienteCorreo;
  notificar?: (mensaje: string) => Promise<unknown>;
}

const crearClienteResend = (apiKey: string) => new Resend(apiKey) as unknown as ClienteCorreo;

const notificarAdmins = (mensaje: string) =>
  notificationService.createForAudiences(
    { type: 'SYSTEM', message: mensaje, relatedEntity: 'email' },
    ['ADMIN'],
  );

/** Solo diagnostica; no avisa ni loguea. */
export async function diagnosticarCorreo(
  env: NodeJS.ProcessEnv,
  crearCliente: (apiKey: string) => ClienteCorreo,
): Promise<ResultadoVerificacion> {
  // Mismo criterio que email.service: en producción el correo siempre sale.
  if (env.NODE_ENV !== 'production' && env.EMAIL_TRANSPORT === 'console') {
    return { estado: 'OMITIDO', motivo: 'EMAIL_TRANSPORT=console: no se envía correo real' };
  }
  if (!env.RESEND_API_KEY) return { estado: 'FALLA', motivo: 'RESEND_API_KEY no está configurada' };

  const from = env.EMAIL_FROM;
  if (!from) return { estado: 'FALLA', motivo: 'EMAIL_FROM no está configurado' };

  try {
    const cliente = crearCliente(env.RESEND_API_KEY);
    const destino = env.EMAIL_HEALTHCHECK_TO?.trim();

    if (destino) {
      const { error } = await cliente.emails.send({
        from,
        to:      destino,
        subject: 'CentralHub · prueba diaria del correo',
        html:    '<p>Correo automático de prueba: si te llega, los recibos y códigos de acceso están saliendo bien. No hay que hacer nada.</p>',
      });
      if (error) return { estado: 'FALLA', motivo: `Resend rechazó el correo de prueba: ${resumirError(error)}` };
      return { estado: 'OK', metodo: 'PRUEBA' };
    }

    const dominio = dominioDeRemitente(from);
    if (!dominio) return { estado: 'FALLA', motivo: `EMAIL_FROM no es una dirección válida: ${from}` };

    const { data, error } = await cliente.domains.list();
    if (esLlaveSoloEnvio(error)) {
      return {
        estado: 'SIN_VERIFICAR',
        motivo: 'la llave de Resend es de solo envío y no permite consultar el dominio; configura EMAIL_HEALTHCHECK_TO para probar con un correo',
      };
    }
    if (error) return { estado: 'FALLA', motivo: `Resend no respondió: ${resumirError(error)}` };

    const evaluacion = evaluarDominio(data?.data ?? [], dominio);
    if (!evaluacion.ok) return { estado: 'FALLA', motivo: evaluacion.motivo };
    return { estado: 'OK', metodo: 'DOMINIO' };
  } catch (err) {
    // Red caída, DNS, timeout: el SDK lanza en vez de devolver error.
    return { estado: 'FALLA', motivo: `no se pudo contactar a Resend: ${resumirError(err)}` };
  }
}

export async function verificarCorreo(deps: Dependencias = {}): Promise<ResultadoVerificacion> {
  const resultado = await diagnosticarCorreo(deps.env ?? process.env, deps.crearCliente ?? crearClienteResend);

  switch (resultado.estado) {
    case 'OK':
      logger.info(`[verificarCorreo.job] correo funcionando (${resultado.metodo === 'PRUEBA' ? 'correo de prueba enviado' : 'dominio verificado'})`);
      break;
    case 'OMITIDO':
      logger.info(`[verificarCorreo.job] omitido — ${resultado.motivo}`);
      break;
    case 'SIN_VERIFICAR':
      logger.warn(`[verificarCorreo.job] no se pudo verificar — ${resultado.motivo}`);
      break;
    case 'FALLA':
      logger.error(`[verificarCorreo.job] EL CORREO NO ESTÁ SALIENDO — ${resultado.motivo}`);
      try {
        await (deps.notificar ?? notificarAdmins)(
          `El correo dejó de funcionar: ${resultado.motivo}. Los recibos y los códigos de acceso no les están llegando a los clientes ni al personal.`,
        );
      } catch (err) {
        logger.error(`[verificarCorreo.job] tampoco se pudo crear la notificación: ${resumirError(err)}`);
      }
      break;
  }
  return resultado;
}

export function startVerificarCorreoJob(): void {
  // 8:00 hora de Ciudad de México: antes de abrir ventanilla, para que el aviso
  // esté en la campana cuando empiezan los cobros del día.
  cron.schedule('0 8 * * *', async () => {
    await verificarCorreo();
  }, { timezone: 'America/Mexico_City' });
  console.log('[verificarCorreo.job] Cron registrado — corre cada día a las 08:00 (CDMX)');
}
