import { Router } from 'express';
import { z } from 'zod';
import { ensureAuth } from '../../middlewares/auth.js';
import {
  checkSchema,
  propertyItemSchema,
  propertyQuerySchema,
  reservationItemSchema,
  reservationsQuerySchema,
} from './inventory.schema.js';
import * as inventoryService from './inventory.service.js';

export const inventoryRoutes = Router();

// Todas as rotas do inventário exigem login
inventoryRoutes.use(ensureAuth);

const itemParams = z.object({ id: z.string().uuid('Item não encontrado') });
const reservationParams = z.object({ id: z.string().uuid('Reserva não encontrada') });
const reservationItemParams = z.object({
  id: z.string().uuid('Reserva não encontrada'),
  itemId: z.string().uuid('Item não encontrado'),
});

// ---------- Inventário do imóvel (modelo) ----------

inventoryRoutes.get('/properties', async (req, res) => {
  res.json({ data: await inventoryService.listProperties(req.user!.sub) });
});

// GET /api/inventory/items?property=Casa%20da%20Praia
inventoryRoutes.get('/items', async (req, res) => {
  const { property } = propertyQuerySchema.parse(req.query);
  res.json(await inventoryService.listItems(req.user!.sub, property));
});

inventoryRoutes.post('/items', async (req, res) => {
  const input = propertyItemSchema.parse(req.body);
  res.status(201).json({ item: await inventoryService.createItem(req.user!.sub, input) });
});

inventoryRoutes.put('/items/:id', async (req, res) => {
  const { id } = itemParams.parse(req.params);
  const input = reservationItemSchema.parse(req.body);
  res.json({ item: await inventoryService.updateItem(req.user!.sub, id, input) });
});

inventoryRoutes.delete('/items/:id', async (req, res) => {
  const { id } = itemParams.parse(req.params);
  await inventoryService.removeItem(req.user!.sub, id);
  res.status(204).end();
});

// ---------- Vistoria por reserva ----------

inventoryRoutes.get('/reservations', async (req, res) => {
  res.json(await inventoryService.listReservations(req.user!.sub, reservationsQuerySchema.parse(req.query)));
});

inventoryRoutes.get('/reservations/:id', async (req, res) => {
  const { id } = reservationParams.parse(req.params);
  res.json(await inventoryService.getReservationInventory(req.user!.sub, id));
});

inventoryRoutes.post('/reservations/:id/items', async (req, res) => {
  const { id } = reservationParams.parse(req.params);
  const input = reservationItemSchema.parse(req.body);
  res.status(201).json(await inventoryService.addReservationItem(req.user!.sub, id, input));
});

inventoryRoutes.put('/reservations/:id/items/:itemId', async (req, res) => {
  const { id, itemId } = reservationItemParams.parse(req.params);
  const input = reservationItemSchema.parse(req.body);
  res.json(await inventoryService.updateReservationItem(req.user!.sub, id, itemId, input));
});

inventoryRoutes.delete('/reservations/:id/items/:itemId', async (req, res) => {
  const { id, itemId } = reservationItemParams.parse(req.params);
  res.json(await inventoryService.removeReservationItem(req.user!.sub, id, itemId));
});

// Marca / desmarca a conferência de um item
inventoryRoutes.patch('/reservations/:id/items/:itemId/check', async (req, res) => {
  const { id, itemId } = reservationItemParams.parse(req.params);
  const { checked } = checkSchema.parse(req.body);
  res.json(await inventoryService.setItemChecked(req.user!.sub, id, itemId, checked));
});

// Marca / desmarca todos os itens de uma vez
inventoryRoutes.post('/reservations/:id/check-all', async (req, res) => {
  const { id } = reservationParams.parse(req.params);
  const { checked } = checkSchema.parse(req.body);
  res.json(await inventoryService.setAllChecked(req.user!.sub, id, checked));
});

// Conclui a vistoria (exige todos os itens conferidos)
inventoryRoutes.post('/reservations/:id/inspect', async (req, res) => {
  const { id } = reservationParams.parse(req.params);
  res.json(await inventoryService.inspect(req.user!.sub, id));
});

// Volta para "pendente de vistoria"
inventoryRoutes.post('/reservations/:id/reopen', async (req, res) => {
  const { id } = reservationParams.parse(req.params);
  res.json(await inventoryService.reopen(req.user!.sub, id));
});
