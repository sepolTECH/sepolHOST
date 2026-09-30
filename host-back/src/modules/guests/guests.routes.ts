import express, { Router } from 'express';
import { z } from 'zod';
import { ensureAuth } from '../../middlewares/auth.js';
import { AppError } from '../../utils/AppError.js';
import { checkDocumentSchema, checkDuplicatesSchema, guestSchema, listQuerySchema } from './guests.schema.js';
import * as guestsService from './guests.service.js';
import * as reservationsService from '../reservations/reservations.service.js';
import * as dependentsService from '../dependents/dependents.service.js';

export const guestsRoutes = Router();

// Todas as rotas de hóspedes exigem login
guestsRoutes.use(ensureAuth);

const idSchema = z.object({ id: z.string().uuid('Hóspede não encontrado') });

/** Tipos aceitos para a foto do documento (o tipo real é conferido pelos bytes do arquivo). */
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const PHOTO_MAX = '5mb';

guestsRoutes.get('/', async (req, res) => {
  res.json(await guestsService.list(req.user!.sub, listQuerySchema.parse(req.query)));
});

// Consulta se já existe hóspede com o documento (usado antes de liberar o cadastro).
// Precisa vir antes de "/:id" para não ser tratada como um id.
guestsRoutes.get('/check-document', async (req, res) => {
  const { documentType, documentNumber } = checkDocumentSchema.parse(req.query);
  const guest = await guestsService.findByDocument(req.user!.sub, documentType, documentNumber);
  res.json({ exists: !!guest, guest });
});

// Possíveis cadastros duplicados por nome (inclusive abreviado), telefone e e-mail.
// Usado enquanto o cadastro é preenchido — principalmente para hóspedes sem documento.
guestsRoutes.get('/check-duplicates', async (req, res) => {
  const q = checkDuplicatesSchema.parse(req.query);
  res.json({ matches: await guestsService.findPossibleDuplicates(req.user!.sub, q) });
});

// Consulta um documento qualquer (CPF, RG, passaporte...): se é hóspede cadastrado e de quem
// já foi dependente. Usado para os avisos no cadastro da reserva. Também antes de "/:id".
const lookupSchema = z.object({
  document: z.string().trim().max(30).default(''),
  excludeMainGuestId: z.string().uuid().optional(),
});
guestsRoutes.get('/document-lookup', async (req, res) => {
  const { document, excludeMainGuestId } = lookupSchema.parse(req.query);
  const [guest, dependentOf] = await Promise.all([
    guestsService.findByDocumentKey(req.user!.sub, document),
    dependentsService.findByDocument(req.user!.sub, document, excludeMainGuestId),
  ]);
  res.json({ guest, dependentOf });
});

guestsRoutes.get('/:id', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  res.json({ guest: await guestsService.getById(req.user!.sub, id) });
});

// Histórico de hospedagens (reservas como responsável ou acompanhante)
guestsRoutes.get('/:id/stays', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  const guest = await guestsService.getById(req.user!.sub, id); // 404 se não existir (ou for de outro cliente)
  res.json(await reservationsService.listByGuest(req.user!.sub, guest.id, guest.documentNumber));
});

// Dependentes (acompanhantes das reservas em que ele foi o responsável)
guestsRoutes.get('/:id/dependents', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  await guestsService.getById(req.user!.sub, id); // 404 se não existir (ou for de outro cliente)
  res.json(await dependentsService.listByGuest(req.user!.sub, id));
});

guestsRoutes.post('/', async (req, res) => {
  const input = guestSchema.parse(req.body);
  const guest = await guestsService.create(input, req.user!.sub);
  res.status(201).json({ guest });
});

guestsRoutes.put('/:id', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  const input = guestSchema.parse(req.body);
  res.json({ guest: await guestsService.update(id, input, req.user!.sub) });
});

// Exclui o hóspede. Com reservas vinculadas, exige ?detachReservations=true (elas ficam sem hóspede).
const deleteQuerySchema = z.object({ detachReservations: z.enum(['true', 'false']).optional() });
guestsRoutes.delete('/:id', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  const { detachReservations } = deleteQuerySchema.parse(req.query);
  await guestsService.remove(req.user!.sub, id, detachReservations === 'true');
  res.status(204).end();
});

// ---------- Foto do documento ----------

guestsRoutes.get('/:id/document-photo', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  const photo = await guestsService.getDocumentPhoto(req.user!.sub, id);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', 'inline');
  res.type(photo.mime).sendFile(photo.path);
});

// Corpo = o próprio arquivo (Content-Type: image/jpeg | image/png | image/webp | application/pdf)
guestsRoutes.put('/:id/document-photo', express.raw({ type: PHOTO_TYPES, limit: PHOTO_MAX }), async (req, res) => {
  const { id } = idSchema.parse(req.params);
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    throw new AppError('Envie uma imagem JPG, PNG ou WEBP, ou um PDF de até 5 MB', 415);
  }
  res.json({ guest: await guestsService.setDocumentPhoto(id, req.body, req.user!.sub) });
});

guestsRoutes.delete('/:id/document-photo', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  res.json({ guest: await guestsService.removeDocumentPhoto(id, req.user!.sub) });
});
