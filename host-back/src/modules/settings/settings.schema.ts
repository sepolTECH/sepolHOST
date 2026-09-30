import { z } from 'zod';
import { PLATFORMS } from '../reservations/reservations.schema.js';

/** null = sem taxa pré-cadastrada (a reserva não recebe valor automático). */
export const saveFeesSchema = z.object({
  fees: z
    .array(
      z.object({
        platform: z.enum(PLATFORMS, { message: 'Plataforma inválida' }),
        commissionRate: z
          .number({ message: 'Percentual inválido' })
          .min(0, 'Percentual inválido')
          .max(100, 'Máximo de 100%')
          .nullable(),
      }),
    )
    .max(PLATFORMS.length, 'Informe cada plataforma apenas uma vez')
    .refine((list) => new Set(list.map((f) => f.platform)).size === list.length, 'Plataforma repetida'),
});

export type SaveFeesInput = z.infer<typeof saveFeesSchema>;
