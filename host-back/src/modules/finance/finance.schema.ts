import { z } from 'zod';

const MAX_CENTS = 100_000_000_00; // R$ 100 milhões

export const monthQuerySchema = z.object({
  year: z.coerce.number({ message: 'Informe o ano' }).int('Ano inválido').min(2000, 'Ano inválido').max(2100, 'Ano inválido'),
  month: z.coerce.number({ message: 'Informe o mês' }).int('Mês inválido').min(1, 'Mês inválido').max(12, 'Mês inválido'),
});

export type MonthQuery = z.infer<typeof monthQuerySchema>;

/** Categorias das despesas fixas/mensais do imóvel. */
export const EXPENSE_CATEGORIES = [
  'CONDOMINIO',
  'IPTU',
  'ENERGIA',
  'AGUA',
  'GAS',
  'INTERNET',
  'TV_STREAMING',
  'SEGURO',
  'ALUGUEL',
  'FINANCIAMENTO',
  'ADMINISTRACAO',
  'MANUTENCAO',
  'IMPOSTOS',
  'OUTRO',
] as const;

const propertyName = z
  .string()
  .trim()
  .max(120, 'Nome do imóvel muito longo')
  .nullish()
  .transform((v) => (v ? v.replace(/\s+/g, ' ') : null)); // vazio/null = despesa geral

const expenseFields = {
  propertyName,
  category: z.enum(EXPENSE_CATEGORIES, { message: 'Selecione a categoria' }),
  description: z.string().trim().min(2, 'Informe a descrição').max(120, 'Descrição muito longa'),
  amountCents: z.coerce
    .number({ message: 'Informe o valor' })
    .int('Valor inválido')
    .min(1, 'Informe o valor')
    .max(MAX_CENTS, 'Valor muito alto'),
};

export const createExpenseSchema = z.object({
  ...monthQuerySchema.shape,
  ...expenseFields,
  // true = repete todo mês a partir deste
  recurring: z.boolean().optional().default(false),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = z.object({
  ...expenseFields,
  // Recorrente: true = também muda o valor/dados dos próximos meses (padrão: só este mês)
  applyToFuture: z.boolean().optional().default(false),
});
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const deleteExpenseQuerySchema = z.object({
  // month = só este mês | future = este mês e os próximos (para de repetir)
  scope: z.enum(['month', 'future']).default('month'),
});

// ---------- Fechamento do mês (taxa de administração e carnê-leão) ----------

export const closingSettingsSchema = z.object({
  ...monthQuerySchema.shape,
  adminFee: z.object({
    enabled: z.boolean(),
    percent: z.coerce
      .number({ message: 'Informe a porcentagem' })
      .min(0, 'Porcentagem inválida')
      .max(100, 'Porcentagem inválida')
      .transform((v) => Math.round(v * 100) / 100),
    // GROSS = sobre o bruto | NET = sobre o resultado do relatório (bruto − comissões − custos)
    base: z.enum(['GROSS', 'NET'], { message: 'Escolha a base da taxa' }),
  }),
  tax: z.object({
    enabled: z.boolean(),
    // GROSS = bruto pago pelo hóspede | PAYOUT = bruto − comissão (valor repassado)
    incomeBase: z.enum(['GROSS', 'PAYOUT'], { message: 'Escolha a base do rendimento' }),
    deductionMode: z.enum(['AUTO', 'LEGAL', 'SIMPLIFIED'], { message: 'Escolha o tipo de dedução' }),
    dependents: z.coerce.number().int('Número inválido').min(0, 'Número inválido').max(20, 'Número inválido'),
    socialSecurityCents: z.coerce.number().int('Valor inválido').min(0, 'Valor inválido').max(MAX_CENTS, 'Valor muito alto'),
    alimonyCents: z.coerce.number().int('Valor inválido').min(0, 'Valor inválido').max(MAX_CENTS, 'Valor muito alto'),
  }),
});
export type ClosingSettingsInput = z.infer<typeof closingSettingsSchema>;
