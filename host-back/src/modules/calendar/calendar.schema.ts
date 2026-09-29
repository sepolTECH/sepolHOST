import { z } from 'zod';

export const PLATFORMS = ['AIRBNB', 'BOOKING', 'VRBO', 'DIRETO', 'OUTRA'] as const;
export type Platform = (typeof PLATFORMS)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)');

export const feedSchema = z.object({
  name: z
    .string({ message: 'Informe um nome para o calendário' })
    .trim()
    .min(2, 'Informe um nome para o calendário')
    .max(80, 'Nome muito longo (máx. 80 caracteres)'),
  platform: z.enum(PLATFORMS, { message: 'Escolha a plataforma' }),
  url: z
    .string({ message: 'Informe o link do calendário' })
    .trim()
    .min(1, 'Informe o link do calendário')
    .max(2000, 'Link muito longo')
    // webcal:// é o mesmo link em https
    .transform((v) => v.replace(/^webcal:\/\//i, 'https://'))
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'https:' || u.protocol === 'http:';
      } catch {
        return false;
      }
    }, 'Link inválido — cole o endereço completo (https://…)'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
    .default('#525252'),
  propertyName: z
    .string()
    .trim()
    .max(120, 'Nome do imóvel muito longo')
    .nullish()
    .transform((v) => v || null),
  active: z.boolean().default(true),
});

export type FeedInput = z.infer<typeof feedSchema>;

export const eventsQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    // refresh=1 ignora o cache e baixa os calendários de novo
    refresh: z
      .enum(['0', '1', 'true', 'false'])
      .optional()
      .transform((v) => v === '1' || v === 'true'),
  })
  .refine((q) => q.to > q.from, { message: 'Período inválido', path: ['to'] })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 400 * 86_400_000, {
    message: 'Período muito longo (máx. ~13 meses)',
    path: ['to'],
  });

export type EventsQuery = z.infer<typeof eventsQuerySchema>;

export const linkSchema = z.object({
  feedId: z.string().uuid('Calendário não encontrado'),
  eventKey: z.string().min(1, 'Marcação inválida').max(500),
  reservationId: z.string().uuid('Reserva inválida'),
});

export const unlinkSchema = linkSchema.omit({ reservationId: true });

export const candidatesQuerySchema = z.object({
  start: isoDate,
  end: isoDate,
  search: z.string().trim().max(100).optional().default(''),
});
