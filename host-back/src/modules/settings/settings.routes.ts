import { Router } from 'express';
import { z } from 'zod';
import { ensureAuth } from '../../middlewares/auth.js';
import { presetSchema, saveFeesSchema } from './settings.schema.js';
import * as settingsService from './settings.service.js';

export const settingsRoutes = Router();

// Todas as rotas de ajustes exigem login
settingsRoutes.use(ensureAuth);

// Taxa de comissão padrão por plataforma
settingsRoutes.get('/fees', async (req, res) => {
  res.json({ data: await settingsService.listFees(req.user!.sub) });
});

settingsRoutes.put('/fees', async (req, res) => {
  const input = saveFeesSchema.parse(req.body);
  res.json({ data: await settingsService.saveFees(req.user!.sub, input) });
});

// Valores padrão (adicionais a receber e custos/taxas com valor sugerido)
const presetIdSchema = z.object({ id: z.string().uuid('Item não encontrado') });

settingsRoutes.get('/presets', async (req, res) => {
  res.json({ data: await settingsService.listPresets(req.user!.ownerId) });
});

settingsRoutes.post('/presets', async (req, res) => {
  const input = presetSchema.parse(req.body);
  res.status(201).json({ preset: await settingsService.createPreset(req.user!.ownerId, req.user!.sub, input) });
});

settingsRoutes.put('/presets/:id', async (req, res) => {
  const { id } = presetIdSchema.parse(req.params);
  const input = presetSchema.parse(req.body);
  res.json({ preset: await settingsService.updatePreset(req.user!.ownerId, req.user!.sub, id, input) });
});

settingsRoutes.delete('/presets/:id', async (req, res) => {
  const { id } = presetIdSchema.parse(req.params);
  await settingsService.removePreset(req.user!.ownerId, id);
  res.status(204).end();
});
