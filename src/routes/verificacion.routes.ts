import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middlewares/errorHandler';
import { verificarFolio } from '../services/estadoCuenta.service';
import { verificarRecibo } from '../services/reciboLog.service';

const router = Router();

// Público, sin auth: cualquiera con el QR del recibo debe poder validarlo.
// Devuelve SOLO el snapshot inmutable guardado al emitir el recibo — nunca
// vuelve a consultar Contract/Client en vivo (ver el porqué en
// ReciboLog en schema.prisma).
router.get('/recibo/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const recibo = await verificarRecibo(id);

  if (!recibo) {
    return res.status(404).json({ valid: false, message: 'Recibo no encontrado' });
  }

  return res.status(200).json({
    valid:          true,
    folio:          recibo.folio,
    cliente:        recibo.clienteNombre,
    codigoLegado:   recibo.codigoLegado,
    proyecto:       recibo.proyecto,
    lote:           recibo.loteLabel,
    cuota:          recibo.numeroCuota,
    mes:            recibo.mes,
    monto:          recibo.montoPagado,
    fecha:          recibo.fechaPago,
    concepto:       recibo.concepto,
    emitidoEn:      recibo.issuedAt,
  });
}));

router.get('/:folio', asyncHandler(async (req: Request, res: Response) => {
  const { folio } = req.params;

  const log = await verificarFolio(folio) as any;

  if (!log) {
    return res.status(404).json({ valid: false, message: 'Folio no encontrado' });
  }

  return res.status(200).json({
    valid: true,
    folio: log.folio,
    contrato: {
      numero:     log.contract.contractNumber,
      proyecto:   log.contract.project.name,
      cliente:    `${log.contract.client.firstName} ${log.contract.client.lastName}`,
      generadoEn: log.generatedAt,
    },
  });
}));

export default router;
