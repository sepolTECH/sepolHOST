import { Router } from 'express';
import { z } from 'zod';
import { ensureAuth } from '../../middlewares/auth.js';
import { blockSchema, listQuerySchema } from './blocklist.schema.js';
import * as blocklistService from './blocklist.service.js';

export const blocklistRoutes = Router();

// Todas as rotas de bloqueados exigem login
blocklistRoutes.use(ensureAuth);

// O bloqueio é identificado pelo hóspede (um por hóspede)
const params = z.object({ guestId: z.string().uuid('Hóspede não encontrado') });

blocklistRoutes.get('/', async (req, res) => {
  res.json(await blocklistService.list(req.user!.sub, listQuerySchema.parse(req.query)));
});

// Bloqueio + todas as avaliações das hospedagens do hóspede
blocklistRoutes.get('/:guestId', async (req, res) => {
  const { guestId } = params.parse(req.params);
  res.json(await blocklistService.getDetail(req.user!.sub, guestId));
});

// Bloqueia (ou atualiza o motivo)
blocklistRoutes.put('/:guestId', async (req, res) => {
  const { guestId } = params.parse(req.params);
  const input = blockSchema.parse(req.body);
  await blocklistService.block(guestId, input.reason, input.reservationId ?? null, req.user!.sub);
  res.json(await blocklistService.getDetail(req.user!.sub, guestId));
});

// Desbloqueia o hóspede
blocklistRoutes.delete('/:guestId', async (req, res) => {
  const { guestId } = params.parse(req.params);
  await blocklistService.unblock(req.user!.sub, guestId);
  res.status(204).end();
});
