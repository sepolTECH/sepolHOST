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

export const PRESET_KINDS = ['ADDITION', 'COST'] as const;

/** Item pré-cadastrado de "valores adicionais" (ADDITION) ou "custos e taxas" (COST) com o valor sugerido. */
export const presetSchema = z.object({
  kind: z.enum(PRESET_KINDS, { message: 'Tipo inválido' }),
  name: z
    .string({ message: 'Informe o nome' })
    .trim()
    .transform((v) => v.replace(/\s+/g, ' '))
    .pipe(z.string().min(2, 'Informe o nome').max(120, 'Nome muito longo')),
  amountCents: z
    .number({ message: 'Informe o valor' })
    .int('Valor inválido')
    .positive('Informe o valor')
    .max(100_000_000_00, 'Valor muito alto'),
});

export type PresetInput = z.infer<typeof presetSchema>;
