import { query } from '../../db/pool.js';
import { propertyKey } from './expenses.service.js';
import type { MonthQuery } from './finance.schema.js';

/**
 * Finanças do mês — critério PROPORCIONAL AOS DIAS (competência):
 * cada dia da hospedagem, do check-in ao check-out (inclusive), pertence ao seu mês, e os valores
 * são quebrados nessa proporção. Ex.: 28/09 → 01/10 (4 dias) = 3/4 em setembro e 1/4 em outubro;
 * 28/09 → 03/10 (6 dias) = 3/6 em setembro e 3/6 em outubro.
 * - Valor e comissão: proporcionais aos dias de cada trecho (a extensão tem valor/comissão próprios;
 *   o dia em que a extensão começa já é o check-out do trecho anterior, então não conta duas vezes);
 * - Custos e taxas: proporcionais aos dias da hospedagem inteira (check-in → check-out final).
 * Ocupação e "noites no mês" continuam em noites (check-in conta, check-out não).
 *
 * Relatório financeiro = só as hospedagens (bruto − comissões − custos), SEM despesas do mês,
 * taxa de administração ou impostos. Esses descontos ficam no Fechamento do mês
 * (closing.service.ts), que usa o regime de caixa (datas não quebradas).
 */

type Status = 'VAZIO' | 'HOSPEDADO' | 'CONCLUIDO';
type Platform = 'AIRBNB' | 'BOOKING' | 'VRBO' | 'DIRETO' | 'OUTRA';

interface Row {
  id: string;
  reservation_number: string;
  property_name: string;
  main_guest_id: string;
  main_guest_name: string;
  platform: Platform | null;
  status: Status;
  check_in: string;
  check_out: string;
  final_check_out: string;
  amount_cents: number;
  commission_cents: number;
  costs_cents: number;
  extensions_cents: number;
  extensions_commission_cents: number;
}

interface ExtensionRow {
  reservation_id: string;
  start_date: string;
  check_out: string;
  amount_cents: number;
  commission_cents: number;
}

const DAY = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const nights = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / DAY);
/** Noites do trecho [from, to) que caem em [start, end). */
function overlap(from: string, to: string, start: string, end: string) {
  const a = Math.max(toTime(from), toTime(start));
  const b = Math.min(toTime(to), toTime(end));
  return b > a ? Math.round((b - a) / DAY) : 0;
}
const pad = (n: number) => String(n).padStart(2, '0');
/** Primeiro dia do mês e primeiro dia do mês seguinte (fim exclusivo). */
function monthRange(year: number, month: number) {
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const start = `${year}-${pad(month)}-01`;
  const end = `${next.y}-${pad(next.m)}-01`;
  return { start, end, days: nights(start, end) };
}
/** Dias do trecho [from, to] (inclusive) que caem em [start, end). */
const overlapDays = (from: string, to: string, start: string, end: string) =>
  overlap(from, nextDay(to), start, end);
const nextDay = (iso: string) => new Date(toTime(iso) + DAY).toISOString().slice(0, 10);
const prorate = (cents: number, part: number, total: number) => (total > 0 ? Math.round((cents * part) / total) : 0);

async function computeMonth(ownerId: string, year: number, month: number) {
  const { start, end, days } = monthRange(year, month);

  // Reservas com pelo menos um dia no mês (inclui a que só faz check-out no dia 1)
  const { rows } = await query<Row>(
    `SELECT r.id, r.reservation_number, r.property_name, r.main_guest_id, g.full_name AS main_guest_name,
            r.platform, r.status,
            -- datas como texto AAAA-MM-DD (independe do parser de DATE do driver)
            r.check_in::text AS check_in, r.check_out::text AS check_out, r.final_check_out::text AS final_check_out,
            r.amount_cents::float8 AS amount_cents, r.commission_cents::float8 AS commission_cents, r.costs_cents::float8 AS costs_cents,
            r.extensions_cents::float8 AS extensions_cents, r.extensions_commission_cents::float8 AS extensions_commission_cents
       FROM reservations r
       JOIN guests g ON g.id = r.main_guest_id
      WHERE r.owner_id = $3 AND r.check_in < $2::date AND r.final_check_out >= $1::date
      ORDER BY r.check_in, r.created_at`,
    [start, end, ownerId],
  );

  const ids = rows.map((r) => r.id);
  const { rows: extRows } = ids.length
    ? await query<ExtensionRow>(
        `SELECT reservation_id, start_date::text AS start_date, check_out::text AS check_out,
                amount_cents::float8 AS amount_cents, commission_cents::float8 AS commission_cents
           FROM reservation_extensions WHERE reservation_id = ANY($1::uuid[]) ORDER BY position`,
        [ids],
      )
    : { rows: [] as ExtensionRow[] };
  const extByReservation = new Map<string, ExtensionRow[]>();
  for (const e of extRows) extByReservation.set(e.reservation_id, [...(extByReservation.get(e.reservation_id) ?? []), e]);

  const data = rows.map((r) => {
    const totalNights = nights(r.check_in, r.final_check_out);
    const totalDays = totalNights + 1; // check-in e check-out contam
    // Reserva original: dias [check-in, check-out]
    const baseDays = nights(r.check_in, r.check_out) + 1;
    const baseIn = overlapDays(r.check_in, r.check_out, start, end);
    let grossCents = prorate(r.amount_cents, baseIn, baseDays);
    let commissionCents = prorate(r.commission_cents, baseIn, baseDays);
    let extensionsCents = 0;
    let daysInMonth = baseIn;
    // Extensões (cada uma com seu valor e comissão): dias (início, check-out] — o dia do início
    // já foi contado no trecho anterior
    for (const e of extByReservation.get(r.id) ?? []) {
      const extDays = nights(e.start_date, e.check_out);
      const extIn = overlap(nextDay(e.start_date), nextDay(e.check_out), start, end);
      const extGross = prorate(e.amount_cents, extIn, extDays);
      grossCents += extGross;
      extensionsCents += extGross;
      commissionCents += prorate(e.commission_cents, extIn, extDays);
      daysInMonth += extIn;
    }
    const costsCents = prorate(r.costs_cents, daysInMonth, totalDays);
    // Noites dormidas no mês (para ocupação)
    const nightsInMonth = overlap(r.check_in, r.final_check_out, start, end);
    const fullGrossCents = r.amount_cents + r.extensions_cents;

    return {
      id: r.id,
      reservationNumber: r.reservation_number,
      propertyName: r.property_name,
      mainGuest: { id: r.main_guest_id, fullName: r.main_guest_name },
      platform: r.platform,
      status: r.status,
      checkIn: r.check_in,
      finalCheckOut: r.final_check_out,
      totalNights,
      nightsInMonth,
      totalDays,
      daysInMonth,
      // true = a hospedagem atravessa a virada do mês (só parte dos valores entra aqui)
      partial: daysInMonth < totalDays,
      grossCents,
      extensionsCents,
      commissionCents,
      costsCents,
      netCents: grossCents - commissionCents - costsCents,
      // Valores da hospedagem inteira, para referência
      fullGrossCents,
      fullNetCents: fullGrossCents - r.commission_cents - r.extensions_commission_cents - r.costs_cents,
    };
  });

  const sum = (pick: (d: (typeof data)[number]) => number) => data.reduce((s, d) => s + pick(d), 0);
  // Diária média = valor das hospedagens inteiras ÷ noites (preço médio por noite das hospedagens do mês)
  const allNights = sum((d) => d.totalNights);
  const averageDaily = allNights ? Math.round(sum((d) => d.fullGrossCents) / allNights) : 0;
  const totals = {
    reservations: data.length,
    nights: sum((d) => d.nightsInMonth),
    days: sum((d) => d.daysInMonth), // dias no mês (base da divisão dos valores)
    grossCents: sum((d) => d.grossCents),
    extensionsCents: sum((d) => d.extensionsCents),
    commissionCents: sum((d) => d.commissionCents),
    costsCents: sum((d) => d.costsCents),
    netCents: sum((d) => d.netCents),
  };

  // Por imóvel (com ocupação = noites vendidas ÷ dias do mês)
  type PropertyTotals = {
    propertyName: string;
    reservations: number;
    nights: number;
    grossCents: number;
    commissionCents: number;
    costsCents: number;
    netCents: number; // resultado: bruto − comissões − custos das hospedagens
  };
  const emptyProperty = (propertyName: string): PropertyTotals => ({
    propertyName, reservations: 0, nights: 0, grossCents: 0, commissionCents: 0, costsCents: 0, netCents: 0,
  });
  const propMap = new Map<string, PropertyTotals>();
  // Por plataforma
  const platMap = new Map<string, { platform: Platform | null; reservations: number; nights: number; days: number; grossCents: number; commissionCents: number; costsCents: number; netCents: number }>();
  for (const d of data) {
    const pk = propertyKey(d.propertyName);
    const p = propMap.get(pk) ?? emptyProperty(d.propertyName.trim());
    const k = d.platform ?? 'SEM';
    const q = platMap.get(k) ?? { platform: d.platform, reservations: 0, nights: 0, days: 0, grossCents: 0, commissionCents: 0, costsCents: 0, netCents: 0 };
    for (const t of [p, q]) {
      t.reservations += 1;
      t.nights += d.nightsInMonth;
      t.grossCents += d.grossCents;
      t.commissionCents += d.commissionCents;
      t.costsCents += d.costsCents;
      t.netCents += d.netCents;
    }
    q.days += d.daysInMonth;
    propMap.set(pk, p);
    platMap.set(k, q);
  }

  return {
    period: { year, month, start, end, days },
    totals: {
      ...totals,
      averageDailyCents: averageDaily,
    },
    byProperty: [...propMap.values()]
      .map((p) => ({ ...p, occupancy: Math.min(1, p.nights / days) }))
      .sort((a, b) => b.grossCents - a.grossCents || a.propertyName.localeCompare(b.propertyName, 'pt-BR')),
    byPlatform: [...platMap.values()].sort((a, b) => b.grossCents - a.grossCents),
    data,
  };
}

/** Resumo do mês + totais do mês anterior (para comparação). */
export async function monthSummary(ownerId: string, { year, month }: MonthQuery) {
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const [current, previous] = await Promise.all([computeMonth(ownerId, year, month), computeMonth(ownerId, prev.year, prev.month)]);
  return {
    ...current,
    previous: {
      year: prev.year,
      month: prev.month,
      reservations: previous.totals.reservations,
      nights: previous.totals.nights,
      grossCents: previous.totals.grossCents,
      netCents: previous.totals.netCents,
    },
  };
}
