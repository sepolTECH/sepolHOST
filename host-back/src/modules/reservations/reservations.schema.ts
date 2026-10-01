import { z } from 'zod';
import { docField, nameField } from '../../utils/fields.js';

const MAX_CENTS = 100_000_000_00; // R$ 100 milhões

export const PLATFORMS = ['AIRBNB', 'BOOKING', 'VRBO', 'DIRETO', 'OUTRA'] as const;
export const PAYMENT_METHODS = [
  'PLATAFORMA',
  'PIX',
  'CARTAO_CREDITO',
  'CARTAO_DEBITO',
  'DINHEIRO',
  'TRANSFERENCIA',
  'BOLETO',
  'OUTRO',
] as const;
export const EXTENSION_CHANNELS = ['PLATAFORMA', 'DIRETO'] as const;
export const MAX_EXTENSIONS = 20;

export const ATTACHMENT_CATEGORIES = ['CONTRATO', 'CHECKIN', 'CHECKOUT', 'OUTRO'] as const;
export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number];

const date = (label: string) =>
  z
    .string({ message: `Informe a ${label}` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `Informe a ${label}`)
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), {
      message: `${label[0].toUpperCase()}${label.slice(1)} inválida`,
    });

const companionSchema = z.object({
  fullName: nameField.pipe(z.string().min(2, 'Informe o nome do hóspede').max(160, 'Nome muito longo')),
  document: docField
    .pipe(z.string().max(30, 'Identificação muito longa'))
    .nullish() // aceita ausente, null ou vazio
    .transform((v) => (v ? v : null)),
  ageGroup: z.enum(['ADULT', 'CHILD'], { message: 'Informe se é adulto ou criança' }),
});

/** Valor adicional a receber (hóspede extra, pet, late check-out…): soma ao valor bruto, sem comissão. */
const MAX_ADDITIONAL_HOURS = 72;

/**
 * kind VALOR: valor digitado. kind HORAS: só as horas — o valor é calculado aqui, pela diária da
 * hospedagem (reserva + extensões) ÷ noites ÷ 24, e o que o cliente enviar como valor é ignorado.
 */
const additionSchema = z
  .object({
    kind: z.enum(['VALOR', 'HORAS']).default('VALOR'),
    description: z.string().trim().min(2, 'Informe o tipo do valor adicional').max(120, 'Descrição muito longa'),
    amountCents: z.coerce
      .number({ message: 'Informe o valor' })
      .int('Valor inválido')
      .min(1, 'Informe o valor')
      .max(MAX_CENTS, 'Valor muito alto')
      .optional(),
    hours: z.coerce
      .number({ message: 'Informe as horas' })
      .positive('Informe as horas')
      .max(MAX_ADDITIONAL_HOURS, `Máximo de ${MAX_ADDITIONAL_HOURS} horas`)
      .transform((h) => Math.round(h * 10) / 10)
      .optional(),
  })
  .superRefine((a, ctx) => {
    if (a.kind === 'VALOR' && a.amountCents === undefined)
      ctx.addIssue({ code: 'custom', path: ['amountCents'], message: 'Informe o valor' });
    if (a.kind === 'HORAS' && (a.hours === undefined || a.hours <= 0))
      ctx.addIssue({ code: 'custom', path: ['hours'], message: 'Informe as horas' });
  });

/** Horário HH:MM (opcional). */
const timeOfDay = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido')
  .nullish()
  .or(z.literal(''))
  .transform((v) => v || null);

/** Custo/taxa descontado do valor bruto: o tipo é livre porque varia muito. */
const costSchema = z.object({
  description: z.string().trim().min(2, 'Informe o tipo do custo').max(120, 'Descrição muito longa'),
  amountCents: z.coerce
    .number({ message: 'Informe o valor' })
    .int('Valor inválido')
    .min(1, 'Informe o valor')
    .max(MAX_CENTS, 'Valor muito alto'),
});

/**
 * Extensão de hospedagem. O início é sempre o check-out anterior (trechos contínuos).
 * PLATAFORMA: valor calculado aqui pela diária da reserva (e com comissão).
 * DIRETO: valor informado, sem comissão.
 */
const extensionSchema = z.object({
  checkOut: date('data do novo check-out'),
  channel: z.enum(EXTENSION_CHANNELS, { message: 'Informe se a extensão é pela plataforma ou direta' }),
  amountCents: z.coerce.number().int('Valor inválido').min(0, 'Valor inválido').max(MAX_CENTS, 'Valor muito alto').optional(),
  paymentMethod: z
    .enum(PAYMENT_METHODS, { message: 'Forma de pagamento inválida' })
    .nullish()
    .transform((v) => v ?? null),
});

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const reservationSchema = z
  .object({
    reservationNumber: z
      .string()
      .transform((v) => v.replace(/\s+/g, ''))
      .pipe(z.string().min(1, 'Informe o número da reserva').max(40, 'Número muito longo')),
    // Hóspede responsável é opcional: a reserva pode existir sem uma pessoa vinculada
    mainGuestId: z
      .union([z.string().uuid('Hóspede responsável inválido'), z.literal(''), z.null()])
      .optional()
      .transform((v) => v || null),
    propertyName: z.string().trim().min(2, 'Informe o imóvel').max(120, 'Nome do imóvel muito longo'),
    guestsCount: z.coerce
      .number({ message: 'Informe o número de hóspedes' })
      .int('Número de hóspedes inválido')
      .min(1, 'A reserva precisa de pelo menos 1 hóspede')
      .max(50, 'Máximo de 50 hóspedes'),
    companions: z.array(companionSchema).max(49).default([]),
    bookedAt: date('data da reserva'),
    checkIn: date('data do check-in'),
    checkOut: date('data do check-out'),
    checkInTime: timeOfDay,
    checkOutTime: timeOfDay,
    status: z.enum(['VAZIO', 'HOSPEDADO', 'CONCLUIDO', 'CANCELADO'], { message: 'Status inválido' }),
    platform: z.enum(PLATFORMS, { message: 'Selecione a plataforma de origem' }),
    paymentMethod: z
      .enum(PAYMENT_METHODS, { message: 'Forma de pagamento inválida' })
      .nullish()
      .transform((v) => v ?? null),
    costs: z.array(costSchema).max(50, 'Máximo de 50 custos por reserva').default([]),
    additions: z.array(additionSchema).max(50, 'Máximo de 50 valores adicionais por reserva').default([]),
    extensions: z.array(extensionSchema).max(MAX_EXTENSIONS, `Máximo de ${MAX_EXTENSIONS} extensões`).default([]),
    amountCents: z.coerce
      .number({ message: 'Informe o valor da reserva' })
      .int('Valor inválido')
      .min(0, 'Valor inválido')
      .max(MAX_CENTS, 'Valor muito alto'),
    commissionType: z.enum(['PERCENT', 'VALUE']),
    commissionRate: z.coerce.number().min(0, 'Percentual inválido').max(100, 'Máximo de 100%').optional(),
    commissionCents: z.coerce.number().int().min(0, 'Valor inválido').optional(),
  })
  .superRefine((r, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });

    if (r.checkIn && r.checkOut && r.checkOut <= r.checkIn) issue('checkOut', 'O check-out deve ser depois do check-in');
    // responsável + acompanhantes não podem passar do total informado
    if (r.companions.length + 1 > r.guestsCount)
      issue(
        'companions',
        `A lista tem ${r.companions.length + 1} hóspedes, mas a reserva é para ${r.guestsCount} ${r.guestsCount === 1 ? 'hóspede' : 'hóspedes'}`,
      );

    // identificação é obrigatória para adultos (opcional para crianças)
    r.companions.forEach((c, i) => {
      if (c.ageGroup === 'ADULT' && !c.document)
        ctx.addIssue({ code: 'custom', path: ['companions', i, 'document'], message: 'Obrigatório para adulto' });
    });

    // Horas adicionais são calculadas pelo valor da hospedagem: precisa de valor e de noites
    r.additions.forEach((a, i) => {
      if (a.kind !== 'HORAS') return;
      const lastCheckOut = r.extensions.length ? r.extensions[r.extensions.length - 1].checkOut : r.checkOut;
      if (r.amountCents <= 0 || !r.checkIn || !lastCheckOut || daysBetween(r.checkIn, lastCheckOut) <= 0)
        ctx.addIssue({
          code: 'custom',
          path: ['additions', i, 'hours'],
          message: 'Informe o valor da reserva e as datas para calcular as horas',
        });
    });

    if (r.platform === 'DIRETO' && r.paymentMethod === 'PLATAFORMA')
      issue('paymentMethod', 'Contrato direto não é pago via plataforma');

    // Extensões: cada uma começa no check-out anterior e termina depois dele
    let previous = r.checkOut;
    r.extensions.forEach((e, i) => {
      const path = (field: string) => ['extensions', i, field];
      if (previous && e.checkOut <= previous)
        ctx.addIssue({ code: 'custom', path: path('checkOut'), message: 'Deve ser depois do check-out anterior' });
      if (e.channel === 'DIRETO' && !e.amountCents)
        ctx.addIssue({ code: 'custom', path: path('amountCents'), message: 'Informe o valor da extensão' });
      if (e.channel === 'PLATAFORMA' && r.platform === 'DIRETO')
        ctx.addIssue({ code: 'custom', path: path('channel'), message: 'Reserva de contrato direto só pode ser estendida direto' });
      if (e.channel === 'DIRETO' && e.paymentMethod === 'PLATAFORMA')
        ctx.addIssue({ code: 'custom', path: path('paymentMethod'), message: 'Extensão direta não é paga via plataforma' });
      previous = e.checkOut;
    });

    if (r.commissionType === 'PERCENT' && r.commissionRate === undefined)
      issue('commissionRate', 'Informe o percentual da comissão');
    if (r.commissionType === 'VALUE') {
      if (r.commissionCents === undefined) issue('commissionCents', 'Informe o valor da comissão');
      else if (r.commissionCents > r.amountCents)
        issue('commissionCents', 'A comissão não pode ser maior que o valor da reserva');
    }
  })
  // O valor da comissão é sempre calculado aqui, a partir do tipo escolhido
  .transform((r) => {
    const commissionRate = r.commissionType === 'PERCENT' ? Math.round((r.commissionRate ?? 0) * 100) / 100 : null;
    const commissionCents =
      r.commissionType === 'PERCENT'
        ? Math.round((r.amountCents * (commissionRate ?? 0)) / 100)
        : (r.commissionCents ?? 0);
    const costsCents = r.costs.reduce((sum, c) => sum + c.amountCents, 0);

    // Extensões: pela plataforma usa a diária média da reserva e a mesma comissão;
    // direto usa o valor informado e NÃO paga comissão.
    const baseNights = daysBetween(r.checkIn, r.checkOut);
    const dailyCents = baseNights > 0 ? r.amountCents / baseNights : 0;
    const commissionShare = r.amountCents > 0 ? commissionCents / r.amountCents : 0;
    let startDate = r.checkOut;
    const extensions = r.extensions.map((e) => {
      const nights = daysBetween(startDate, e.checkOut);
      const platform = e.channel === 'PLATAFORMA';
      const amountCents = platform ? Math.round(dailyCents * nights) : (e.amountCents ?? 0);
      const extCommission = platform
        ? r.commissionType === 'PERCENT'
          ? Math.round((amountCents * (commissionRate ?? 0)) / 100)
          : Math.round(amountCents * commissionShare)
        : 0;
      const ext = {
        startDate,
        checkOut: e.checkOut,
        nights,
        channel: e.channel,
        paymentMethod: platform ? null : e.paymentMethod,
        amountCents,
        commissionCents: extCommission,
      };
      startDate = e.checkOut;
      return ext;
    });
    const extensionsCents = extensions.reduce((sum, e) => sum + e.amountCents, 0);

    // Valores adicionais: por hora = (reserva + extensões) ÷ noites ÷ 24 × horas (sem comissão)
    const stayNights = baseNights + extensions.reduce((sum, e) => sum + e.nights, 0);
    const hourlyCents = stayNights > 0 ? (r.amountCents + extensionsCents) / stayNights / 24 : 0;
    const additions = r.additions.map((a) =>
      a.kind === 'HORAS'
        ? { kind: 'HORAS' as const, description: a.description, hours: a.hours ?? 0, amountCents: Math.round(hourlyCents * (a.hours ?? 0)) }
        : { kind: 'VALOR' as const, description: a.description, hours: null, amountCents: a.amountCents ?? 0 },
    );
    const additionsCents = additions.reduce((sum, a) => sum + a.amountCents, 0);
    const extensionsCommissionCents = extensions.reduce((sum, e) => sum + e.commissionCents, 0);

    return {
      ...r,
      commissionRate,
      commissionCents,
      costsCents,
      additions,
      additionsCents,
      extensions,
      extensionsCents,
      extensionsCommissionCents,
      finalCheckOut: startDate,
    };
  });

export type ReservationInput = z.infer<typeof reservationSchema>;

export const attachmentQuerySchema = z.object({
  category: z.enum(ATTACHMENT_CATEGORIES, { message: 'Categoria do anexo inválida' }),
  name: z.string().trim().min(1, 'Informe o nome do arquivo').max(200).default('arquivo'),
});

export const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(''),
  status: z.enum(['VAZIO', 'HOSPEDADO', 'CONCLUIDO', 'CANCELADO']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
