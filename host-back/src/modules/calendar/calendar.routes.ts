import { Router } from 'express';
import { z } from 'zod';
import { ensureAuth } from '../../middlewares/auth.js';
import { candidatesQuerySchema, eventsQuerySchema, feedSchema, linkSchema, unlinkSchema } from './calendar.schema.js';
import * as calendarService from './calendar.service.js';

/**
 * Calendário unificado (somente consulta): os links iCal das plataformas
 * são baixados pelo servidor — nada é enviado de volta para elas.
 */
export const calendarRoutes = Router();

calendarRoutes.use(ensureAuth);

const params = z.object({ id: z.string().uuid('Calendário não encontrado') });

// Eventos de todas as plataformas no período (?from=AAAA-MM-DD&to=AAAA-MM-DD&refresh=1)
calendarRoutes.get('/events', async (req, res) => {
  res.json(await calendarService.getEvents(req.user!.sub, eventsQuerySchema.parse(req.query)));
});

// Links cadastrados
calendarRoutes.get('/feeds', async (req, res) => {
  res.json({ data: await calendarService.listFeeds(req.user!.sub) });
});

calendarRoutes.post('/feeds', async (req, res) => {
  const feed = await calendarService.createFeed(feedSchema.parse(req.body), req.user!.sub);
  res.status(201).json({ feed });
});

calendarRoutes.put('/feeds/:id', async (req, res) => {
  const { id } = params.parse(req.params);
  const feed = await calendarService.updateFeed(id, feedSchema.parse(req.body), req.user!.sub);
  res.json({ feed });
});

calendarRoutes.delete('/feeds/:id', async (req, res) => {
  const { id } = params.parse(req.params);
  await calendarService.removeFeed(req.user!.sub, id);
  res.status(204).end();
});

// Vincular uma marcação do link a uma reserva do cadastro (fica salvo no sistema, não vai para a plataforma)
calendarRoutes.get('/link-candidates', async (req, res) => {
  res.json({ data: await calendarService.linkCandidates(req.user!.sub, candidatesQuerySchema.parse(req.query)) });
});

calendarRoutes.put('/links', async (req, res) => {
  const { feedId, eventKey, reservationId } = linkSchema.parse(req.body);
  await calendarService.link(feedId, eventKey, reservationId, req.user!.sub);
  res.status(204).end();
});

calendarRoutes.delete('/links', async (req, res) => {
  const { feedId, eventKey } = unlinkSchema.parse(req.body);
  await calendarService.unlink(feedId, eventKey, req.user!.sub);
  res.status(204).end();
});
