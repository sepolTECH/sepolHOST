import { Router } from 'express';
import { z } from 'zod';
import { ensureAuth } from '../../middlewares/auth.js';
import {
  bulkAccessSchema,
  createAssociateSchema,
  reservationAccessSchema,
  updateAssociateSchema,
} from './associates.schema.js';
import * as service from './associates.service.js';

/** Gestão de associados pelo cliente (associados não passam por aqui: ensureAuth barra o papel). */
export const associatesRoutes = Router();

associatesRoutes.use(ensureAuth);

const idParams = z.object({ id: z.string().uuid('Associado não encontrado') });
const reservationParams = z.object({ reservationId: z.string().uuid('Reserva não encontrada') });

associatesRoutes.get('/', async (req, res) => {
  res.json({ data: await service.list(req.user!.ownerId) });
});

// Devolve a senha gerada — só aparece nesta resposta
associatesRoutes.post('/', async (req, res) => {
  const input = createAssociateSchema.parse(req.body);
  res.status(201).json(await service.create(req.user!.ownerId, input));
});

associatesRoutes.patch('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = updateAssociateSchema.parse(req.body);
  res.json({ associate: await service.update(req.user!.ownerId, id, input) });
});

associatesRoutes.post('/:id/reset-password', async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json(await service.resetPassword(req.user!.ownerId, id));
});

associatesRoutes.delete('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  await service.remove(req.user!.ownerId, id);
  res.status(204).end();
});

// ---------- Liberação de reservas ----------

// Reservas liberadas para um associado
associatesRoutes.get('/:id/reservations', async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ reservationIds: await service.releasedReservationIds(req.user!.ownerId, id) });
});

// Libera / retira a liberação de várias reservas de um associado
associatesRoutes.post('/access/bulk', async (req, res) => {
  const input = bulkAccessSchema.parse(req.body);
  res.json(await service.bulkAccess(req.user!.ownerId, input, req.user!.sub));
});

// Associados que enxergam uma reserva
associatesRoutes.get('/by-reservation/:reservationId', async (req, res) => {
  const { reservationId } = reservationParams.parse(req.params);
  res.json({ associateIds: await service.reservationAssociateIds(req.user!.ownerId, reservationId) });
});

// Define os associados que enxergam uma reserva
associatesRoutes.put('/by-reservation/:reservationId', async (req, res) => {
  const { reservationId } = reservationParams.parse(req.params);
  const { associateIds } = reservationAccessSchema.parse(req.body);
  res.json({
    associateIds: await service.setReservationAssociates(req.user!.ownerId, reservationId, associateIds, req.user!.sub),
  });
});
