import type { PoolClient } from 'pg';
import { query } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import type { ListQuery } from './blocklist.schema.js';

type DocumentType = 'CPF' | 'PASSAPORTE' | 'DNI' | 'CNPJ';

interface BlockRow {
  guest_id: string;
  full_name: string;
  document_type: DocumentType;
  document_number: string;
  phone: string;
  email: string | null;
  reason: string;
  reservation_id: string | null;
  reservation_number: string | null;
  blocked_at: Date;
  blocked_by_name: string | null;
  updated_at: Date;
  updated_by_name: string | null;
  rating_avg: number | null;
  rating_count: number;
}

interface ReviewRow {
  reservation_id: string;
  reservation_number: string;
  property_name: string;
  check_in: string;
  final_check_out: string;
  cleanliness_rating: number;
  communication_rating: number;
  rules_rating: number;
  notes: string | null;
  updated_at: Date;
  reviewed_by_name: string | null;
}

/**
 * Trecho SQL reaproveitado por outros módulos: dados do bloqueio de um hóspede.
 * Use com LEFT JOIN guest_blocks gb ON gb.guest_id = <hóspede>.
 */
export const BLOCK_COLUMNS = `
  gb.reason AS block_reason, gb.blocked_at AS block_blocked_at, gb.reservation_id AS block_reservation_id,
  (SELECT u.name FROM users u WHERE u.id = gb.blocked_by) AS block_blocked_by_name,
  (SELECT r2.reservation_number FROM reservations r2 WHERE r2.id = gb.reservation_id) AS block_reservation_number`;

export interface BlockColumnsRow {
  block_reason: string | null;
  block_blocked_at: Date | null;
  block_reservation_id: string | null;
  block_blocked_by_name: string | null;
  block_reservation_number: string | null;
}

/** Converte as colunas de BLOCK_COLUMNS no objeto "blocked" (null = não bloqueado). */
export const toBlocked = (r: BlockColumnsRow) =>
  r.block_reason
    ? {
        reason: r.block_reason,
        blockedAt: r.block_blocked_at,
        blockedByName: r.block_blocked_by_name,
        reservationId: r.block_reservation_id,
        reservationNumber: r.block_reservation_number,
      }
    : null;

const SELECT = `
  SELECT g.id AS guest_id, g.full_name, g.document_type, g.document_number, g.phone, g.email,
         gb.reason, gb.reservation_id, r.reservation_number,
         gb.blocked_at, bu.name AS blocked_by_name, gb.updated_at, uu.name AS updated_by_name,
         rt.avg AS rating_avg, rt.total AS rating_count
    FROM guest_blocks gb
    JOIN guests g ON g.id = gb.guest_id
    LEFT JOIN reservations r ON r.id = gb.reservation_id
    LEFT JOIN users bu ON bu.id = gb.blocked_by
    LEFT JOIN users uu ON uu.id = gb.updated_by
    LEFT JOIN LATERAL (
      SELECT ROUND(AVG((rv.cleanliness_rating + rv.communication_rating + rv.rules_rating) / 3.0), 1) AS avg,
             COUNT(*)::int AS total
        FROM reservation_reviews rv
        JOIN reservations rx ON rx.id = rv.reservation_id
       WHERE rx.main_guest_id = g.id
    ) rt ON TRUE`;

const toBlock = (r: BlockRow) => ({
  guest: {
    id: r.guest_id,
    fullName: r.full_name,
    documentType: r.document_type,
    documentNumber: r.document_number,
    phone: r.phone,
    email: r.email,
    averageRating: r.rating_avg,
    reviewsCount: r.rating_count,
  },
  reason: r.reason,
  reservationId: r.reservation_id,
  reservationNumber: r.reservation_number,
  blockedAt: r.blocked_at,
  blockedByName: r.blocked_by_name,
  updatedAt: r.updated_at,
  updatedByName: r.updated_by_name,
});

export async function list(ownerId: string, { search, page, pageSize }: ListQuery) {
  const where: string[] = ['g.owner_id = $1'];
  const params: unknown[] = [ownerId];
  if (search) {
    params.push(`%${search}%`);
    const like = `$${params.length}`;
    const digits = search.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    params.push(digits ? `%${digits}%` : '%__nenhum__%');
    const raw = `$${params.length}`;
    where.push(`(g.full_name ILIKE ${like} OR gb.reason ILIKE ${like} OR g.document_number LIKE ${raw})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows: countRows } = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM guest_blocks gb JOIN guests g ON g.id = gb.guest_id ${whereSql}`,
    params,
  );
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await query<BlockRow>(
    `${SELECT} ${whereSql} ORDER BY gb.blocked_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { data: rows.map(toBlock), total: countRows[0].total, page, pageSize };
}

/** Bloqueio + avaliações de todas as hospedagens em que o hóspede foi o responsável. */
export async function getDetail(ownerId: string, guestId: string) {
  const { rows } = await query<BlockRow>(`${SELECT} WHERE gb.guest_id = $1 AND g.owner_id = $2`, [guestId, ownerId]);
  if (!rows[0]) throw new AppError('Este hóspede não está bloqueado', 404);
  const { rows: reviews } = await query<ReviewRow>(
    `SELECT r.id AS reservation_id, r.reservation_number, r.property_name, r.check_in, r.final_check_out,
            rv.cleanliness_rating, rv.communication_rating, rv.rules_rating, rv.notes, rv.updated_at,
            u.name AS reviewed_by_name
       FROM reservation_reviews rv
       JOIN reservations r ON r.id = rv.reservation_id
       LEFT JOIN users u ON u.id = COALESCE(rv.updated_by, rv.created_by)
      WHERE r.main_guest_id = $1
      ORDER BY r.check_in DESC`,
    [guestId],
  );
  return {
    block: toBlock(rows[0]),
    reviews: reviews.map((v) => ({
      reservationId: v.reservation_id,
      reservationNumber: v.reservation_number,
      propertyName: v.property_name,
      checkIn: v.check_in,
      finalCheckOut: v.final_check_out,
      cleanlinessRating: v.cleanliness_rating,
      communicationRating: v.communication_rating,
      rulesRating: v.rules_rating,
      average: Math.round(((v.cleanliness_rating + v.communication_rating + v.rules_rating) / 3) * 10) / 10,
      notes: v.notes,
      updatedAt: v.updated_at,
      reviewedByName: v.reviewed_by_name,
      // reserva que motivou o bloqueio
      isBlockOrigin: v.reservation_id === rows[0].reservation_id,
    })),
  };
}

/**
 * (`userId` é o próprio cliente dono dos dados.)
 * Bloqueia o hóspede ou, se já estiver bloqueado, atualiza o motivo
 * (mantém a data e quem bloqueou originalmente). Aceita um client para rodar dentro de transação.
 */
export async function block(
  guestId: string,
  reason: string,
  reservationId: string | null,
  userId: string,
  client?: PoolClient,
) {
  const run = client ? client.query.bind(client) : query;
  // O hóspede (e a reserva, se informada) precisam ser do mesmo cliente
  const { rowCount: guestOk } = await run('SELECT 1 FROM guests WHERE id = $1 AND owner_id = $2', [guestId, userId]);
  if (!guestOk) throw new AppError('Hóspede ou reserva não encontrado', 404);
  if (reservationId) {
    const { rowCount: resOk } = await run('SELECT 1 FROM reservations WHERE id = $1 AND owner_id = $2', [
      reservationId,
      userId,
    ]);
    if (!resOk) throw new AppError('Hóspede ou reserva não encontrado', 404);
  }
  try {
    await run(
      `INSERT INTO guest_blocks (guest_id, reason, reservation_id, blocked_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (guest_id) DO UPDATE
          SET reason         = EXCLUDED.reason,
              reservation_id = COALESCE(EXCLUDED.reservation_id, guest_blocks.reservation_id),
              updated_by     = EXCLUDED.updated_by,
              updated_at     = NOW()`,
      [guestId, reason, reservationId, userId],
    );
  } catch (err) {
    if ((err as { code?: string }).code === '23503') throw new AppError('Hóspede ou reserva não encontrado', 404);
    throw err;
  }
}

export async function unblock(ownerId: string, guestId: string) {
  const { rowCount } = await query(
    'DELETE FROM guest_blocks WHERE guest_id = $1 AND guest_id IN (SELECT id FROM guests WHERE owner_id = $2)',
    [guestId, ownerId],
  );
  if (!rowCount) throw new AppError('Este hóspede não está bloqueado', 404);
}
