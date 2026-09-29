import { Router } from 'express';
import { z } from 'zod';
import { ensureAuth } from '../../middlewares/auth.js';
import { listQuerySchema, reviewSchema } from './reviews.schema.js';
import * as reviewsService from './reviews.service.js';

export const reviewsRoutes = Router();

// Todas as rotas de avaliações exigem login
reviewsRoutes.use(ensureAuth);

// As avaliações são identificadas pela reserva (uma avaliação por reserva)
const params = z.object({ reservationId: z.string().uuid('Reserva não encontrada') });

reviewsRoutes.get('/', async (req, res) => {
  res.json(await reviewsService.list(req.user!.sub, listQuerySchema.parse(req.query)));
});

reviewsRoutes.get('/:reservationId', async (req, res) => {
  const { reservationId } = params.parse(req.params);
  res.json({ item: await reviewsService.getByReservation(req.user!.sub, reservationId) });
});

// Cria ou atualiza a avaliação da reserva
reviewsRoutes.put('/:reservationId', async (req, res) => {
  const { reservationId } = params.parse(req.params);
  const input = reviewSchema.parse(req.body);
  res.json({ item: await reviewsService.save(reservationId, input, req.user!.sub) });
});

reviewsRoutes.delete('/:reservationId', async (req, res) => {
  const { reservationId } = params.parse(req.params);
  await reviewsService.remove(req.user!.sub, reservationId);
  res.status(204).end();
});
