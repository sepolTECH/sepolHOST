import express, { Router } from 'express';
import { z } from 'zod';
import { ensureAuth } from '../../middlewares/auth.js';
import { AppError } from '../../utils/AppError.js';
import { attachmentQuerySchema, listQuerySchema, reservationSchema } from './reservations.schema.js';
import * as reservationsService from './reservations.service.js';

export const reservationsRoutes = Router();

// Todas as rotas de reservas exigem login
reservationsRoutes.use(ensureAuth);

const idSchema = z.object({ id: z.string().uuid('Reserva não encontrada') });
const attachmentParams = z.object({
  id: z.string().uuid('Reserva não encontrada'),
  attachmentId: z.string().uuid('Anexo não encontrado'),
});

/** Tipos aceitos nos anexos (o tipo real é conferido pelos bytes do arquivo). */
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

reservationsRoutes.get('/', async (req, res) => {
  res.json(await reservationsService.list(req.user!.sub, listQuerySchema.parse(req.query)));
});

reservationsRoutes.get('/:id', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  res.json({ reservation: await reservationsService.getById(req.user!.sub, id) });
});

reservationsRoutes.post('/', async (req, res) => {
  const input = reservationSchema.parse(req.body);
  const reservation = await reservationsService.create(input, req.user!.sub);
  res.status(201).json({ reservation });
});

reservationsRoutes.put('/:id', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  const input = reservationSchema.parse(req.body);
  res.json({ reservation: await reservationsService.update(id, input, req.user!.sub) });
});

// Cancela a reserva mantendo os dados (some das finanças, vistoria e avaliações); "reativar" desfaz
reservationsRoutes.post('/:id/cancel', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  res.json({ reservation: await reservationsService.setCancelled(req.user!.sub, req.user!.sub, id, true) });
});

reservationsRoutes.post('/:id/reactivate', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  res.json({ reservation: await reservationsService.setCancelled(req.user!.sub, req.user!.sub, id, false) });
});

reservationsRoutes.delete('/:id', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  await reservationsService.remove(req.user!.sub, id);
  res.status(204).end();
});

// ---------- Anexos (contrato, check-in, check-out...) ----------

// Corpo = o próprio arquivo; categoria e nome vão na query (?category=CHECKIN&name=foto.jpg)
reservationsRoutes.post(
  '/:id/attachments',
  express.raw({ type: FILE_TYPES, limit: '5mb' }),
  async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const { category, name } = attachmentQuerySchema.parse(req.query);
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      throw new AppError('Envie uma imagem JPG, PNG ou WEBP, ou um PDF de até 5 MB', 415);
    }
    const attachment = await reservationsService.addAttachment(id, category, name, req.body, req.user!.sub);
    res.status(201).json({ attachment });
  },
);

reservationsRoutes.get('/:id/attachments/:attachmentId', async (req, res) => {
  const { id, attachmentId } = attachmentParams.parse(req.params);
  const file = await reservationsService.getAttachmentFile(req.user!.sub, id, attachmentId);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.type(file.mime).sendFile(file.path);
});

reservationsRoutes.delete('/:id/attachments/:attachmentId', async (req, res) => {
  const { id, attachmentId } = attachmentParams.parse(req.params);
  await reservationsService.removeAttachment(id, attachmentId, req.user!.sub);
  res.status(204).end();
});
