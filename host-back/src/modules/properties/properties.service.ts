import { pool, query } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import type { PropertyInput } from './properties.schema.js';

/**
 * Cadastro de imóveis do cliente.
 *
 * As outras tabelas (reservas, inventário, despesas, calendário) guardam o imóvel pelo NOME.
 * Por isso renomear aqui atualiza o nome em todas elas, e excluir só é permitido quando nada
 * usa o imóvel (senão o cliente desativa).
 */

/** Tabelas que guardam o imóvel pelo nome (todas têm owner_id). */
const NAME_TABLES = ['reservations', 'inventory_items', 'recurring_expenses', 'month_expenses', 'calendar_feeds'] as const;

const sameName = (a: string, b: string) => `LOWER(BTRIM(${a})) = LOWER(BTRIM(${b}))`;

interface PropertyRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  is_active: boolean;
  reservations_count?: number;
  items_count?: number;
}

const toProperty = (r: PropertyRow) => ({
  id: r.id,
  name: r.name,
  address: r.address,
  city: r.city,
  state: r.state,
  notes: r.notes,
  isActive: r.is_active,
  reservationsCount: r.reservations_count ?? 0,
  itemsCount: r.items_count ?? 0,
});

const COLUMNS = 'id, name, address, city, state, notes, is_active';

function handleDbError(err: unknown): never {
  if ((err as { code?: string }).code === '23505') throw new AppError('Já existe um imóvel com esse nome', 409);
  throw err;
}

export async function list(ownerId: string) {
  const { rows } = await query<PropertyRow>(
    `SELECT p.id, p.name, p.address, p.city, p.state, p.notes, p.is_active,
            (SELECT COUNT(*) FROM reservations r
              WHERE r.owner_id = p.owner_id AND ${sameName('r.property_name', 'p.name')})::int AS reservations_count,
            (SELECT COUNT(*) FROM inventory_items i
              WHERE i.owner_id = p.owner_id AND ${sameName('i.property_name', 'p.name')})::int AS items_count
       FROM properties p
      WHERE p.owner_id = $1
      ORDER BY p.is_active DESC, LOWER(p.name)`,
    [ownerId],
  );
  return rows.map(toProperty);
}

export async function create(ownerId: string, userId: string, input: PropertyInput) {
  try {
    const { rows } = await query<PropertyRow>(
      `INSERT INTO properties (owner_id, name, address, city, state, notes, is_active, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING ${COLUMNS}`,
      [ownerId, input.name, input.address, input.city, input.state, input.notes, input.isActive, userId],
    );
    return toProperty(rows[0]);
  } catch (err) {
    handleDbError(err);
  }
}

export async function update(ownerId: string, userId: string, id: string, input: PropertyInput) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: previous } = await client.query<{ name: string }>(
      'SELECT name FROM properties WHERE id = $1 AND owner_id = $2 FOR UPDATE',
      [id, ownerId],
    );
    if (!previous[0]) throw new AppError('Imóvel não encontrado', 404);

    const { rows } = await client.query<PropertyRow>(
      `UPDATE properties
          SET name = $3, address = $4, city = $5, state = $6, notes = $7, is_active = $8,
              updated_by = $9, updated_at = NOW()
        WHERE id = $1 AND owner_id = $2
        RETURNING ${COLUMNS}`,
      [id, ownerId, input.name, input.address, input.city, input.state, input.notes, input.isActive, userId],
    );

    // Renomeou: propaga o novo nome para tudo que estava ligado ao nome antigo
    if (previous[0].name !== input.name) {
      for (const table of NAME_TABLES) {
        await client.query(
          `UPDATE ${table} SET property_name = $3
            WHERE owner_id = $1 AND ${sameName('property_name', '$2')}`,
          [ownerId, previous[0].name, input.name],
        );
      }
    }
    await client.query('COMMIT');
    return toProperty(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    handleDbError(err);
  } finally {
    client.release();
  }
}

export async function remove(ownerId: string, id: string) {
  const { rows } = await query<{ name: string }>('SELECT name FROM properties WHERE id = $1 AND owner_id = $2', [
    id,
    ownerId,
  ]);
  if (!rows[0]) throw new AppError('Imóvel não encontrado', 404);

  const usage = await Promise.all(
    NAME_TABLES.map((table) =>
      query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM ${table} WHERE owner_id = $1 AND ${sameName('property_name', '$2')}`,
        [ownerId, rows[0].name],
      ),
    ),
  );
  if (usage.some((u) => u.rows[0].n > 0)) {
    throw new AppError(
      'Este imóvel já tem reservas, inventário, despesas ou calendário ligados a ele. Desative-o em vez de excluir.',
      409,
    );
  }
  await query('DELETE FROM properties WHERE id = $1 AND owner_id = $2', [id, ownerId]);
}

/** Pool ou cliente de transação: os dois têm `query`. */
type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: { name: string }[] }> };

/**
 * Devolve o nome do imóvel exatamente como foi cadastrado (aceita outra caixa ou espaços nas pontas)
 * ou falha quando o imóvel não está cadastrado. Usado ao salvar reservas e itens de inventário.
 */
export async function resolveName(db: Queryable, ownerId: string, name: string): Promise<string> {
  const { rows } = await db.query(
    `SELECT name FROM properties WHERE owner_id = $1 AND ${sameName('name', '$2')} LIMIT 1`,
    [ownerId, name],
  );
  if (!rows[0]) throw new AppError('Imóvel não cadastrado. Cadastre-o em Ajustes > Imóveis.', 422);
  return rows[0].name;
}
