import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Cadastro de associados (funcionários/diaristas) pelo cliente.
 * `ownerId` é sempre o cliente logado: ele só enxerga e altera os próprios associados.
 */

// Sem letras/números que se confundem (0/O, 1/l/I) — a senha é lida e digitada por pessoas
const LETTERS = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';

/** Senha simples de 8 caracteres (5 letras + 3 números, embaralhados), fácil de ditar por telefone. */
export function generatePassword() {
  const chars = [
    ...Array.from({ length: 5 }, () => LETTERS[randomInt(LETTERS.length)]),
    ...Array.from({ length: 3 }, () => DIGITS[randomInt(DIGITS.length)]),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

interface Row {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  released_count: number;
}

const toAssociate = (r: Row) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  isActive: r.is_active,
  lastLoginAt: r.last_login_at,
  createdAt: r.created_at,
  releasedCount: r.released_count,
});

const SELECT = `
  SELECT u.id, u.name, u.email, u.is_active, u.last_login_at, u.created_at,
         (SELECT COUNT(*) FROM associate_reservation_access a WHERE a.associate_id = u.id)::int AS released_count
    FROM users u`;

export async function list(ownerId: string) {
  const { rows } = await query<Row>(
    `${SELECT} WHERE u.owner_id = $1 AND u.role = 'associate' ORDER BY LOWER(u.name), u.created_at`,
    [ownerId],
  );
  return rows.map(toAssociate);
}

async function getOne(ownerId: string, id: string) {
  const { rows } = await query<Row>(`${SELECT} WHERE u.id = $1 AND u.owner_id = $2 AND u.role = 'associate'`, [
    id,
    ownerId,
  ]);
  if (!rows[0]) throw new AppError('Associado não encontrado', 404);
  return toAssociate(rows[0]);
}

/** Cria o associado com uma senha gerada. A senha só é devolvida aqui (e em resetPassword). */
export async function create(ownerId: string, input: { name: string; email: string }) {
  const { rows: existing } = await query<{ id: string }>(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [input.email],
  );
  if (existing[0]) throw new AppError('Este e-mail já está cadastrado', 409);

  const password = generatePassword();
  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role, owner_id)
       VALUES ($1, LOWER($2), $3, 'associate', $4)
       RETURNING id`,
      [input.name, input.email, hash, ownerId],
    );
    return { associate: await getOne(ownerId, rows[0].id), password };
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new AppError('Este e-mail já está cadastrado', 409);
    throw err;
  }
}

export async function update(ownerId: string, id: string, input: { name?: string; isActive?: boolean }) {
  const { rowCount } = await query(
    `UPDATE users
        SET name = COALESCE($3, name),
            is_active = COALESCE($4, is_active),
            updated_at = NOW()
      WHERE id = $1 AND owner_id = $2 AND role = 'associate'`,
    [id, ownerId, input.name ?? null, input.isActive ?? null],
  );
  if (!rowCount) throw new AppError('Associado não encontrado', 404);
  return getOne(ownerId, id);
}

/** Gera uma nova senha (a anterior deixa de valer). */
export async function resetPassword(ownerId: string, id: string) {
  const password = generatePassword();
  const hash = await bcrypt.hash(password, 12);
  const { rowCount } = await query(
    `UPDATE users SET password_hash = $3, updated_at = NOW()
      WHERE id = $1 AND owner_id = $2 AND role = 'associate'`,
    [id, ownerId, hash],
  );
  if (!rowCount) throw new AppError('Associado não encontrado', 404);
  return { associate: await getOne(ownerId, id), password };
}

export async function remove(ownerId: string, id: string) {
  const { rowCount } = await query(`DELETE FROM users WHERE id = $1 AND owner_id = $2 AND role = 'associate'`, [
    id,
    ownerId,
  ]);
  if (!rowCount) throw new AppError('Associado não encontrado', 404);
}

// ---------------------------------------------------------------------------
// Liberação de reservas
// ---------------------------------------------------------------------------

/** IDs das reservas liberadas para o associado. */
export async function releasedReservationIds(ownerId: string, associateId: string) {
  await getOne(ownerId, associateId);
  const { rows } = await query<{ reservation_id: string }>(
    `SELECT a.reservation_id
       FROM associate_reservation_access a
       JOIN reservations r ON r.id = a.reservation_id AND r.owner_id = $2
      WHERE a.associate_id = $1`,
    [associateId, ownerId],
  );
  return rows.map((r) => r.reservation_id);
}

/** Associados que enxergam a reserva. */
export async function reservationAssociateIds(ownerId: string, reservationId: string) {
  const { rows: res } = await query('SELECT 1 FROM reservations WHERE id = $1 AND owner_id = $2', [
    reservationId,
    ownerId,
  ]);
  if (!res[0]) throw new AppError('Reserva não encontrada', 404);
  const { rows } = await query<{ associate_id: string }>(
    `SELECT a.associate_id
       FROM associate_reservation_access a
       JOIN users u ON u.id = a.associate_id AND u.owner_id = $2
      WHERE a.reservation_id = $1`,
    [reservationId, ownerId],
  );
  return rows.map((r) => r.associate_id);
}

/** Substitui a lista de associados que enxergam a reserva. */
export async function setReservationAssociates(
  ownerId: string,
  reservationId: string,
  associateIds: string[],
  actorId: string,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: res } = await client.query('SELECT 1 FROM reservations WHERE id = $1 AND owner_id = $2 FOR UPDATE', [
      reservationId,
      ownerId,
    ]);
    if (!res[0]) throw new AppError('Reserva não encontrada', 404);

    // Só entram associados que realmente são deste cliente
    const { rows: valid } = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND owner_id = $2 AND role = 'associate'`,
      [associateIds, ownerId],
    );
    if (valid.length !== new Set(associateIds).size) throw new AppError('Associado não encontrado', 404);

    await client.query('DELETE FROM associate_reservation_access WHERE reservation_id = $1', [reservationId]);
    if (valid.length) {
      await client.query(
        `INSERT INTO associate_reservation_access (associate_id, reservation_id, granted_by)
         SELECT UNNEST($1::uuid[]), $2, $3`,
        [valid.map((v) => v.id), reservationId, actorId],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return reservationAssociateIds(ownerId, reservationId);
}

/** Libera / retira a liberação de várias reservas de uma vez para um associado. */
export async function bulkAccess(
  ownerId: string,
  input: { associateId: string; reservationIds: string[]; granted: boolean },
  actorId: string,
) {
  await getOne(ownerId, input.associateId);
  // Ignora reservas que não são do cliente
  const { rows } = await query<{ id: string }>(
    'SELECT id FROM reservations WHERE id = ANY($1::uuid[]) AND owner_id = $2',
    [input.reservationIds, ownerId],
  );
  const ids = rows.map((r) => r.id);
  if (!ids.length) throw new AppError('Reserva não encontrada', 404);

  if (input.granted) {
    await query(
      `INSERT INTO associate_reservation_access (associate_id, reservation_id, granted_by)
       SELECT $1, UNNEST($2::uuid[]), $3
       ON CONFLICT DO NOTHING`,
      [input.associateId, ids, actorId],
    );
  } else {
    await query('DELETE FROM associate_reservation_access WHERE associate_id = $1 AND reservation_id = ANY($2::uuid[])', [
      input.associateId,
      ids,
    ]);
  }
  return { updated: ids.length };
}
