import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middlewares/errorHandler';
import { verificarFolio } from '../services/estadoCuenta.service';

const router = Router();

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
