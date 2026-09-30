import { Router } from 'express';
import { z } from 'zod';
import { ensureAuth } from '../../middlewares/auth.js';
import { propertySchema } from './properties.schema.js';
import * as propertiesService from './properties.service.js';

export const propertiesRoutes = Router();

// Todas as rotas de imóveis exigem login
propertiesRoutes.use(ensureAuth);

const idSchema = z.object({ id: z.string().uuid('Imóvel não encontrado') });

propertiesRoutes.get('/', async (req, res) => {
  res.json({ data: await propertiesService.list(req.user!.ownerId) });
});

propertiesRoutes.post('/', async (req, res) => {
  const input = propertySchema.parse(req.body);
  const property = await propertiesService.create(req.user!.ownerId, req.user!.sub, input);
  res.status(201).json({ property });
});

propertiesRoutes.put('/:id', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  const input = propertySchema.parse(req.body);
  res.json({ property: await propertiesService.update(req.user!.ownerId, req.user!.sub, id, input) });
});

propertiesRoutes.delete('/:id', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  await propertiesService.remove(req.user!.ownerId, id);
  res.status(204).end();
});
