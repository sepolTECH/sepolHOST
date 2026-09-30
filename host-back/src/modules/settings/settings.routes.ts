import { Router } from 'express';
import { ensureAuth } from '../../middlewares/auth.js';
import { saveFeesSchema } from './settings.schema.js';
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
