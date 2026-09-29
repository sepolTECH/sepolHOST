import { z } from 'zod';

export const createAssociateSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(120, 'Nome muito longo'),
  email: z.string().trim().email('E-mail inválido').max(255),
});

export const updateAssociateSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome').max(120, 'Nome muito longo').optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.isActive !== undefined, { message: 'Nada para atualizar' });

const uuid = (msg: string) => z.string().uuid(msg);

/** Libera (granted = true) ou tira a liberação de várias reservas para um associado. */
export const bulkAccessSchema = z.object({
  associateId: uuid('Associado não encontrado'),
  reservationIds: z.array(uuid('Reserva inválida')).min(1, 'Selecione ao menos uma reserva').max(500),
  granted: z.boolean(),
});

/** Define exatamente quais associados enxergam uma reserva. */
export const reservationAccessSchema = z.object({
  associateIds: z.array(uuid('Associado inválido')).max(100),
});
