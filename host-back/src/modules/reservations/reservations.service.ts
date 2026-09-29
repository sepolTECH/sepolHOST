import type { PoolClient } from 'pg';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import { absolutePath, detectFileType, removeFile, saveFile } from '../../utils/storage.js';
import { syncFromReservation } from '../dependents/dependents.service.js';
import { loadOnReservationCreated, resyncOnPropertyChange } from '../inventory/inventory.service.js';
import type { AttachmentCategory, ListQuery, ReservationInput } from './reservations.schema.js';

type Status = 'VAZIO' | 'HOSPEDADO' | 'CONCLUIDO';

interface ReservationRow {
  id: string;
  reservation_number: string;
  main_guest_id: string;
  property_name: string;
  guests_count: number;
  booked_at: string;
  check_in: string;
  check_out: string;
  status: Status;
  platform: ReservationInput['platform'] | null;
  payment_method: ReservationInput['paymentMethod'];
  amount_cents: number;
  commission_type: 'PERCENT' | 'VALUE';
  commission_rate: number | null;
  commission_cents: number;
  costs_cents: number;
  extensions_cents: number;
  extensions_commission_cents: number;
  final_check_out: string;
  created_at: Date;
  updated_at: Date;
  // joins
  main_guest_name: string;
  main_guest_document_type: 'CPF' | 'PASSAPORTE' | 'DNI' | 'CNPJ';
  main_guest_document_number: string;
  companions_count: number;
  attachments_count: number;
  extensions_count: number;
  created_by_name: string | null;
  updated_by_name: string | null;
}

interface CompanionRow {
  id: string;
  full_name: string;
  document: string | null;
  age_group: 'ADULT' | 'CHILD';
}

interface CostRow {
  id: string;
  description: string;
  amount_cents: number;
}

interface ExtensionRow {
  id: string;
  start_date: string;
  check_out: string;
  nights: number;
  channel: 'PLATAFORMA' | 'DIRETO';
  payment_method: ReservationInput['paymentMethod'];
  amount_cents: number;
  commission_cents: number;
}

interface AttachmentRow {
  id: string;
  category: AttachmentCategory;
  file_name: string;
  file_path: string;
  mime: string;
  size_bytes: number;
  created_at: Date;
  created_by_name: string | null;
}

const SELECT = `
  SELECT r.*,
         g.full_name       AS main_guest_name,
         g.document_type   AS main_guest_document_type,
         g.document_number AS main_guest_document_number,
         (SELECT COUNT(*)::int FROM reservation_guests rg WHERE rg.reservation_id = r.id) AS companions_count,
         (SELECT COUNT(*)::int FROM reservation_attachments ra WHERE ra.reservation_id = r.id) AS attachments_count,
         (SELECT COUNT(*)::int FROM reservation_extensions re WHERE re.reservation_id = r.id) AS extensions_count,
         cu.name AS created_by_name,
         uu.name AS updated_by_name
    FROM reservations r
    JOIN guests g ON g.id = r.main_guest_id
    LEFT JOIN users cu ON cu.id = r.created_by
    LEFT JOIN users uu ON uu.id = r.updated_by`;

const nightsBetween = (checkIn: string, checkOut: string) =>
  Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000);

function toReservation(r: ReservationRow) {
  return {
    id: r.id,
    reservationNumber: r.reservation_number,
    mainGuest: {
      id: r.main_guest_id,
      fullName: r.main_guest_name,
      documentType: r.main_guest_document_type,
      documentNumber: r.main_guest_document_number,
    },
    propertyName: r.property_name,
    guestsCount: r.guests_count,
    companionsCount: r.companions_count,
    bookedAt: r.booked_at,
    checkIn: r.check_in,
    checkOut: r.check_out, // check-out original
    finalCheckOut: r.final_check_out, // considerando as extensões
    nights: nightsBetween(r.check_in, r.check_out),
    totalNights: nightsBetween(r.check_in, r.final_check_out),
    status: r.status,
    platform: r.platform,
    paymentMethod: r.payment_method,
    amountCents: r.amount_cents,
    commissionType: r.commission_type,
    commissionRate: r.commission_rate,
    commissionCents: r.commission_cents,
    costsCents: r.costs_cents,
    extensionsCents: r.extensions_cents,
    extensionsCommissionCents: r.extensions_commission_cents,
    extensionsCount: r.extensions_count,
    // Valor bruto = reserva + extensões
    grossCents: r.amount_cents + r.extensions_cents,
    // Total geral = bruto − comissões (reserva + extensões pela plataforma) − custos e taxas
    netCents:
      r.amount_cents + r.extensions_cents - r.commission_cents - r.extensions_commission_cents - r.costs_cents,
    attachmentsCount: r.attachments_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdByName: r.created_by_name,
    updatedByName: r.updated_by_name,
  };
}

const toAttachment = (a: AttachmentRow) => ({
  id: a.id,
  category: a.category,
  fileName: a.file_name,
  mime: a.mime,
  sizeBytes: a.size_bytes,
  createdAt: a.created_at,
  createdByName: a.created_by_name,
});

function handleDbError(err: unknown): never {
  const code = (err as { code?: string }).code;
  if (code === '23505') throw new AppError('Já existe uma reserva com este número', 409);
  if (code === '23503') throw new AppError('Hóspede responsável não encontrado', 422);
  throw err;
}

export async function list(ownerId: string, { search, status, page, pageSize }: ListQuery) {
  // Sempre filtra pelo dono (cliente logado)
  const where: string[] = ['r.owner_id = $1'];
  const params: unknown[] = [ownerId];

  if (search) {
    params.push(`%${search}%`);
    const like = `$${params.length}`;
    where.push(`(r.reservation_number ILIKE ${like} OR r.property_name ILIKE ${like} OR g.full_name ILIKE ${like}
                 OR EXISTS (SELECT 1 FROM reservation_guests rg WHERE rg.reservation_id = r.id AND rg.full_name ILIKE ${like}))`);
  }
  if (status) {
    params.push(status);
    where.push(`r.status = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows: countRows } = await query<{ total: number; amount: number; commission: number; costs: number }>(
    `SELECT COUNT(*)::int AS total,
            COALESCE(SUM(r.amount_cents + r.extensions_cents), 0)::bigint AS amount,
            COALESCE(SUM(r.commission_cents + r.extensions_commission_cents), 0)::bigint AS commission,
            COALESCE(SUM(r.costs_cents), 0)::bigint AS costs
       FROM reservations r JOIN guests g ON g.id = r.main_guest_id ${whereSql}`,
    params,
  );

  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await query<ReservationRow>(
    `${SELECT} ${whereSql} ORDER BY r.check_in DESC, r.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const { total, amount, commission, costs } = countRows[0];
  return {
    data: rows.map(toReservation),
    total,
    page,
    pageSize,
    // somatórios de todas as reservas do filtro (não só da página)
    totals: {
      amountCents: amount,
      commissionCents: commission,
      costsCents: costs,
      netCents: amount - commission - costs,
    },
  };
}

// ---------------------------------------------------------------------------
// Histórico de hospedagens do hóspede
// ---------------------------------------------------------------------------

export type GuestRole = 'RESPONSAVEL' | 'ACOMPANHANTE';

/**
 * Todas as reservas ligadas ao hóspede, da mais recente para a mais antiga:
 * - como responsável (reservations.main_guest_id);
 * - como acompanhante, quando o documento informado no acompanhante bate com o do cadastro
 *   (comparado sem máscara; documentos com menos de 5 caracteres são ignorados).
 */
export async function listByGuest(ownerId: string, guestId: string, documentNumber: string | null) {
  const doc = documentNumber && documentNumber.length >= 5 ? documentNumber : null;
  const { rows } = await query<ReservationRow & { guest_role: GuestRole; review_average: number | null }>(
    `SELECT x.*, CASE WHEN x.main_guest_id = $1 THEN 'RESPONSAVEL' ELSE 'ACOMPANHANTE' END AS guest_role,
            -- média da avaliação interna (null = ainda não avaliada)
            (SELECT ROUND((rv.cleanliness_rating + rv.communication_rating + rv.rules_rating) / 3.0, 1)
               FROM reservation_reviews rv WHERE rv.reservation_id = x.id) AS review_average
       FROM (${SELECT}
              WHERE r.owner_id = $3
                AND (r.main_guest_id = $1
                 OR ($2::text IS NOT NULL AND EXISTS (
                       SELECT 1 FROM reservation_guests rg
                        WHERE rg.reservation_id = r.id
                          AND regexp_replace(UPPER(COALESCE(rg.document, '')), '[^0-9A-Z]', '', 'g') = $2)))
            ) x
      ORDER BY x.check_in DESC, x.created_at DESC`,
    [guestId, doc, ownerId],
  );

  const data = rows.map((r) => ({ ...toReservation(r), guestRole: r.guest_role, reviewAverage: r.review_average }));
  // "Hoje" no fuso do Brasil (o servidor/Docker costuma rodar em UTC)
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

  // Estadias que já começaram (as futuras entram na contagem, mas não em noites/valor)
  const started = data.filter((r) => r.checkIn <= today);
  const asMain = started.filter((r) => r.guestRole === 'RESPONSAVEL');
  const upcoming = data.filter((r) => r.checkIn > today);

  return {
    data,
    summary: {
      totalReservations: data.length,
      totalStays: started.length,
      asMainCount: data.filter((r) => r.guestRole === 'RESPONSAVEL').length,
      asCompanionCount: data.filter((r) => r.guestRole === 'ACOMPANHANTE').length,
      totalNights: started.reduce((sum, r) => sum + r.totalNights, 0),
      // Valor bruto só das reservas em que ele é o responsável (quem paga)
      grossCents: asMain.reduce((sum, r) => sum + r.grossCents, 0),
      firstCheckIn: started.length ? started[started.length - 1].checkIn : null,
      lastCheckIn: started.length ? started[0].checkIn : null,
      // Próxima reserva futura (a de check-in mais próximo)
      nextCheckIn: upcoming.length ? upcoming[upcoming.length - 1].checkIn : null,
      // Média das avaliações internas das reservas em que ele foi o responsável
      averageRating: (() => {
        const rated = data.filter((r) => r.guestRole === 'RESPONSAVEL' && r.reviewAverage !== null);
        if (!rated.length) return null;
        return Math.round((rated.reduce((sum, r) => sum + r.reviewAverage!, 0) / rated.length) * 10) / 10;
      })(),
    },
  };
}

export async function getById(ownerId: string, id: string, client?: PoolClient) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run<ReservationRow>(`${SELECT} WHERE r.id = $1 AND r.owner_id = $2`, [id, ownerId]);
  if (!rows[0]) throw new AppError('Reserva não encontrada', 404);
  const [{ rows: companions }, { rows: costs }, { rows: extensions }, { rows: attachments }] = await Promise.all([
    run<CompanionRow>(
      'SELECT id, full_name, document, age_group FROM reservation_guests WHERE reservation_id = $1 ORDER BY position',
      [id],
    ),
    run<CostRow>(
      'SELECT id, description, amount_cents FROM reservation_costs WHERE reservation_id = $1 ORDER BY position',
      [id],
    ),
    run<ExtensionRow>(
      `SELECT id, start_date, check_out, nights, channel, payment_method, amount_cents, commission_cents
         FROM reservation_extensions WHERE reservation_id = $1 ORDER BY position`,
      [id],
    ),
    run<AttachmentRow>(
      `SELECT a.*, u.name AS created_by_name
         FROM reservation_attachments a LEFT JOIN users u ON u.id = a.created_by
        WHERE a.reservation_id = $1 ORDER BY a.created_at`,
      [id],
    ),
  ]);
  return {
    ...toReservation(rows[0]),
    companions: companions.map((c) => ({ id: c.id, fullName: c.full_name, document: c.document, ageGroup: c.age_group })),
    costs: costs.map((c) => ({ id: c.id, description: c.description, amountCents: c.amount_cents })),
    extensions: extensions.map((e) => ({
      id: e.id,
      startDate: e.start_date,
      checkOut: e.check_out,
      nights: e.nights,
      channel: e.channel,
      paymentMethod: e.payment_method,
      amountCents: e.amount_cents,
      commissionCents: e.commission_cents,
    })),
    attachments: attachments.map(toAttachment),
  };
}

async function saveChildren(client: PoolClient, reservationId: string, input: ReservationInput) {
  await client.query('DELETE FROM reservation_guests WHERE reservation_id = $1', [reservationId]);
  for (const [i, c] of input.companions.entries()) {
    await client.query(
      `INSERT INTO reservation_guests (reservation_id, position, full_name, document, age_group)
       VALUES ($1, $2, $3, $4, $5)`,
      [reservationId, i, c.fullName, c.document, c.ageGroup],
    );
  }
  // Acompanhantes ficam salvos como dependentes do hóspede responsável
  await syncFromReservation(client, input.mainGuestId, reservationId, input.companions);
  await client.query('DELETE FROM reservation_costs WHERE reservation_id = $1', [reservationId]);
  for (const [i, c] of input.costs.entries()) {
    await client.query(
      'INSERT INTO reservation_costs (reservation_id, position, description, amount_cents) VALUES ($1, $2, $3, $4)',
      [reservationId, i, c.description, c.amountCents],
    );
  }
  await client.query('DELETE FROM reservation_extensions WHERE reservation_id = $1', [reservationId]);
  for (const [i, e] of input.extensions.entries()) {
    await client.query(
      `INSERT INTO reservation_extensions (reservation_id, position, start_date, check_out, nights, channel,
                                           payment_method, amount_cents, commission_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [reservationId, i, e.startDate, e.checkOut, e.nights, e.channel, e.paymentMethod, e.amountCents, e.commissionCents],
    );
  }
}

/** Colunas gravadas a partir do formulário, na ordem dos parâmetros. */
const FIELDS: [column: string, value: (r: ReservationInput) => unknown][] = [
  ['reservation_number', (r) => r.reservationNumber],
  ['main_guest_id', (r) => r.mainGuestId],
  ['property_name', (r) => r.propertyName],
  ['guests_count', (r) => r.guestsCount],
  ['booked_at', (r) => r.bookedAt],
  ['check_in', (r) => r.checkIn],
  ['check_out', (r) => r.checkOut],
  ['status', (r) => r.status],
  ['platform', (r) => r.platform],
  ['payment_method', (r) => r.paymentMethod],
  ['amount_cents', (r) => r.amountCents],
  ['commission_type', (r) => r.commissionType],
  ['commission_rate', (r) => r.commissionRate],
  ['commission_cents', (r) => r.commissionCents],
  ['costs_cents', (r) => r.costsCents],
  ['extensions_cents', (r) => r.extensionsCents],
  ['extensions_commission_cents', (r) => r.extensionsCommissionCents],
  ['final_check_out', (r) => r.finalCheckOut],
];

async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    handleDbError(err);
  } finally {
    client.release();
  }
}

export function create(input: ReservationInput, userId: string) {
  return inTransaction(async (client) => {
    const values = FIELDS.map(([, v]) => v(input));
    const userParam = `$${values.length + 1}`;
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO reservations (${FIELDS.map(([c]) => c).join(', ')}, owner_id, created_by, updated_by)
       VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')}, ${userParam}, ${userParam}, ${userParam})
       RETURNING id`,
      [...values, userId],
    );
    await saveChildren(client, rows[0].id, input);
    // Copia o inventário do imóvel para a reserva (pode ser ajustado só nela)
    await loadOnReservationCreated(client, userId, rows[0].id);
    return getById(userId, rows[0].id, client);
  });
}

export function update(id: string, input: ReservationInput, userId: string) {
  return inTransaction(async (client) => {
    const values = FIELDS.map(([, v]) => v(input));
    const sets = FIELDS.map(([c], i) => `${c} = $${i + 2}`);
    const { rows: previous } = await client.query<{ property_name: string }>(
      'SELECT property_name FROM reservations WHERE id = $1 AND owner_id = $2',
      [id, userId],
    );
    const { rowCount } = await client.query(
      `UPDATE reservations
          SET ${sets.join(', ')}, updated_by = $${values.length + 2}, updated_at = NOW()
        WHERE id = $1 AND owner_id = $${values.length + 2}`,
      [id, ...values, userId],
    );
    if (!rowCount) throw new AppError('Reserva não encontrada', 404);
    await saveChildren(client, id, input);
    // Trocou de imóvel e a vistoria ainda não começou: passa a usar o inventário do novo imóvel
    if (previous[0]) await resyncOnPropertyChange(client, userId, id, previous[0].property_name);
    return getById(userId, id, client);
  });
}

// ---------------------------------------------------------------------------
// Anexos (documentos e fotos): arquivo em disco, metadados no banco
// ---------------------------------------------------------------------------

const MAX_ATTACHMENTS = 30;

async function touch(reservationId: string, userId: string) {
  await query('UPDATE reservations SET updated_by = $2, updated_at = NOW() WHERE id = $1 AND owner_id = $2', [
    reservationId,
    userId,
  ]);
}

export async function addAttachment(
  reservationId: string,
  category: AttachmentCategory,
  fileName: string,
  data: Buffer,
  userId: string,
) {
  const type = detectFileType(data);
  if (!type) throw new AppError('Envie uma imagem JPG, PNG ou WEBP, ou um PDF', 415);

  const { rows } = await query<{ n: number }>(
    `SELECT (SELECT COUNT(*)::int FROM reservation_attachments WHERE reservation_id = r.id) AS n
       FROM reservations r WHERE r.id = $1 AND r.owner_id = $2`,
    [reservationId, userId],
  );
  if (!rows[0]) throw new AppError('Reserva não encontrada', 404);
  if (rows[0].n >= MAX_ATTACHMENTS) throw new AppError(`Limite de ${MAX_ATTACHMENTS} anexos por reserva`, 422);

  const relPath = await saveFile(`reservations/${reservationId}`, type.ext, data);
  try {
    const { rows: inserted } = await query<{ id: string }>(
      `INSERT INTO reservation_attachments (reservation_id, category, file_name, file_path, mime, size_bytes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [reservationId, category, fileName.slice(0, 200), relPath, type.mime, data.length, userId],
    );
    await touch(reservationId, userId);
    const { rows: att } = await query<AttachmentRow>(
      `SELECT a.*, u.name AS created_by_name FROM reservation_attachments a
         LEFT JOIN users u ON u.id = a.created_by WHERE a.id = $1`,
      [inserted[0].id],
    );
    return toAttachment(att[0]);
  } catch (err) {
    await removeFile(relPath);
    throw err;
  }
}

async function findAttachment(ownerId: string, reservationId: string, attachmentId: string) {
  const { rows } = await query<{ file_path: string; mime: string; file_name: string }>(
    `SELECT a.file_path, a.mime, a.file_name
       FROM reservation_attachments a
       JOIN reservations r ON r.id = a.reservation_id
      WHERE a.id = $1 AND a.reservation_id = $2 AND r.owner_id = $3`,
    [attachmentId, reservationId, ownerId],
  );
  if (!rows[0]) throw new AppError('Anexo não encontrado', 404);
  return rows[0];
}

export async function getAttachmentFile(ownerId: string, reservationId: string, attachmentId: string) {
  const a = await findAttachment(ownerId, reservationId, attachmentId);
  return { path: absolutePath(a.file_path), mime: a.mime, fileName: a.file_name };
}

export async function removeAttachment(reservationId: string, attachmentId: string, userId: string) {
  const a = await findAttachment(userId, reservationId, attachmentId);
  await query('DELETE FROM reservation_attachments WHERE id = $1', [attachmentId]);
  await touch(reservationId, userId);
  await removeFile(a.file_path);
}
