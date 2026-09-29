import type { PoolClient } from 'pg';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import type { CreateExpenseInput, UpdateExpenseInput } from './finance.schema.js';

/**
 * Despesas do imóvel por mês (condomínio, IPTU, contas...).
 * - Avulsa: um lançamento só naquele mês.
 * - Recorrente: um "modelo" (recurring_expenses) que gera um lançamento por mês,
 *   criado automaticamente quando o mês é aberto. O valor pode ser ajustado só num mês
 *   (ex.: conta de luz) ou a partir dele para os próximos.
 */

const pad = (n: number) => String(n).padStart(2, '0');
/** 1º dia do mês, no formato AAAA-MM-DD. */
export const periodOf = (year: number, month: number) => `${year}-${pad(month)}-01`;
function addMonths(period: string, delta: number) {
  const [y, m] = period.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return periodOf(Math.floor(idx / 12), (idx % 12) + 1);
}

/** Chave para comparar nomes de imóvel (sem diferenciar maiúsculas e espaços). */
export const propertyKey = (name: string | null) => (name ? name.trim().replace(/\s+/g, ' ').toLowerCase() : '');

interface ExpenseRow {
  id: string;
  period: string;
  property_name: string | null;
  category: CreateExpenseInput['category'];
  description: string;
  amount_cents: number;
  recurring_expense_id: string | null;
  edited: boolean;
  updated_at: Date;
  updated_by_name: string | null;
  // modelo (quando recorrente)
  re_amount_cents: number | null;
  re_start_month: string | null;
  re_end_month: string | null;
}

const SELECT = `
  SELECT me.id, me.period::text AS period, me.property_name, me.category, me.description,
         me.amount_cents::float8 AS amount_cents, me.recurring_expense_id, me.edited, me.updated_at,
         u.name AS updated_by_name,
         re.amount_cents::float8 AS re_amount_cents, re.start_month::text AS re_start_month, re.end_month::text AS re_end_month
    FROM month_expenses me
    LEFT JOIN recurring_expenses re ON re.id = me.recurring_expense_id
    LEFT JOIN users u ON u.id = COALESCE(me.updated_by, me.created_by)`;

const toExpense = (r: ExpenseRow) => ({
  id: r.id,
  period: r.period,
  propertyName: r.property_name, // null = despesa geral
  category: r.category,
  description: r.description,
  amountCents: r.amount_cents,
  recurring: r.recurring_expense_id
    ? {
        id: r.recurring_expense_id,
        amountCents: r.re_amount_cents, // valor padrão dos meses
        startMonth: r.re_start_month,
        endMonth: r.re_end_month, // null = sem data para acabar
      }
    : null,
  edited: r.edited, // valor alterado só neste mês
  updatedAt: r.updated_at,
  updatedByName: r.updated_by_name,
});

type Run = PoolClient['query'];
const runner = (client?: PoolClient) => (client ? client.query.bind(client) : query) as Run;

/** Cria os lançamentos do mês das despesas recorrentes que ainda não existem nele (idempotente). */
export async function materialize(ownerId: string, period: string, client?: PoolClient) {
  await runner(client)(
    `INSERT INTO month_expenses (owner_id, period, property_name, category, description, amount_cents, recurring_expense_id,
                                 created_by, updated_by)
     SELECT re.owner_id, $1::date, re.property_name, re.category, re.description, re.amount_cents, re.id, re.created_by, re.created_by
       FROM recurring_expenses re
      WHERE re.owner_id = $2 AND re.start_month <= $1::date AND (re.end_month IS NULL OR re.end_month >= $1::date)
     ON CONFLICT (recurring_expense_id, period) WHERE recurring_expense_id IS NOT NULL DO NOTHING`,
    [period, ownerId],
  );
}

/** Despesas do mês (já com as recorrentes geradas), agrupáveis por imóvel. */
export async function listByPeriod(ownerId: string, year: number, month: number) {
  const period = periodOf(year, month);
  await materialize(ownerId, period);
  const { rows } = await query<ExpenseRow>(
    `${SELECT} WHERE me.owner_id = $2 AND me.period = $1::date AND NOT me.skipped
      ORDER BY me.property_name NULLS LAST, me.category, me.created_at`,
    [period, ownerId],
  );
  return rows.map(toExpense);
}

/** Nomes de imóvel já usados (reservas e despesas), para o seletor. */
export async function knownProperties(ownerId: string) {
  const { rows } = await query<{ name: string }>(
    `SELECT DISTINCT ON (LOWER(name)) name
       FROM (
         SELECT regexp_replace(btrim(property_name), '\\s+', ' ', 'g') AS name FROM reservations WHERE owner_id = $1
         UNION ALL
         SELECT regexp_replace(btrim(property_name), '\\s+', ' ', 'g') FROM recurring_expenses WHERE owner_id = $1 AND property_name IS NOT NULL
         UNION ALL
         SELECT regexp_replace(btrim(property_name), '\\s+', ' ', 'g') FROM month_expenses WHERE owner_id = $1 AND property_name IS NOT NULL
       ) x
      ORDER BY LOWER(name), name`,
    [ownerId],
  );
  return rows.map((r) => r.name).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Usa a grafia de um imóvel já existente quando o nome bate (ex.: "casa  a" → "Casa A"). */
async function resolvePropertyName(ownerId: string, name: string | null) {
  if (!name) return null;
  const match = (await knownProperties(ownerId)).find((p) => propertyKey(p) === propertyKey(name));
  return match ?? name;
}

async function getById(ownerId: string, id: string, client?: PoolClient) {
  const { rows } = await runner(client)<ExpenseRow>(`${SELECT} WHERE me.id = $1 AND me.owner_id = $2 AND NOT me.skipped`, [
    id,
    ownerId,
  ]);
  if (!rows[0]) throw new AppError('Despesa não encontrada', 404);
  return rows[0];
}

async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function create(data: CreateExpenseInput, userId: string) {
  const input = { ...data, propertyName: await resolvePropertyName(userId, data.propertyName) };
  const period = periodOf(input.year, input.month);
  return inTransaction(async (client) => {
    let recurringId: string | null = null;
    if (input.recurring) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO recurring_expenses (owner_id, property_name, category, description, amount_cents, start_month, created_by, updated_by)
         VALUES ($6, $1, $2, $3, $4, $5::date, $6, $6) RETURNING id`,
        [input.propertyName, input.category, input.description, input.amountCents, period, userId],
      );
      recurringId = rows[0].id;
    }
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO month_expenses (owner_id, period, property_name, category, description, amount_cents, recurring_expense_id,
                                   created_by, updated_by)
       VALUES ($7, $1::date, $2, $3, $4, $5, $6, $7, $7) RETURNING id`,
      [period, input.propertyName, input.category, input.description, input.amountCents, recurringId, userId],
    );
    return toExpense(await getById(userId, rows[0].id, client));
  });
}

export async function update(id: string, data: UpdateExpenseInput, userId: string) {
  const input = { ...data, propertyName: await resolvePropertyName(userId, data.propertyName) };
  return inTransaction(async (client) => {
    const current = await getById(userId, id, client);
    const values = [input.propertyName, input.category, input.description, input.amountCents];

    if (current.recurring_expense_id && input.applyToFuture) {
      // Muda o modelo e os próximos meses já gerados que não tiveram valor ajustado
      await client.query(
        `UPDATE recurring_expenses
            SET property_name = $2, category = $3, description = $4, amount_cents = $5, updated_by = $6, updated_at = NOW()
          WHERE id = $1`,
        [current.recurring_expense_id, ...values, userId],
      );
      await client.query(
        `UPDATE month_expenses
            SET property_name = $3, category = $4, description = $5, amount_cents = $6, updated_by = $7, updated_at = NOW()
          WHERE recurring_expense_id = $1 AND period > $2::date AND NOT edited AND NOT skipped`,
        [current.recurring_expense_id, current.period, ...values, userId],
      );
    }

    // "edited" marca um recorrente com dados diferentes do modelo só neste mês
    const edited =
      !!current.recurring_expense_id &&
      !input.applyToFuture &&
      (input.amountCents !== current.re_amount_cents ||
        input.description !== current.description ||
        input.category !== current.category ||
        propertyKey(input.propertyName) !== propertyKey(current.property_name) ||
        current.edited);
    await client.query(
      `UPDATE month_expenses
          SET property_name = $2, category = $3, description = $4, amount_cents = $5, edited = $6,
              updated_by = $7, updated_at = NOW()
        WHERE id = $1 AND owner_id = $7`,
      [id, ...values, edited, userId],
    );
    return toExpense(await getById(userId, id, client));
  });
}

/**
 * Remove a despesa.
 * - Avulsa: apaga o lançamento.
 * - Recorrente, scope "month": tira só deste mês (fica marcada para não ser recriada).
 * - Recorrente, scope "future": para de repetir a partir deste mês (apaga este e os próximos).
 */
export function remove(id: string, scope: 'month' | 'future', userId: string) {
  return inTransaction(async (client) => {
    const current = await getById(userId, id, client);
    if (!current.recurring_expense_id) {
      await client.query('DELETE FROM month_expenses WHERE id = $1 AND owner_id = $2', [id, userId]);
      return;
    }
    if (scope === 'month') {
      await client.query(
        'UPDATE month_expenses SET skipped = TRUE, updated_by = $2, updated_at = NOW() WHERE id = $1 AND owner_id = $2',
        [id, userId],
      );
      return;
    }
    await client.query('DELETE FROM month_expenses WHERE recurring_expense_id = $1 AND period >= $2::date', [
      current.recurring_expense_id,
      current.period,
    ]);
    const lastMonth = addMonths(current.period, -1);
    if (current.re_start_month && lastMonth < current.re_start_month) {
      // Começava neste mês: não sobra nenhum mês, apaga o modelo
      await client.query('DELETE FROM recurring_expenses WHERE id = $1', [current.recurring_expense_id]);
    } else {
      await client.query(
        'UPDATE recurring_expenses SET end_month = $2::date, updated_by = $3, updated_at = NOW() WHERE id = $1',
        [current.recurring_expense_id, lastMonth, userId],
      );
    }
  });
}
