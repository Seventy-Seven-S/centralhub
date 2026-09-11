// src/controllers/traspaso.controller.ts — un lote cambia de manos
import { Request, Response } from 'express';
import traspasoService from '../services/traspaso.service';
import { getFileStorage } from '../services/storage';
import { validateFileSignature } from '../utils/fileSignature';

// Misma lista que el documento de rescisión (contract.controller.ts): allá es
// una const local, no exportada.
const DOC_ALLOWED_MIMETYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export class TraspasoController {
  // POST /api/v1/traspasos  (multipart: `file` = documento firmado, opcional)
  async crear(req: Request, res: Response) {
    try {
      const b = req.body ?? {};

      // Se valida la firma REAL del archivo, no el nombre ni el mimetype que
      // declara el cliente. Mismo tratamiento que el doc de rescisión.
      const file = (req as any).file;
      let documentoUrl: string | undefined;
      if (file) {
        const detected = await validateFileSignature(file.buffer, DOC_ALLOWED_MIMETYPES);
        const ext = detected.mime === 'application/pdf' ? 'pdf'
                  : detected.mime === 'image/png' ? 'png' : 'jpg';
        documentoUrl = `traspasos/${b.contratoOrigenId}/${Date.now()}.${ext}`;
        await getFileStorage().saveFile(documentoUrl, file.buffer, detected.mime);
      }

      const traspaso = await traspasoService.crear({
        contratoOrigenId: b.contratoOrigenId,
        clienteNuevoId: b.clienteNuevoId,
        // En multipart un arreglo de un solo elemento llega como string.
        lotIdsDestino: Array.isArray(b.lotIdsDestino) ? b.lotIdsDestino : [b.lotIdsDestino].filter(Boolean),
        projectIdDestino: b.projectIdDestino,
        montoRespetado: Number(b.montoRespetado),
        fecha: b.fecha ? new Date(b.fecha) : undefined,
        motivo: b.motivo,
        nota: b.nota,
        documentoUrl,
        datosContratoDestino: b.datosContratoDestino
          ? {
              totalPrice: Number(b.datosContratoDestino.totalPrice),
              downPayment: Number(b.datosContratoDestino.downPayment),
              installmentAmount: Number(b.datosContratoDestino.installmentAmount),
              installmentCount: Number(b.datosContratoDestino.installmentCount),
              startDate: new Date(b.datosContratoDestino.startDate),
            }
          : undefined,
        // Del token, nunca del body: quien autoriza un traspaso queda
        // registrado y eso no puede falsificarse desde el cliente.
        userId: req.user!.userId,
      });
      res.status(201).json({ success: true, message: 'Traspaso registrado', data: traspaso });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  // GET /api/v1/traspasos
  async listar(_req: Request, res: Response) {
    try {
      res.json({ success: true, data: await traspasoService.listar() });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
  }

  // GET /api/v1/traspasos/:id
  async obtener(req: Request, res: Response) {
    try {
      res.json({ success: true, data: await traspasoService.obtener(req.params.id) });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
  }
}

export default new TraspasoController();
