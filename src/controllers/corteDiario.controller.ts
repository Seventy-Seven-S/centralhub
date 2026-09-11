// src/controllers/corteDiario.controller.ts
import { Request, Response } from 'express';
import { CorteDiarioStatus } from '@prisma/client';
import corteDiarioService from '../services/corteDiario.service';

const usuario = (req: Request) => ({ userId: req.user!.userId, role: req.user!.role });

export class CorteDiarioController {
  // GET /cortes-diarios/mi-dia
  async miDia(req: Request, res: Response) {
    try {
      res.json({ success: true, data: await corteDiarioService.miDia(req.user!.userId) });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
  }

  // POST /cortes-diarios  — cierra el día de quien llama
  async cerrar(req: Request, res: Response) {
    try {
      const corte = await corteDiarioService.cerrar({
        userId: req.user!.userId,            // del token, nunca del body
        declarado: Number(req.body.declarado),
        notaCobrador: req.body.notaCobrador,
      });
      res.status(201).json({ success: true, message: 'Corte cerrado', data: corte });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
  }

  // POST /cortes-diarios/:id/recibir  — solo ADMIN
  async recibir(req: Request, res: Response) {
    try {
      const corte = await corteDiarioService.recibir({
        corteId: req.params.id,
        adminId: req.user!.userId,
        recibido: Number(req.body.recibido),
        notaAdmin: req.body.notaAdmin,
      });
      res.json({ success: true, message: 'Corte recibido', data: corte });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
  }

  // GET /cortes-diarios/resumen-diario?fecha=YYYY-MM-DD  (solo ADMIN)
  async resumenDiario(req: Request, res: Response) {
    try {
      const f = req.query.fecha as string | undefined;
      const data = await corteDiarioService.resumenDiario(f ? new Date(`${f}T12:00:00Z`) : undefined);
      res.json({ success: true, data });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
  }

  // GET /cortes-diarios?status=
  async listar(req: Request, res: Response) {
    try {
      const status = req.query.status as CorteDiarioStatus | undefined;
      res.json({ success: true, data: await corteDiarioService.listar(usuario(req), status) });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
  }

  // GET /cortes-diarios/:id
  async obtener(req: Request, res: Response) {
    try {
      res.json({ success: true, data: await corteDiarioService.obtener(req.params.id, usuario(req)) });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
  }
}

export default new CorteDiarioController();
