import type { PoolClient } from 'pg';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import { resolveName as resolvePropertyName } from '../properties/properties.service.js';
import type {
  PropertyItemInput,
  ReservationItemInput,
  ReservationsQuery,
} from './inventory.schema.js';

/**
 * Inventário do imóvel (modelo) e vistoria por reserva.
 *
 * - O imóvel é identificado pelo nome usado nas reservas, comparado com LOWER(BTRIM(...)).
 * - Ao criar uma reserva, os itens do imóvel são COPIADOS para a reserva (reservation_inventory_items).
 *   A partir daí a reserva tem a própria lista: alterar/remover/adicionar itens nela não mexe no
 *   inventário do imóvel, e mudar o inventário do imóvel não mexe em reservas que já foram copiadas.
 * - Todo `userId` aqui é o dono (cliente) logado — os dados sempre são filtrados por ele.
 */

const sameProperty = (a: string, b: string) => `LOWER(BTRIM(${a})) = LOWER(BTRIM(${b}))`;

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

// ---------------------------------------------------------------------------
// Inventário do imóvel (modelo)
// ---------------------------------------------------------------------------

interface PropertyItemRow {
  id: string;
  property_name: string;
  name: string;
  quantity: number;
  value_cents: number;
}

const toPropertyItem = (r: PropertyItemRow) => ({
  id: r.id,
  propertyName: r.property_name,
  name: r.name,
  quantity: r.quantity,
  valueCents: r.value_cents,
  totalCents: r.quantity * r.value_cents,
});

/** Imóveis cadastrados pelo cliente (Ajustes > Imóveis) que estão ativos, com o resumo do inventário. */
export async function listProperties(userId: string) {
  const { rows } = await query<{
    name: string;
    items_count: number;
    total_cents: number;
    reservations_count: number;
  }>(
    `SELECT p.name,
            COALESCE(i.items_count, 0)::int         AS items_count,
            COALESCE(i.total_cents, 0)::bigint      AS total_cents,
            COALESCE(rc.reservations_count, 0)::int AS reservations_count
       FROM properties p
       LEFT JOIN (
         SELECT LOWER(BTRIM(property_name)) AS key, COUNT(*) AS items_count, SUM(quantity * value_cents) AS total_cents
           FROM inventory_items WHERE owner_id = $1 GROUP BY 1
       ) i ON i.key = LOWER(BTRIM(p.name))
       LEFT JOIN (
         SELECT LOWER(BTRIM(property_name)) AS key, COUNT(*) AS reservations_count
           FROM reservations WHERE owner_id = $1 GROUP BY 1
       ) rc ON rc.key = LOWER(BTRIM(p.name))
      WHERE p.owner_id = $1 AND p.is_active
      ORDER BY LOWER(p.name)`,
    [userId],
  );
  return rows.map((r) => ({
    name: r.name,
    itemsCount: r.items_count,
    totalCents: r.total_cents,
    reservationsCount: r.reservations_count,
  }));
}

export async function listItems(userId: string, property: string) {
  const { rows } = await query<PropertyItemRow>(
    `SELECT id, property_name, name, quantity, value_cents
       FROM inventory_items
      WHERE owner_id = $1 AND ${sameProperty('property_name', '$2')}
      ORDER BY LOWER(name), created_at`,
    [userId, property],
  );
  const items = rows.map(toPropertyItem);
  return { items, totalCents: items.reduce((sum, i) => sum + i.totalCents, 0) };
}

export async function createItem(userId: string, input: PropertyItemInput) {
  // O imóvel precisa estar cadastrado; usa a grafia do cadastro (evita "Casa Praia" e "casa praia" separados)
  const propertyName = await resolvePropertyName({ query }, userId, input.propertyName);

  const { rows } = await query<PropertyItemRow>(
    `INSERT INTO inventory_items (owner_id, property_name, name, quantity, value_cents, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $1, $1)
     RETURNING id, property_name, name, quantity, value_cents`,
    [userId, propertyName, input.name, input.quantity, input.valueCents],
  );
  return toPropertyItem(rows[0]);
}

export async function updateItem(userId: string, id: string, input: Omit<PropertyItemInput, 'propertyName'>) {
  const { rows } = await query<PropertyItemRow>(
    `UPDATE inventory_items
        SET name = $3, quantity = $4, value_cents = $5, updated_by = $1, updated_at = NOW()
      WHERE id = $2 AND owner_id = $1
      RETURNING id, property_name, name, quantity, value_cents`,
    [userId, id, input.name, input.quantity, input.valueCents],
  );
  if (!rows[0]) throw new AppError('Item não encontrado', 404);
  return toPropertyItem(rows[0]);
}

export async function removeItem(userId: string, id: string) {
  const { rowCount } = await query('DELETE FROM inventory_items WHERE id = $1 AND owner_id = $2', [id, userId]);
  if (!rowCount) throw new AppError('Item não encontrado', 404);
}

// ---------------------------------------------------------------------------
// Cópia do inventário para a reserva
// ---------------------------------------------------------------------------

/** Copia os itens do imóvel para a reserva. Só marca a reserva como "carregada" se copiou algo. */
async function copyFromProperty(client: PoolClient, userId: string, reservationId: string) {
  const { rowCount } = await client.query(
    `INSERT INTO reservation_inventory_items (reservation_id, name, quantity, value_cents)
     SELECT r.id, i.name, i.quantity, i.value_cents
       FROM reservations r
       JOIN inventory_items i
         ON i.owner_id = r.owner_id AND ${sameProperty('i.property_name', 'r.property_name')}
      WHERE r.id = $1 AND r.owner_id = $2
      ORDER BY LOWER(i.name), i.created_at`,
    [reservationId, userId],
  );
  if (rowCount) await client.query('UPDATE reservations SET inventory_loaded = TRUE WHERE id = $1', [reservationId]);
  return rowCount ?? 0;
}

/** Chamado pelo cadastro de reservas, dentro da mesma transação, logo após criar a reserva. */
export async function loadOnReservationCreated(client: PoolClient, userId: string, reservationId: string) {
  await copyFromProperty(client, userId, reservationId);
}

/**
 * Chamado pelo cadastro de reservas após editar. Se o imóvel mudou e a vistoria ainda não começou
 * (nada conferido e não vistoriada), troca a lista pela do novo imóvel. Se já houve conferência,
 * mantém a lista atual para não perder o trabalho.
 */
export async function resyncOnPropertyChange(
  client: PoolClient,
  userId: string,
  reservationId: string,
  previousProperty: string,
) {
  const { rows } = await client.query<{ changed: boolean; inventory_status: string }>(
    `SELECT NOT (${sameProperty('r.property_name', '$3')}) AS changed, r.inventory_status
       FROM reservations r WHERE r.id = $1 AND r.owner_id = $2`,
    [reservationId, userId, previousProperty],
  );
  if (!rows[0]?.changed || rows[0].inventory_status === 'VISTORIADO') return;

  const { rows: c } = await client.query<{ checked: number }>(
    'SELECT COUNT(*) FILTER (WHERE checked)::int AS checked FROM reservation_inventory_items WHERE reservation_id = $1',
    [reservationId],
  );
  if (c[0].checked > 0) return;

  await client.query('DELETE FROM reservation_inventory_items WHERE reservation_id = $1', [reservationId]);
  await client.query('UPDATE reservations SET inventory_loaded = FALSE WHERE id = $1', [reservationId]);
  await copyFromProperty(client, userId, reservationId);
}

// ---------------------------------------------------------------------------
// Vistoria da reserva
// ---------------------------------------------------------------------------

/** Trava a reserva do cliente (garante que é dele) e carrega os itens se ainda não foram copiados. */
async function lockAndLoad(client: PoolClient, userId: string, reservationId: string) {
  const { rows } = await client.query<{ inventory_loaded: boolean }>(
    'SELECT inventory_loaded FROM reservations WHERE id = $1 AND owner_id = $2 FOR UPDATE',
    [reservationId, userId],
  );
  if (!rows[0]) throw new AppError('Reserva não encontrada', 404);
  if (!rows[0].inventory_loaded) await copyFromProperty(client, userId, reservationId);
}

/** Vistoriada + item novo/desmarcado = volta a ficar pendente. */
async function syncStatus(client: PoolClient, reservationId: string) {
  await client.query(
    `UPDATE reservations
        SET inventory_status = 'PENDENTE', inspected_at = NULL, inspected_by = NULL
      WHERE id = $1 AND inventory_status = 'VISTORIADO'
        AND EXISTS (SELECT 1 FROM reservation_inventory_items WHERE reservation_id = $1 AND NOT checked)`,
    [reservationId],
  );
}

interface ResItemRow {
  id: string;
  name: string;
  quantity: number;
  value_cents: number;
  checked: boolean;
  checked_at: Date | null;
}

async function readReservation(client: PoolClient, userId: string, reservationId: string) {
  const { rows } = await client.query<{
    id: string;
    reservation_number: string;
    property_name: string;
    check_in: string;
    final_check_out: string;
    status: 'VAZIO' | 'HOSPEDADO' | 'CONCLUIDO';
    inventory_status: 'PENDENTE' | 'VISTORIADO';
    inspected_at: Date | null;
    inspected_by_name: string | null;
    guest_name: string | null;
  }>(
    `SELECT r.id, r.reservation_number, r.property_name, r.check_in, r.final_check_out, r.status,
            r.inventory_status, r.inspected_at, u.name AS inspected_by_name, g.full_name AS guest_name
       FROM reservations r
       LEFT JOIN guests g ON g.id = r.main_guest_id
       LEFT JOIN users u ON u.id = r.inspected_by
      WHERE r.id = $1 AND r.owner_id = $2`,
    [reservationId, userId],
  );
  const r = rows[0];
  if (!r) throw new AppError('Reserva não encontrada', 404);

  const { rows: items } = await client.query<ResItemRow>(
    `SELECT id, name, quantity, value_cents, checked, checked_at
       FROM reservation_inventory_items
      WHERE reservation_id = $1
      ORDER BY LOWER(name), created_at, id`,
    [reservationId],
  );

  return {
    reservation: {
      id: r.id,
      reservationNumber: r.reservation_number,
      propertyName: r.property_name,
      guestName: r.guest_name,
      checkIn: r.check_in,
      finalCheckOut: r.final_check_out,
      status: r.status,
      inventoryStatus: r.inventory_status,
      inspectedAt: r.inspected_at,
      inspectedByName: r.inspected_by_name,
    },
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      valueCents: i.value_cents,
      totalCents: i.quantity * i.value_cents,
      checked: i.checked,
      checkedAt: i.checked_at,
    })),
    summary: {
      itemsCount: items.length,
      checkedCount: items.filter((i) => i.checked).length,
      totalCents: items.reduce((sum, i) => sum + i.quantity * i.value_cents, 0),
    },
  };
}

/** Lista as reservas com a situação da vistoria. */
export async function listReservations(userId: string, { search, status, page, pageSize }: ReservationsQuery) {
  const where: string[] = ['r.owner_id = $1'];
  const params: unknown[] = [userId];
  if (search) {
    params.push(`%${search}%`);
    const like = `$${params.length}`;
    where.push(`(r.reservation_number ILIKE ${like} OR r.property_name ILIKE ${like} OR g.full_name ILIKE ${like})`);
  }
  const baseWhere = `WHERE ${where.join(' AND ')}`;

  // Contadores respeitam a busca, mas não o filtro de situação
  const { rows: counts } = await query<{ all: number; pending: number; inspected: number }>(
    `SELECT COUNT(*)::int AS "all",
            COUNT(*) FILTER (WHERE r.inventory_status = 'PENDENTE')::int AS pending,
            COUNT(*) FILTER (WHERE r.inventory_status = 'VISTORIADO')::int AS inspected
       FROM reservations r LEFT JOIN guests g ON g.id = r.main_guest_id ${baseWhere}`,
    params,
  );

  const listWhere = [...where];
  const listParams = [...params];
  if (status) {
    listParams.push(status);
    listWhere.push(`r.inventory_status = $${listParams.length}`);
  }
  listParams.push(pageSize, (page - 1) * pageSize);

  // Reserva ainda sem cópia: mostra o que o imóvel tem hoje (nada conferido ainda)
  const { rows } = await query<{
    id: string;
    reservation_number: string;
    property_name: string;
    guest_name: string | null;
    check_in: string;
    final_check_out: string;
    status: 'VAZIO' | 'HOSPEDADO' | 'CONCLUIDO';
    platform: string | null;
    inventory_status: 'PENDENTE' | 'VISTORIADO';
    inspected_at: Date | null;
    items_count: number;
    checked_count: number;
    total_cents: number;
  }>(
    `SELECT r.id, r.reservation_number, r.property_name, g.full_name AS guest_name, r.check_in, r.final_check_out,
            r.status, r.platform, r.inventory_status, r.inspected_at,
            CASE WHEN r.inventory_loaded
                 THEN (SELECT COUNT(*) FROM reservation_inventory_items x WHERE x.reservation_id = r.id)
                 ELSE (SELECT COUNT(*) FROM inventory_items i
                        WHERE i.owner_id = r.owner_id AND ${sameProperty('i.property_name', 'r.property_name')})
            END::int AS items_count,
            CASE WHEN r.inventory_loaded
                 THEN (SELECT COUNT(*) FROM reservation_inventory_items x WHERE x.reservation_id = r.id AND x.checked)
                 ELSE 0
            END::int AS checked_count,
            COALESCE(CASE WHEN r.inventory_loaded
                 THEN (SELECT SUM(x.quantity * x.value_cents) FROM reservation_inventory_items x WHERE x.reservation_id = r.id)
                 ELSE (SELECT SUM(i.quantity * i.value_cents) FROM inventory_items i
                        WHERE i.owner_id = r.owner_id AND ${sameProperty('i.property_name', 'r.property_name')})
            END, 0)::bigint AS total_cents
       FROM reservations r
       LEFT JOIN guests g ON g.id = r.main_guest_id
      WHERE ${listWhere.join(' AND ')}
      ORDER BY r.final_check_out DESC, r.created_at DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  const c = counts[0];
  return {
    data: rows.map((r) => ({
      id: r.id,
      reservationNumber: r.reservation_number,
      propertyName: r.property_name,
      guestName: r.guest_name,
      checkIn: r.check_in,
      finalCheckOut: r.final_check_out,
      status: r.status,
      platform: r.platform,
      inventoryStatus: r.inventory_status,
      inspectedAt: r.inspected_at,
      itemsCount: r.items_count,
      checkedCount: r.checked_count,
      totalCents: r.total_cents,
    })),
    total: status === 'PENDENTE' ? c.pending : status === 'VISTORIADO' ? c.inspected : c.all,
    page,
    pageSize,
    counts: c,
  };
}

/** Abre a vistoria da reserva (copia os itens do imóvel na primeira vez, se ainda não foram copiados). */
export function getReservationInventory(userId: string, reservationId: string) {
  return inTransaction(async (client) => {
    await lockAndLoad(client, userId, reservationId);
    return readReservation(client, userId, reservationId);
  });
}

/** Roda uma alteração na lista da reserva e devolve a vistoria atualizada. */
function mutate(userId: string, reservationId: string, change: (client: PoolClient) => Promise<void>) {
  return inTransaction(async (client) => {
    await lockAndLoad(client, userId, reservationId);
    await change(client);
    await syncStatus(client, reservationId);
    return readReservation(client, userId, reservationId);
  });
}

const notFoundIfNone = (rowCount: number | null) => {
  if (!rowCount) throw new AppError('Item não encontrado', 404);
};

export const addReservationItem = (userId: string, reservationId: string, input: ReservationItemInput) =>
  mutate(userId, reservationId, async (client) => {
    await client.query(
      `INSERT INTO reservation_inventory_items (reservation_id, name, quantity, value_cents)
       VALUES ($1, $2, $3, $4)`,
      [reservationId, input.name, input.quantity, input.valueCents],
    );
  });

export const updateReservationItem = (
  userId: string,
  reservationId: string,
  itemId: string,
  input: ReservationItemInput,
) =>
  mutate(userId, reservationId, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE reservation_inventory_items SET name = $3, quantity = $4, value_cents = $5
        WHERE id = $1 AND reservation_id = $2`,
      [itemId, reservationId, input.name, input.quantity, input.valueCents],
    );
    notFoundIfNone(rowCount);
  });

export const removeReservationItem = (userId: string, reservationId: string, itemId: string) =>
  mutate(userId, reservationId, async (client) => {
    const { rowCount } = await client.query(
      'DELETE FROM reservation_inventory_items WHERE id = $1 AND reservation_id = $2',
      [itemId, reservationId],
    );
    notFoundIfNone(rowCount);
  });

/**
 * `actorId` = quem fez a ação (auditoria). Por padrão é o próprio dono; na área do associado
 * `userId` é o dono dos dados (cliente) e `actorId` é o associado.
 */
export const setItemChecked = (
  userId: string,
  reservationId: string,
  itemId: string,
  checked: boolean,
  actorId: string = userId,
) =>
  mutate(userId, reservationId, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE reservation_inventory_items
          SET checked = $3::boolean,
              checked_at = CASE WHEN $3::boolean THEN NOW() ELSE NULL END,
              checked_by = CASE WHEN $3::boolean THEN $4::uuid ELSE NULL END
        WHERE id = $1 AND reservation_id = $2`,
      [itemId, reservationId, checked, actorId],
    );
    notFoundIfNone(rowCount);
  });

export const setAllChecked = (userId: string, reservationId: string, checked: boolean, actorId: string = userId) =>
  mutate(userId, reservationId, async (client) => {
    await client.query(
      `UPDATE reservation_inventory_items
          SET checked = $2::boolean,
              checked_at = CASE WHEN $2::boolean THEN NOW() ELSE NULL END,
              checked_by = CASE WHEN $2::boolean THEN $3::uuid ELSE NULL END
        WHERE reservation_id = $1`,
      [reservationId, checked, actorId],
    );
  });

/** Conclui a vistoria: só é possível com todos os itens conferidos. */
export const inspect = (userId: string, reservationId: string, actorId: string = userId) =>
  mutate(userId, reservationId, async (client) => {
    const { rows } = await client.query<{ pending: number }>(
      `SELECT COUNT(*) FILTER (WHERE NOT checked)::int AS pending
         FROM reservation_inventory_items WHERE reservation_id = $1`,
      [reservationId],
    );
    if (rows[0].pending > 0) {
      throw new AppError(
        `Ainda há ${rows[0].pending} ${rows[0].pending === 1 ? 'item' : 'itens'} sem conferir`,
        422,
      );
    }
    await client.query(
      `UPDATE reservations SET inventory_status = 'VISTORIADO', inspected_at = NOW(), inspected_by = $2 WHERE id = $1`,
      [reservationId, actorId],
    );
  });

/** Volta a reserva para "pendente de vistoria" (os itens continuam como estão). */
export const reopen = (userId: string, reservationId: string) =>
  mutate(userId, reservationId, async (client) => {
    await client.query(
      `UPDATE reservations SET inventory_status = 'PENDENTE', inspected_at = NULL, inspected_by = NULL WHERE id = $1`,
      [reservationId],
    );
  });
