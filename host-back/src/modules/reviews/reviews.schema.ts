import { z } from 'zod';
import { REASON_MAX } from '../blocklist/blocklist.schema.js';

const rating = (label: string) =>
  z.coerce
    .number({ message: `Dê uma nota de ${label}` })
    .int(`Dê uma nota de ${label}`)
    .min(1, `Dê uma nota de ${label}`)
    .max(5, 'A nota vai de 1 a 5');

export const reviewSchema = z
  .object({
    cleanlinessRating: rating('limpeza'),
    communicationRating: rating('comunicação'),
    rulesRating: rating('cumprimento de regras'),
    notes: z
      .string()
      .trim()
      .max(2000, 'Observações muito longas (máx. 2000 caracteres)')
      .nullish()
      .transform((v) => (v ? v : null)),
    // Bloqueio: true = bloqueia o hóspede responsável (ou atualiza o motivo, se já bloqueado)
    blockGuest: z.boolean().optional().default(false),
    blockReason: z
      .string()
      .trim()
      .max(REASON_MAX, `Motivo muito longo (máx. ${REASON_MAX} caracteres)`)
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((v, ctx) => {
    if (v.blockGuest && (!v.blockReason || v.blockReason.length < 3)) {
      ctx.addIssue({ code: 'custom', path: ['blockReason'], message: 'Informe o motivo do bloqueio' });
    }
  });

export type ReviewInput = z.infer<typeof reviewSchema>;

/** Avaliação feita pelo associado: só notas e observação (bloquear hóspede é decisão do cliente). */
export const associateReviewSchema = z.object({
  cleanlinessRating: rating('limpeza'),
  communicationRating: rating('comunicação'),
  rulesRating: rating('cumprimento de regras'),
  notes: z
    .string()
    .trim()
    .max(2000, 'Observações muito longas (máx. 2000 caracteres)')
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type AssociateReviewInput = z.infer<typeof associateReviewSchema>;

export const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(''),
  // PENDENTE = sem avaliação | AVALIADA = com avaliação
  reviewed: z.enum(['PENDENTE', 'AVALIADA']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
