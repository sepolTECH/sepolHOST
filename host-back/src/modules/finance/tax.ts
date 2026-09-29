/**
 * Carnê-leão — IRPF mensal (valores em centavos).
 *
 * Tabela progressiva mensal vigente desde maio/2025 (Lei 15.191/2025) e redução mensal
 * da Lei 15.270/2025 (a partir de janeiro/2026: isenção até R$ 5.000 e redução decrescente
 * até R$ 7.350).
 *
 * ⚠️ Estes números mudam por lei. Quando a Receita atualizar a tabela, ajuste só este arquivo.
 *    Confira sempre com o contador / com o Carnê-Leão Web antes de emitir o DARF.
 */

/** Faixas da tabela progressiva mensal: até `upTo` (inclusive) aplica `rate` e deduz `deduction`. */
export const MONTHLY_TABLE = [
  { upTo: 242_880, rate: 0, deduction: 0 },
  { upTo: 282_665, rate: 0.075, deduction: 18_216 },
  { upTo: 375_105, rate: 0.15, deduction: 39_416 },
  { upTo: 466_468, rate: 0.225, deduction: 67_549 },
  { upTo: Infinity, rate: 0.275, deduction: 90_873 },
] as const;

/** Dedução mensal por dependente. */
export const DEPENDENT_DEDUCTION = 18_959;
/** Desconto simplificado mensal (substitui as deduções legais quando for maior). */
export const SIMPLIFIED_DISCOUNT = 60_720;

/** Redução mensal (Lei 15.270/2025). */
export const REDUCTION = {
  exemptUpTo: 500_000, // até R$ 5.000: imposto zerado
  phaseOutUpTo: 735_000, // de R$ 5.000,01 a R$ 7.350: redução decrescente
  constant: 97_862, // R$ 978,62
  factor: 0.133145, // × rendimentos tributáveis
} as const;

/** DARF abaixo de R$ 10 não é pago: o valor se acumula para o mês seguinte. */
export const MIN_DARF = 1_000;

/** Categorias de despesa do imóvel que a Receita aceita deduzir do aluguel. */
export const DEDUCTIBLE_CATEGORIES = ['CONDOMINIO', 'IPTU', 'ADMINISTRACAO'] as const;

export type DeductionMode = 'AUTO' | 'LEGAL' | 'SIMPLIFIED';

export interface TaxInput {
  incomeCents: number; // rendimento de aluguel do mês
  rentalDeductionsCents: number; // IPTU + condomínio + taxa de administração pagos pelo locador
  dependents: number;
  socialSecurityCents: number;
  alimonyCents: number;
  mode: DeductionMode;
}

export function computeCarneLeao(input: TaxInput) {
  const income = Math.max(0, input.incomeCents);
  const rentalDeductions = Math.min(income, Math.max(0, input.rentalDeductionsCents));
  // Rendimento tributável = aluguel − despesas dedutíveis do aluguel
  const taxableIncome = income - rentalDeductions;

  const legalDeductions =
    input.dependents * DEPENDENT_DEDUCTION + Math.max(0, input.socialSecurityCents) + Math.max(0, input.alimonyCents);
  const useSimplified =
    input.mode === 'SIMPLIFIED' || (input.mode === 'AUTO' && SIMPLIFIED_DISCOUNT > legalDeductions);
  const personalDeductions = Math.min(taxableIncome, useSimplified ? SIMPLIFIED_DISCOUNT : legalDeductions);

  const baseCents = taxableIncome - personalDeductions;
  const bracketIndex = MONTHLY_TABLE.findIndex((b) => baseCents <= b.upTo);
  const bracket = MONTHLY_TABLE[bracketIndex];
  const tableTaxCents = Math.max(0, Math.round(baseCents * bracket.rate - bracket.deduction));

  // Redução da Lei 15.270 (calculada sobre os rendimentos tributáveis do mês)
  let reductionCents = 0;
  if (taxableIncome <= REDUCTION.exemptUpTo) reductionCents = tableTaxCents;
  else if (taxableIncome <= REDUCTION.phaseOutUpTo)
    reductionCents = Math.min(
      tableTaxCents,
      Math.max(0, Math.round(REDUCTION.constant - REDUCTION.factor * taxableIncome)),
    );

  const taxCents = tableTaxCents - reductionCents;
  return {
    incomeCents: income,
    rentalDeductionsCents: rentalDeductions,
    taxableIncomeCents: taxableIncome,
    deductionUsed: useSimplified ? ('SIMPLIFIED' as const) : ('LEGAL' as const),
    legalDeductionsCents: legalDeductions,
    simplifiedDiscountCents: SIMPLIFIED_DISCOUNT,
    personalDeductionsCents: personalDeductions,
    baseCents,
    bracket: { index: bracketIndex, rate: bracket.rate, deductionCents: bracket.deduction },
    tableTaxCents,
    reductionCents,
    taxCents,
    // abaixo de R$ 10 não se emite DARF (acumula para o próximo mês)
    belowMinimum: taxCents > 0 && taxCents < MIN_DARF,
    effectiveRate: income ? taxCents / income : 0,
  };
}
