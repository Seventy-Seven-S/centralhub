import { describe, it, expect, vi, beforeEach } from 'vitest';

const update = vi.fn();
const enviar = vi.fn();

vi.mock('../../config/database', () => ({ prisma: { reciboLog: { update: (...a: any[]) => update(...a) } } }));
vi.mock('../email.service', () => ({ sendReciboEmail: (...a: any[]) => enviar(...a) }));

const DATOS: any = { reciboId: 'r1', folio: 'F-1', clienteNombre: 'Ana', proyecto: 'X', loteLabel: null,
  numeroCuota: 1, plazoTotal: 60, mes: 'enero', montoPagado: 100, fechaPago: new Date(), concepto: 'c', balanceDespues: 0 };

beforeEach(() => { update.mockReset().mockResolvedValue({}); enviar.mockReset().mockResolvedValue(undefined); });

describe('enviarYRegistrarRecibo', () => {
  it('envío exitoso → deja ENVIADO con el destino y sin error', async () => {
    const { enviarYRegistrarRecibo } = await import('../reciboLog.service');
    expect(await enviarYRegistrarRecibo('r1', 'ana@gmail.com', DATOS)).toBe('ENVIADO');
    expect(enviar).toHaveBeenCalledWith('ana@gmail.com', DATOS);
    expect(update.mock.calls[0][0].data).toMatchObject({
      envioEstado: 'ENVIADO', envioDestino: 'ana@gmail.com', envioError: null,
    });
  });

  it('si Resend falla → FALLO con el mensaje guardado, y NO relanza', async () => {
    enviar.mockRejectedValue(new Error('domain is not verified'));
    const { enviarYRegistrarRecibo } = await import('../reciboLog.service');
    expect(await enviarYRegistrarRecibo('r1', 'ana@gmail.com', DATOS)).toBe('FALLO');
    expect(update.mock.calls[0][0].data).toMatchObject({
      envioEstado: 'FALLO', envioError: 'domain is not verified',
    });
  });

  it('cliente sin correo → SIN_CORREO y ni siquiera se intenta enviar', async () => {
    const { enviarYRegistrarRecibo } = await import('../reciboLog.service');
    expect(await enviarYRegistrarRecibo('r1', null, DATOS)).toBe('SIN_CORREO');
    expect(enviar).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].data).toMatchObject({ envioEstado: 'SIN_CORREO', envioDestino: null });
  });

  it('cuenta el intento, para distinguir un reenvío de un primer envío', async () => {
    const { enviarYRegistrarRecibo } = await import('../reciboLog.service');
    await enviarYRegistrarRecibo('r1', 'ana@gmail.com', DATOS);
    expect(update.mock.calls[0][0].data.envioIntentos).toEqual({ increment: 1 });
  });

  it('si NI SIQUIERA se puede anotar el resultado, no revienta: el pago ya ocurrió', async () => {
    update.mockRejectedValue(new Error('base caída'));
    const { enviarYRegistrarRecibo } = await import('../reciboLog.service');
    await expect(enviarYRegistrarRecibo('r1', 'ana@gmail.com', DATOS)).resolves.toBe('ENVIADO');
  });

  it('un correo con espacios se guarda limpio', async () => {
    const { enviarYRegistrarRecibo } = await import('../reciboLog.service');
    await enviarYRegistrarRecibo('r1', '  ana@gmail.com  ', DATOS);
    expect(update.mock.calls[0][0].data.envioDestino).toBe('ana@gmail.com');
  });
});
