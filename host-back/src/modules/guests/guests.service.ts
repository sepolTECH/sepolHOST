import { query } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import { alnum, normalizeDocument, type DocumentType } from '../../utils/documents.js';
import { absolutePath, detectFileType, removeFile, saveFile } from '../../utils/storage.js';
import { BLOCK_COLUMNS, toBlocked, type BlockColumnsRow } from '../blocklist/blocklist.service.js';
import type { GuestInput, ListQuery } from './guests.schema.js';

interface GuestRow extends BlockColumnsRow {
  id: string;
  full_name: string;
  person_type: 'PF' | 'PJ';
  is_foreign: boolean;
  nationality: string;
  document_type: DocumentType;
  document_number: string;
  rg: string | null;
  email: string | null;
  phone: string;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_district: string | null;
  address_city: string | null;
  address_state: string | null;
  address_country: string | null;
  notes: string | null;
  document_photo_path: string | null;
  document_photo_mime: string | null;
  created_at: Date;
  updated_at: Date;
  created_by_name: string | null;
  updated_by_name: string | null;
  rating_avg: number | null;
  rating_count: number;
}

const toGuest = (r: GuestRow) => ({
  id: r.id,
  fullName: r.full_name,
  personType: r.person_type,
  isForeign: r.is_foreign,
  nationality: r.nationality,
  documentType: r.document_type,
  documentNumber: r.document_number,
  rg: r.rg,
  email: r.email,
  phone: r.phone,
  addressZip: r.address_zip,
  addressStreet: r.address_street,
  addressNumber: r.address_number,
  addressComplement: r.address_complement,
  addressDistrict: r.address_district,
  addressCity: r.address_city,
  addressState: r.address_state,
  addressCountry: r.address_country,
  notes: r.notes,
  // O arquivo em si é baixado por GET /guests/:id/document-photo (exige login)
  hasDocumentPhoto: !!r.document_photo_path,
  documentPhotoMime: r.document_photo_mime,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  createdByName: r.created_by_name,
  updatedByName: r.updated_by_name,
  // Média das avaliações internas das reservas em que ele foi o responsável
  averageRating: r.rating_avg,
  reviewsCount: r.rating_count,
  // Bloqueio (null = não bloqueado)
  blocked: toBlocked(r),
});

const SELECT = `
  SELECT g.*, cu.name AS created_by_name, uu.name AS updated_by_name,
         rt.avg AS rating_avg, rt.total AS rating_count,
         ${BLOCK_COLUMNS}
    FROM guests g
    LEFT JOIN guest_blocks gb ON gb.guest_id = g.id
    LEFT JOIN users cu ON cu.id = g.created_by
    LEFT JOIN users uu ON uu.id = g.updated_by
    LEFT JOIN LATERAL (
      SELECT ROUND(AVG((rv.cleanliness_rating + rv.communication_rating + rv.rules_rating) / 3.0), 1) AS avg,
             COUNT(*)::int AS total
        FROM reservation_reviews rv
        JOIN reservations r ON r.id = rv.reservation_id
       WHERE r.main_guest_id = g.id
    ) rt ON TRUE`;

/** Colunas gravadas a partir do formulário, na ordem dos parâmetros. */
const FIELDS: [column: string, value: (g: GuestInput) => unknown][] = [
  ['full_name', (g) => g.fullName],
  ['person_type', (g) => g.personType],
  ['is_foreign', (g) => g.isForeign],
  ['nationality', (g) => g.nationality],
  ['document_type', (g) => g.documentType],
  ['document_number', (g) => g.documentNumber],
  ['rg', (g) => g.rg],
  ['email', (g) => g.email],
  ['phone', (g) => g.phone],
  ['address_zip', (g) => g.addressZip],
  ['address_street', (g) => g.addressStreet],
  ['address_number', (g) => g.addressNumber],
  ['address_complement', (g) => g.addressComplement],
  ['address_district', (g) => g.addressDistrict],
  ['address_city', (g) => g.addressCity],
  ['address_state', (g) => g.addressState],
  ['address_country', (g) => g.addressCountry],
  ['notes', (g) => g.notes],
];

function handleUnique(err: unknown): never {
  if ((err as { code?: string }).code === '23505') {
    throw new AppError('Já existe um hóspede cadastrado com este documento', 409);
  }
  throw err;
}

export async function list(ownerId: string, { search, personType, page, pageSize }: ListQuery) {
  // Sempre filtra pelo dono (cliente logado)
  const where: string[] = ['g.owner_id = $1'];
  const params: unknown[] = [ownerId];

  if (search) {
    params.push(`%${search}%`);
    const like = `$${params.length}`;
    // Busca também pelo documento/telefone/RG sem máscara
    const digits = search.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    params.push(digits ? `%${digits}%` : '%__nenhum__%');
    const raw = `$${params.length}`;
    where.push(`(g.full_name ILIKE ${like} OR g.nationality ILIKE ${like}
                 OR g.email ILIKE ${like} OR g.document_number LIKE ${raw} OR g.phone LIKE ${raw} OR g.rg LIKE ${raw})`);
  }
  if (personType) {
    params.push(personType);
    where.push(`g.person_type = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows: countRows } = await query<{ total: string }>(`SELECT COUNT(*) AS total FROM guests g ${whereSql}`, params);

  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await query<GuestRow>(
    `${SELECT} ${whereSql} ORDER BY g.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { data: rows.map(toGuest), total: Number(countRows[0].total), page, pageSize };
}

export async function getById(ownerId: string, id: string) {
  const { rows } = await query<GuestRow>(`${SELECT} WHERE g.id = $1 AND g.owner_id = $2`, [id, ownerId]);
  if (!rows[0]) throw new AppError('Hóspede não encontrado', 404);
  return toGuest(rows[0]);
}

/** Retorna o hóspede com este documento, ou null se não houver cadastro. */
export async function findByDocument(ownerId: string, documentType: DocumentType, documentNumber: string) {
  const { rows } = await query<GuestRow>(
    `${SELECT} WHERE g.owner_id = $3 AND g.document_type = $1 AND g.document_number = $2 LIMIT 1`, [
    documentType,
    normalizeDocument(documentType, documentNumber),
    ownerId,
  ]);
  return rows[0] ? toGuest(rows[0]) : null;
}

/**
 * Procura o hóspede por um documento digitado livremente (sem saber o tipo),
 * comparando só letras/números. Retorna null se não houver ou se tiver menos de 5 caracteres.
 */
export async function findByDocumentKey(ownerId: string, document: string) {
  const key = alnum(document);
  if (key.length < 5) return null;
  const { rows } = await query<GuestRow>(`${SELECT} WHERE g.owner_id = $2 AND g.document_number = $1 ORDER BY g.created_at LIMIT 1`, [key, ownerId]);
  return rows[0] ? toGuest(rows[0]) : null;
}

export async function create(input: GuestInput, userId: string) {
  const columns = FIELDS.map(([c]) => c);
  const values = FIELDS.map(([, v]) => v(input));
  const placeholders = values.map((_, i) => `$${i + 1}`);
  const userParam = `$${values.length + 1}`;
  try {
    // Cada usuário é um cliente: o dono do registro é o próprio usuário logado
    const { rows } = await query<{ id: string }>(
      `INSERT INTO guests (${columns.join(', ')}, owner_id, created_by, updated_by)
       VALUES (${placeholders.join(', ')}, ${userParam}, ${userParam}, ${userParam})
       RETURNING id`,
      [...values, userId],
    );
    return getById(userId, rows[0].id);
  } catch (err) {
    handleUnique(err);
  }
}

export async function update(id: string, input: GuestInput, userId: string) {
  const values = FIELDS.map(([, v]) => v(input));
  const sets = FIELDS.map(([c], i) => `${c} = $${i + 2}`);
  try {
    const { rowCount } = await query(
      `UPDATE guests
          SET ${sets.join(', ')}, updated_by = $${values.length + 2}, updated_at = NOW()
        WHERE id = $1 AND owner_id = $${values.length + 2}`,
      [id, ...values, userId],
    );
    if (!rowCount) throw new AppError('Hóspede não encontrado', 404);
    return getById(userId, id);
  } catch (err) {
    handleUnique(err);
  }
}

// ---------------------------------------------------------------------------
// Foto do documento (arquivo em disco, caminho no banco)
// ---------------------------------------------------------------------------

async function currentPhotoPath(ownerId: string, id: string) {
  const { rows } = await query<{ document_photo_path: string | null }>(
    'SELECT document_photo_path FROM guests WHERE id = $1 AND owner_id = $2',
    [id, ownerId],
  );
  if (!rows[0]) throw new AppError('Hóspede não encontrado', 404);
  return rows[0].document_photo_path;
}

export async function setDocumentPhoto(id: string, data: Buffer, userId: string) {
  const type = detectFileType(data);
  if (!type) throw new AppError('Envie uma imagem JPG, PNG ou WEBP, ou um PDF', 415);

  const oldPath = await currentPhotoPath(userId, id);
  const relPath = await saveFile(`guests/${id}`, type.ext, data);
  try {
    await query(
      `UPDATE guests SET document_photo_path = $2, document_photo_mime = $3, updated_by = $4, updated_at = NOW()
        WHERE id = $1 AND owner_id = $4`,
      [id, relPath, type.mime, userId],
    );
  } catch (err) {
    await removeFile(relPath);
    throw err;
  }
  await removeFile(oldPath);
  return getById(userId, id);
}

export async function removeDocumentPhoto(id: string, userId: string) {
  const oldPath = await currentPhotoPath(userId, id);
  if (oldPath) {
    await query(
      `UPDATE guests SET document_photo_path = NULL, document_photo_mime = NULL, updated_by = $2, updated_at = NOW()
        WHERE id = $1 AND owner_id = $2`,
      [id, userId],
    );
    await removeFile(oldPath);
  }
  return getById(userId, id);
}

export async function getDocumentPhoto(ownerId: string, id: string) {
  const { rows } = await query<{ document_photo_path: string | null; document_photo_mime: string | null }>(
    'SELECT document_photo_path, document_photo_mime FROM guests WHERE id = $1 AND owner_id = $2',
    [id, ownerId],
  );
  if (!rows[0]) throw new AppError('Hóspede não encontrado', 404);
  if (!rows[0].document_photo_path) throw new AppError('Hóspede sem foto do documento', 404);
  return { path: absolutePath(rows[0].document_photo_path), mime: rows[0].document_photo_mime ?? 'application/octet-stream' };
}
