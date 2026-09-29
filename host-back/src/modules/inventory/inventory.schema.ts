import { z } from 'zod';

const itemFields = {
  name: z.string().trim().min(1, 'Informe o nome do item').max(120, 'Nome do item muito longo'),
  quantity: z.coerce
    .number({ message: 'Informe a quantidade' })
    .int('A quantidade deve ser um número inteiro')
    .min(1, 'A quantidade mínima é 1')
    .max(9999, 'Quantidade muito alta')
    .default(1),
  // Valor unitário em centavos
  valueCents: z.coerce
    .number({ message: 'Informe o valor' })
    .int('Valor inválido')
    .min(0, 'Valor inválido')
    .max(10_000_000_000, 'Valor muito alto')
    .default(0),
};

/** Item do modelo do imóvel. */
export const propertyItemSchema = z.object({
  propertyName: z.string().trim().min(2, 'Informe o imóvel').max(120, 'Nome do imóvel muito longo'),
  ...itemFields,
});
export type PropertyItemInput = z.infer<typeof propertyItemSchema>;

/** Item da reserva (sem imóvel: pertence à reserva). */
export const reservationItemSchema = z.object(itemFields);
export type ReservationItemInput = z.infer<typeof reservationItemSchema>;

export const propertyQuerySchema = z.object({
  property: z.string().trim().min(1, 'Informe o imóvel').max(120),
});

export const checkSchema = z.object({ checked: z.boolean() });

export const reservationsQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(''),
  // PENDENTE = pendente de vistoria | VISTORIADO
  status: z.enum(['PENDENTE', 'VISTORIADO']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
});
export type ReservationsQuery = z.infer<typeof reservationsQuerySchema>;
