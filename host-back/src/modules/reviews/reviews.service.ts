import { pool, query } from '../../db/pool.js';
import { block, BLOCK_COLUMNS, toBlocked, type BlockColumnsRow } from '../blocklist/blocklist.service.js';
import { AppError } from '../../utils/AppError.js';
import type { ListQuery, ReviewInput } from './reviews.schema.js';

interface Row extends BlockColumnsRow {
  id: string;
  reservation_number: string;
  property_name: string;
  check_in: string;
  final_check_out: string;
  status: 'VAZIO' | 'HOSPEDADO' | 'CONCLUIDO';
  platform: string | null;
  guests_count: number;
  guest_id: string;
  guest_name: string;
  guest_document_type: 'CPF' | 'PASSAPORTE' | 'DNI' | 'CNPJ';
  guest_document_number: string;
  guest_avg: number | null;
  guest_reviews: number;
  // avaliação (nulos quando a reserva ainda não foi avaliada)
  review_id: string | null;
  cleanliness_rating: number | null;
  communication_rating: number | null;
  rules_rating: number | null;
  notes: string | null;
  review_created_at: Date | null;
  review_updated_at: Date | null;
  review_created_by_name: string | null;
  review_updated_by_name: string | null;
}

const SELECT = `
  SELECT r.id, r.reservation_number, r.property_name, r.check_in, r.final_check_out, r.status, r.platform, r.guests_count,
         g.id AS guest_id, g.full_name AS guest_name,
         g.document_type AS guest_document_type, g.document_number AS guest_document_number,
         gs.avg AS guest_avg, gs.total AS guest_reviews,
         rv.id AS review_id, rv.cleanliness_rating, rv.communication_rating, rv.rules_rating, rv.notes,
         rv.created_at AS review_created_at, rv.updated_at AS review_updated_at,
         cu.name AS review_created_by_name, uu.name AS review_updated_by_name,
         ${BLOCK_COLUMNS}
    FROM reservations r
    JOIN guests g ON g.id = r.main_guest_id
    LEFT JOIN guest_blocks gb ON gb.guest_id = g.id
    LEFT JOIN reservation_reviews rv ON rv.reservation_id = r.id
    LEFT JOIN users cu ON cu.id = rv.created_by
    LEFT JOIN users uu ON uu.id = rv.updated_by
    -- Média geral do hóspede em todas as reservas avaliadas em que ele foi o responsável
    LEFT JOIN LATERAL (
      SELECT ROUND(AVG((x.cleanliness_rating + x.communication_rating + x.rules_rating) / 3.0), 1) AS avg,
             COUNT(*)::int AS total
        FROM reservation_reviews x
        JOIN reservations rx ON rx.id = x.reservation_id
       WHERE rx.main_guest_id = g.id
    ) gs ON TRUE`;

const nightsBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Média das 3 notas com 1 casa decimal. */
export const averageOf = (a: number, b: number, c: number) => Math.round(((a + b + c) / 3) * 10) / 10;

function toItem(r: Row) {
  return {
    reservation: {
      id: r.id,
      reservationNumber: r.reservation_number,
      propertyName: r.property_name,
      checkIn: r.check_in,
      finalCheckOut: r.final_check_out,
      totalNights: nightsBetween(r.check_in, r.final_check_out),
      status: r.status,
      platform: r.platform,
      guestsCount: r.guests_count,
    },
    guest: {
      id: r.guest_id,
      fullName: r.guest_name,
      documentType: r.guest_document_type,
      documentNumber: r.guest_document_number,
      // histórico do hóspede (todas as reservas dele avaliadas)
      averageRating: r.guest_avg,
      reviewsCount: r.guest_reviews,
      // bloqueio (null = não bloqueado)
      blocked: toBlocked(r),
    },
    review:
      r.review_id && r.cleanliness_rating && r.communication_rating && r.rules_rating
        ? {
            id: r.review_id,
            cleanlinessRating: r.cleanliness_rating,
            communicationRating: r.communication_rating,
            rulesRating: r.rules_rating,
            average: averageOf(r.cleanliness_rating, r.communication_rating, r.rules_rating),
            notes: r.notes,
            createdAt: r.review_created_at,
            updatedAt: r.review_updated_at,
            createdByName: r.review_created_by_name,
            updatedByName: r.review_updated_by_name,
          }
        : null,
  };
}

export async function list(ownerId: string, { search, reviewed, page, pageSize }: ListQuery) {
  const where: string[] = ['r.owner_id = $1'];
  const params: unknown[] = [ownerId];

  if (search) {
    params.push(`%${search}%`);
    const like = `$${params.length}`;
    where.push(`(r.reservation_number ILIKE ${like} OR r.property_name ILIKE ${like} OR g.full_name ILIKE ${like})`);
  }
  const filterSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // Contadores respeitam a busca, mas não o filtro de avaliada/pendente (alimentam as abas)
  const { rows: counts } = await query<{ total: number; reviewed: number; avg: number | null }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(rv.id)::int AS reviewed,
            ROUND(AVG((rv.cleanliness_rating + rv.communication_rating + rv.rules_rating) / 3.0), 1) AS avg
       FROM reservations r
       JOIN guests g ON g.id = r.main_guest_id
       LEFT JOIN reservation_reviews rv ON rv.reservation_id = r.id
       ${filterSql}`,
    params,
  );

  if (reviewed === 'PENDENTE') where.push('rv.id IS NULL');
  if (reviewed === 'AVALIADA') where.push('rv.id IS NOT NULL');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows: totalRows } = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
       FROM reservations r
       JOIN guests g ON g.id = r.main_guest_id
       LEFT JOIN reservation_reviews rv ON rv.reservation_id = r.id
       ${whereSql}`,
    params,
  );

  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await query<Row>(
    `${SELECT} ${whereSql}
      ORDER BY r.check_in DESC, r.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const { total, reviewed: reviewedCount, avg } = counts[0];
  return {
    data: rows.map(toItem),
    total: totalRows[0].total,
    page,
    pageSize,
    counts: { all: total, reviewed: reviewedCount, pending: total - reviewedCount, averageRating: avg },
  };
}

export async function getByReservation(ownerId: string, reservationId: string) {
  const { rows } = await query<Row>(`${SELECT} WHERE r.id = $1 AND r.owner_id = $2`, [reservationId, ownerId]);
  if (!rows[0]) throw new AppError('Reserva não encontrada', 404);
  return toItem(rows[0]);
}

export async function save(reservationId: string, input: ReviewInput, userId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ main_guest_id: string }>(
      'SELECT main_guest_id FROM reservations WHERE id = $1 AND owner_id = $2',
      [reservationId, userId],
    );
    if (!rows[0]) throw new AppError('Reserva não encontrada', 404);
    await client.query(
      `INSERT INTO reservation_reviews
              (reservation_id, cleanliness_rating, communication_rating, rules_rating, notes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (reservation_id) DO UPDATE
          SET cleanliness_rating   = EXCLUDED.cleanliness_rating,
              communication_rating = EXCLUDED.communication_rating,
              rules_rating         = EXCLUDED.rules_rating,
              notes                = EXCLUDED.notes,
              updated_by           = EXCLUDED.updated_by,
              updated_at           = NOW()`,
      [reservationId, input.cleanlinessRating, input.communicationRating, input.rulesRating, input.notes, userId],
    );
    // Bloqueio: bloqueia o hóspede responsável a partir desta hospedagem
    if (input.blockGuest && input.blockReason) {
      await block(rows[0].main_guest_id, input.blockReason, reservationId, userId, client);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if ((err as { code?: string }).code === '23503') throw new AppError('Reserva não encontrada', 404);
    throw err;
  } finally {
    client.release();
  }
  return getByReservation(userId, reservationId);
}

export async function remove(ownerId: string, reservationId: string) {
  const { rowCount } = await query(
    `DELETE FROM reservation_reviews
      WHERE reservation_id = $1 AND reservation_id IN (SELECT id FROM reservations WHERE owner_id = $2)`,
    [reservationId, ownerId],
  );
  if (!rowCount) throw new AppError('Esta reserva não tem avaliação', 404);
}
