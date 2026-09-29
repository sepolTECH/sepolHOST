import { Router } from 'express';
import { z } from 'zod';
import { ensureAssociate } from '../../middlewares/auth.js';
import { associateReviewSchema } from '../reviews/reviews.schema.js';
import { checkSchema } from '../inventory/inventory.schema.js';
import * as service from './associate-area.service.js';

/**
 * Rotas exclusivas do associado (/api/associate): só vistoria e avaliação das reservas liberadas.
 * `req.user.ownerId` = cliente dono dos dados; `req.user.sub` = o próprio associado.
 */
export const associateAreaRoutes = Router();

associateAreaRoutes.use(ensureAssociate);

const reservationParams = z.object({ id: z.string().uuid('Reserva não encontrada') });
const itemParams = z.object({
  id: z.string().uuid('Reserva não encontrada'),
  itemId: z.string().uuid('Item não encontrado'),
});

associateAreaRoutes.get('/reservations', async (req, res) => {
  res.json(await service.listReservations(req.user!.ownerId, req.user!.sub));
});

// ---------- Inventário (vistoria) ----------

associateAreaRoutes.get('/reservations/:id/inventory', async (req, res) => {
  const { id } = reservationParams.parse(req.params);
  res.json(await service.getInventory(req.user!.ownerId, req.user!.sub, id));
});

associateAreaRoutes.patch('/reservations/:id/items/:itemId/check', async (req, res) => {
  const { id, itemId } = itemParams.parse(req.params);
  const { checked } = checkSchema.parse(req.body);
  res.json(await service.checkItem(req.user!.ownerId, req.user!.sub, id, itemId, checked));
});

associateAreaRoutes.post('/reservations/:id/check-all', async (req, res) => {
  const { id } = reservationParams.parse(req.params);
  const { checked } = checkSchema.parse(req.body);
  res.json(await service.checkAll(req.user!.ownerId, req.user!.sub, id, checked));
});

associateAreaRoutes.post('/reservations/:id/inspect', async (req, res) => {
  const { id } = reservationParams.parse(req.params);
  res.json(await service.inspect(req.user!.ownerId, req.user!.sub, id));
});

// ---------- Avaliação ----------

associateAreaRoutes.get('/reservations/:id/review', async (req, res) => {
  const { id } = reservationParams.parse(req.params);
  res.json(await service.getReview(req.user!.ownerId, req.user!.sub, id));
});

associateAreaRoutes.put('/reservations/:id/review', async (req, res) => {
  const { id } = reservationParams.parse(req.params);
  const input = associateReviewSchema.parse(req.body);
  res.json(await service.saveReview(req.user!.ownerId, req.user!.sub, id, input));
});
