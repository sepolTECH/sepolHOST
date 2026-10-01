import { query } from '../../db/pool.js';
import { knownProperties, listByPeriod, periodOf, propertyKey } from './expenses.service.js';
import type { ClosingSettingsInput, MonthQuery } from './finance.schema.js';
import { computeCarneLeao, DEDUCTIBLE_CATEGORIES } from './tax.js';

/**
 * FECHAMENTO DO MÊS — "ponta do lápis" (regime de caixa: o dinheiro em mãos).
 *
 * Diferente do Relatório financeiro (proporcional aos dias), aqui as datas NÃO são quebradas:
 * - Valor da locação (bruto − comissão, reserva + extensões): entra inteiro no mês SEGUINTE
 *   ao check-out final, quando o repasse cai.  check-out 30/09 → outubro; 01/10 → novembro.
 * - Custos da hospedagem (limpeza, reposição...): entram inteiros no mês do check-out final,
 *   quando são pagos.  check-out 01/10 → custos no fechamento de outubro.
 * - Valores adicionais (hóspede extra, pet, horas...): sem comissão e geralmente pagos direto pelo hóspede,
 *   então entram inteiros no mês do check-out final (não esperam o repasse da plataforma).
 *
 * Líquido final = bruto − comissões − custos das hospedagens     (= resultado do relatório)
 *                 − despesas do mês − taxa de administração − carnê-leão
 */

/** Meses entre o check-out final e o recebimento. */
export const PAYOUT_DELAY_MONTHS = 1;

type Platform = 'AIRBNB' | 'BOOKING' | 'VRBO' | 'DIRETO' | 'OUTRA';
type Status = 'VAZIO' | 'HOSPEDADO' | 'CONCLUIDO';

interface StayRow {
  id: string;
  reservation_number: string;
  property_name: string;
  main_guest_id: string | null;
  main_guest_name: string | null;
  platform: Platform | null;
  status: Status;
  check_in: string;
  final_check_out: string;
  amount_cents: number;
  commission_cents: number;
  costs_cents: number;
  additions_cents: number;
  extensions_cents: number;
  extensions_commission_cents: number;
}

interface SettingsRow {
  period: string;
  admin_fee_enabled: boolean;
  admin_fee_percent: string; // NUMERIC vem como texto
  admin_fee_base: 'GROSS' | 'NET';
  tax_enabled: boolean;
  tax_income_base: 'GROSS' | 'PAYOUT';
  tax_deduction_mode: 'AUTO' | 'LEGAL' | 'SIMPLIFIED';
  tax_dependents: number;
  tax_social_security_cents: string;
  tax_alimony_cents: string;
  updated_at: Date | null;
  updated_by_name: string | null;
}

const DEFAULT_SETTINGS = {
  adminFee: { enabled: false, percent: 0, base: 'NET' as 'GROSS' | 'NET' },
  tax: {
    enabled: true,
    incomeBase: 'PAYOUT' as 'GROSS' | 'PAYOUT',
    deductionMode: 'AUTO' as 'AUTO' | 'LEGAL' | 'SIMPLIFIED',
    dependents: 0,
    socialSecurityCents: 0,
    alimonyCents: 0,
  },
};

function addMonths(year: number, month: number, delta: number) {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** Configuração do mês: a do próprio mês ou a do mês anterior mais recente. */
async function getSettings(ownerId: string, year: number, month: number) {
  const period = periodOf(year, month);
  const { rows } = await query<SettingsRow>(
    `SELECT s.period::text AS period, s.admin_fee_enabled, s.admin_fee_percent::text AS admin_fee_percent, s.admin_fee_base,
            s.tax_enabled, s.tax_income_base, s.tax_deduction_mode, s.tax_dependents,
            s.tax_social_security_cents::text AS tax_social_security_cents, s.tax_alimony_cents::text AS tax_alimony_cents,
            s.updated_at, u.name AS updated_by_name
       FROM finance_closing_settings s
       LEFT JOIN users u ON u.id = s.updated_by
      WHERE s.owner_id = $2 AND s.period <= $1::date
      ORDER BY s.period DESC
      LIMIT 1`,
    [period, ownerId],
  );
  const r = rows[0];
  if (!r) return { ...DEFAULT_SETTINGS, source: null as null | { period: string; inherited: boolean; updatedAt: Date | null; updatedByName: string | null } };
  return {
    adminFee: { enabled: r.admin_fee_enabled, percent: Number(r.admin_fee_percent), base: r.admin_fee_base },
    tax: {
      enabled: r.tax_enabled,
      incomeBase: r.tax_income_base,
      deductionMode: r.tax_deduction_mode,
      dependents: r.tax_dependents,
      socialSecurityCents: Number(r.tax_social_security_cents),
      alimonyCents: Number(r.tax_alimony_cents),
    },
    // de qual mês veio a configuração (inherited = herdada de um mês anterior)
    source: { period: r.period, inherited: r.period !== period, updatedAt: r.updated_at, updatedByName: r.updated_by_name },
  };
}

export async function saveSettings(input: ClosingSettingsInput, userId: string) {
  await query(
    `INSERT INTO finance_closing_settings
       (owner_id, period, admin_fee_enabled, admin_fee_percent, admin_fee_base,
        tax_enabled, tax_income_base, tax_deduction_mode, tax_dependents, tax_social_security_cents, tax_alimony_cents,
        updated_by, updated_at)
     VALUES ($11, $1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     ON CONFLICT (owner_id, period) DO UPDATE SET
       admin_fee_enabled = EXCLUDED.admin_fee_enabled, admin_fee_percent = EXCLUDED.admin_fee_percent,
       admin_fee_base = EXCLUDED.admin_fee_base, tax_enabled = EXCLUDED.tax_enabled,
       tax_income_base = EXCLUDED.tax_income_base, tax_deduction_mode = EXCLUDED.tax_deduction_mode,
       tax_dependents = EXCLUDED.tax_dependents, tax_social_security_cents = EXCLUDED.tax_social_security_cents,
       tax_alimony_cents = EXCLUDED.tax_alimony_cents, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [
      periodOf(input.year, input.month),
      input.adminFee.enabled,
      input.adminFee.percent,
      input.adminFee.base,
      input.tax.enabled,
      input.tax.incomeBase,
      input.tax.deductionMode,
      input.tax.dependents,
      input.tax.socialSecurityCents,
      input.tax.alimonyCents,
      userId,
    ],
  );
  return closing(userId, { year: input.year, month: input.month });
}

async function computeClosing(ownerId: string, year: number, month: number) {
  // Recebimentos: hospedagens com check-out final no mês de referência (o anterior ao recebimento)
  const ref = addMonths(year, month, -PAYOUT_DELAY_MONTHS);
  const refNext = addMonths(ref.year, ref.month, 1);
  const refStart = periodOf(ref.year, ref.month);
  const refEnd = periodOf(refNext.year, refNext.month);
  // Custos: hospedagens com check-out final neste mês
  const next = addMonths(year, month, 1);
  const monthStart = periodOf(year, month);
  const monthEnd = periodOf(next.year, next.month);

  const [{ rows }, expenses, settings] = await Promise.all([
    query<StayRow>(
      `SELECT r.id, r.reservation_number, r.property_name, r.main_guest_id, g.full_name AS main_guest_name,
              r.platform, r.status, r.check_in::text AS check_in, r.final_check_out::text AS final_check_out,
              r.amount_cents::float8 AS amount_cents, r.commission_cents::float8 AS commission_cents,
              r.costs_cents::float8 AS costs_cents, r.additions_cents::float8 AS additions_cents,
              r.extensions_cents::float8 AS extensions_cents,
              r.extensions_commission_cents::float8 AS extensions_commission_cents
         FROM reservations r
         LEFT JOIN guests g ON g.id = r.main_guest_id
        WHERE r.owner_id = $5 AND r.status <> 'CANCELADO'
          AND ((r.final_check_out >= $1::date AND r.final_check_out < $2::date)
            OR (r.final_check_out >= $3::date AND r.final_check_out < $4::date
                AND (r.costs_cents > 0 OR r.additions_cents > 0)))
        ORDER BY r.final_check_out, r.check_in, r.created_at`,
      [refStart, refEnd, monthStart, monthEnd, ownerId],
    ),
    listByPeriod(ownerId, year, month),
    getSettings(ownerId, year, month),
  ]);

  const DAY = 86_400_000;
  const base = (r: StayRow) => ({
    id: r.id,
    reservationNumber: r.reservation_number,
    propertyName: r.property_name.trim().replace(/\s+/g, ' '),
    mainGuest: r.main_guest_id ? { id: r.main_guest_id, fullName: r.main_guest_name ?? '' } : null,
    platform: r.platform,
    status: r.status,
    checkIn: r.check_in,
    finalCheckOut: r.final_check_out,
    nights: Math.round((Date.parse(`${r.final_check_out}T00:00:00Z`) - Date.parse(`${r.check_in}T00:00:00Z`)) / DAY),
  });
  const inRange = (d: string, from: string, to: string) => d >= from && d < to;

  // Valor da locação recebido neste mês (hospedagem inteira, sem quebrar datas)
  const stays = rows
    .filter((r) => inRange(r.final_check_out, refStart, refEnd))
    .map((r) => {
      // os valores adicionais NÃO entram aqui: caem no mês do check-out (additionStays)
      const grossCents = r.amount_cents + r.extensions_cents;
      const commissionCents = r.commission_cents + r.extensions_commission_cents;
      return {
        ...base(r),
        grossCents,
        extensionsCents: r.extensions_cents,
        commissionCents,
        netCents: grossCents - commissionCents, // valor que cai na conta
      };
    });
  // Custos pagos neste mês (hospedagens que terminaram neste mês)
  const costStays = rows
    .filter((r) => inRange(r.final_check_out, monthStart, monthEnd) && r.costs_cents > 0)
    .map((r) => ({ ...base(r), costsCents: r.costs_cents }));

  // Valores adicionais recebidos neste mês (hospedagens que terminaram neste mês), sem comissão
  const additionStays = rows
    .filter((r) => inRange(r.final_check_out, monthStart, monthEnd) && r.additions_cents > 0)
    .map((r) => ({ ...base(r), additionsCents: r.additions_cents }));

  const { adminFee } = settings;
  const adminFeeOf = (gross: number, net: number) => {
    if (!adminFee.enabled || adminFee.percent <= 0) return 0;
    const base = adminFee.base === 'GROSS' ? gross : net;
    return Math.max(0, Math.round((base * adminFee.percent) / 100));
  };

  // ---------- Por imóvel ----------
  type PropertyTotals = {
    propertyName: string;
    reservations: number;
    grossCents: number; // locações recebidas + valores adicionais
    additionsCents: number; // parte do bruto que são valores adicionais
    commissionCents: number;
    costsCents: number;
    netCents: number; // resultado do relatório (bruto − comissões − custos)
    expensesCents: number;
    adminFeeCents: number;
    resultCents: number; // antes do carnê-leão
  };
  const empty = (propertyName: string): PropertyTotals => ({
    propertyName, reservations: 0, grossCents: 0, additionsCents: 0, commissionCents: 0, costsCents: 0, netCents: 0, expensesCents: 0, adminFeeCents: 0, resultCents: 0,
  });
  const props = new Map<string, PropertyTotals>();
  for (const s of stays) {
    const k = propertyKey(s.propertyName);
    const p = props.get(k) ?? empty(s.propertyName);
    p.reservations += 1;
    p.grossCents += s.grossCents;
    p.commissionCents += s.commissionCents;
    props.set(k, p);
  }
  for (const a of additionStays) {
    const k = propertyKey(a.propertyName);
    const p = props.get(k) ?? empty(a.propertyName);
    p.grossCents += a.additionsCents;
    p.additionsCents += a.additionsCents;
    props.set(k, p);
  }
  for (const c of costStays) {
    const k = propertyKey(c.propertyName);
    const p = props.get(k) ?? empty(c.propertyName);
    p.costsCents += c.costsCents;
    props.set(k, p);
  }
  for (const e of expenses) {
    if (!e.propertyName) continue;
    const k = propertyKey(e.propertyName);
    const p = props.get(k) ?? empty(e.propertyName);
    p.expensesCents += e.amountCents;
    props.set(k, p);
  }
  // A taxa de administração é calculada por imóvel e somada (o total bate com a soma das linhas)
  for (const p of props.values()) {
    p.netCents = p.grossCents - p.commissionCents - p.costsCents;
    p.adminFeeCents = adminFeeOf(p.grossCents, p.netCents);
    p.resultCents = p.netCents - p.expensesCents - p.adminFeeCents;
  }

  const sum = <T>(list: T[], pick: (x: T) => number) => list.reduce((s, x) => s + pick(x), 0);
  const rentalCents = sum(stays, (s) => s.grossCents); // locações (repasse do mês seguinte)
  const additionsCents = sum(additionStays, (a) => a.additionsCents);
  const grossCents = rentalCents + additionsCents;
  const commissionCents = sum(stays, (s) => s.commissionCents);
  const costsCents = sum(costStays, (c) => c.costsCents);
  const netCents = grossCents - commissionCents - costsCents;
  const expensesCents = sum(expenses, (e) => e.amountCents);
  const generalExpensesCents = sum(expenses.filter((e) => !e.propertyName), (e) => e.amountCents);
  const adminFeeCents = sum([...props.values()], (p) => p.adminFeeCents);
  const beforeTaxCents = netCents - expensesCents - adminFeeCents;

  // ---------- Carnê-leão ----------
  const deductibleExpenses = expenses.filter((e) => (DEDUCTIBLE_CATEGORIES as readonly string[]).includes(e.category));
  const deductibleExpensesCents = sum(deductibleExpenses, (e) => e.amountCents);
  const incomeCents = settings.tax.incomeBase === 'GROSS' ? grossCents : grossCents - commissionCents;
  const tax = settings.tax.enabled
    ? computeCarneLeao({
        incomeCents,
        rentalDeductionsCents: deductibleExpensesCents + adminFeeCents,
        dependents: settings.tax.dependents,
        socialSecurityCents: settings.tax.socialSecurityCents,
        alimonyCents: settings.tax.alimonyCents,
        mode: settings.tax.deductionMode,
      })
    : null;
  const taxCents = tax?.taxCents ?? 0;
  const due = addMonths(year, month, 1); // DARF: até o último dia útil do mês seguinte

  return {
    period: { year, month, start: periodOf(year, month) },
    // Mês cujas hospedagens (check-out final) estão sendo recebidas aqui
    reference: { year: ref.year, month: ref.month, start: refStart, end: refEnd },
    settings,
    totals: {
      reservations: stays.length,
      costReservations: costStays.length,
      grossCents, // locações + valores adicionais
      rentalCents,
      extensionsCents: sum(stays, (s) => s.extensionsCents),
      additionsCents,
      additionReservations: additionStays.length,
      commissionCents,
      costsCents,
      netCents,
      expensesCents,
      generalExpensesCents,
      adminFeeCents,
      beforeTaxCents,
      taxCents,
      finalCents: beforeTaxCents - taxCents,
    },
    tax: tax && {
      ...tax,
      deductibleExpensesCents,
      adminFeeDeductionCents: adminFeeCents,
      deductibleExpenses: deductibleExpenses.map((e) => ({ id: e.id, category: e.category, description: e.description, propertyName: e.propertyName, amountCents: e.amountCents })),
      due: { year: due.year, month: due.month },
    },
    byProperty: [...props.values()].sort(
      (a, b) => b.grossCents - a.grossCents || a.propertyName.localeCompare(b.propertyName, 'pt-BR'),
    ),
    stays,
    costStays,
    additionStays,
    expenses,
  };
}

/** Fechamento do mês + líquido final do mês anterior (comparação). */
export async function closing(ownerId: string, { year, month }: MonthQuery) {
  const prev = addMonths(year, month, -1);
  const [current, previous, properties] = await Promise.all([
    computeClosing(ownerId, year, month),
    computeClosing(ownerId, prev.year, prev.month),
    knownProperties(ownerId),
  ]);
  return {
    ...current,
    properties, // nomes de imóvel já usados (seletor das despesas)
    previous: {
      year: prev.year,
      month: prev.month,
      grossCents: previous.totals.grossCents,
      finalCents: previous.totals.finalCents,
    },
  };
}
