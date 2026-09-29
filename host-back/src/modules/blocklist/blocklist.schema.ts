import { z } from 'zod';

export const REASON_MAX = 2000;

export const blockReason = z
  .string({ message: 'Informe o motivo do bloqueio' })
  .trim()
  .min(3, 'Informe o motivo do bloqueio')
  .max(REASON_MAX, `Motivo muito longo (máx. ${REASON_MAX} caracteres)`);

export const blockSchema = z.object({
  reason: blockReason,
  reservationId: z.string().uuid('Reserva inválida').nullish(),
});

export type BlockInput = z.infer<typeof blockSchema>;

export const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
