import { z } from 'zod';

/** Texto opcional: vazio vira null. */
const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .nullish()
    .transform((v) => (v ? v : null));

export const propertySchema = z.object({
  name: z
    .string({ message: 'Informe o nome do imóvel' })
    .trim()
    .transform((v) => v.replace(/\s+/g, ' '))
    .pipe(z.string().min(2, 'Informe o nome do imóvel').max(120, 'Nome do imóvel muito longo')),
  address: optionalText(200, 'Endereço muito longo'),
  city: optionalText(80, 'Cidade muito longa'),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[A-Z]{2}$/.test(v), 'Use a sigla do estado (ex.: SP)'),
  notes: optionalText(500, 'Observações muito longas (máx. 500 caracteres)'),
  isActive: z.boolean().default(true),
});

export type PropertyInput = z.infer<typeof propertySchema>;
