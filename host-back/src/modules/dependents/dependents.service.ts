import type { PoolClient } from 'pg';
import { query } from '../../db/pool.js';
import { alnum } from '../../utils/documents.js';
import { BLOCK_COLUMNS, toBlocked, type BlockColumnsRow } from '../blocklist/blocklist.service.js';

type DocumentType = 'CPF' | 'PASSAPORTE' | 'DNI' | 'CNPJ';
type AgeGroup = 'ADULT' | 'CHILD';

/** Mesma regra de dependent_doc_key() no banco: só letras/números, mínimo de 5. */
export const dependentDocKey = (doc: string | null | undefined) => {
  const key = alnum(doc ?? '');
  return key.length >= 5 ? key : null;
};

// ---------------------------------------------------------------------------
// Gravação automática (chamada ao salvar a reserva, dentro da mesma transação)
// ---------------------------------------------------------------------------

/**
 * Guarda os acompanhantes da reserva como dependentes do hóspede responsável.
 * Se o dependente já existir (mesmo documento, ou mesmo nome quando não há documento),
 * atualiza nome/faixa etária com os dados mais recentes. Nada é apagado: quem sai da
 * reserva continua no cadastro de dependentes.
 */
export async function syncFromReservation(
  client: PoolClient,
  mainGuestId: string,
  reservationId: string,
  companions: { fullName: string; document: string | null; ageGroup: AgeGroup }[],
) {
  for (const c of companions) {
    await client.query(
      `INSERT INTO guest_dependents (main_guest_id, full_name, document, document_key, dedupe_key, age_group, last_reservation_id)
       SELECT $1::uuid, $2::text, $3::text, dependent_doc_key($3::text), dependent_dedupe_key($2::text, $3::text),
              $4::text, $5::uuid
        -- o próprio responsável não vira dependente dele mesmo
        WHERE dependent_doc_key($3::text) IS DISTINCT FROM (SELECT document_number FROM guests WHERE id = $1::uuid)
       ON CONFLICT (main_guest_id, dedupe_key) DO UPDATE
          SET full_name           = EXCLUDED.full_name,
              document            = COALESCE(EXCLUDED.document, guest_dependents.document),
              age_group           = EXCLUDED.age_group,
              last_reservation_id = EXCLUDED.last_reservation_id,
              updated_at          = NOW()`,
      [mainGuestId, c.fullName, c.document, c.ageGroup, reservationId],
    );
  }
}

// ---------------------------------------------------------------------------
// Aba "Dependentes" do hóspede
// ---------------------------------------------------------------------------

interface DependentRow {
  id: string;
  full_name: string;
  document: string | null;
  document_key: string | null;
  age_group: AgeGroup;
  created_at: Date;
  updated_at: Date;
  stays_count: number;
  last_check_in: string | null;
  // o dependente também tem cadastro completo de hóspede?
  guest_id: string | null;
  guest_document_type: DocumentType | null;
  guest_block_reason: string | null;
}

/** Dependentes do hóspede, com quantas hospedagens fizeram junto com ele. */
export async function listByGuest(ownerId: string, mainGuestId: string) {
  const { rows } = await query<DependentRow>(
    `SELECT d.id, d.full_name, d.document, d.document_key, d.age_group, d.created_at, d.updated_at,
            st.total AS stays_count, st.last_check_in,
            g2.id AS guest_id, g2.document_type AS guest_document_type, gb2.reason AS guest_block_reason
       FROM guest_dependents d
       LEFT JOIN LATERAL (
         SELECT COUNT(DISTINCT r.id)::int AS total, MAX(r.check_in) AS last_check_in
           FROM reservations r
           JOIN reservation_guests rg ON rg.reservation_id = r.id
          WHERE r.main_guest_id = d.main_guest_id
            AND dependent_dedupe_key(rg.full_name, rg.document) = d.dedupe_key
       ) st ON TRUE
       LEFT JOIN guests g2 ON d.document_key IS NOT NULL AND g2.document_number = d.document_key AND g2.owner_id = $2
       LEFT JOIN guest_blocks gb2 ON gb2.guest_id = g2.id
      WHERE d.main_guest_id = $1
        AND EXISTS (SELECT 1 FROM guests gm WHERE gm.id = d.main_guest_id AND gm.owner_id = $2)
      ORDER BY st.last_check_in DESC NULLS LAST, d.full_name`,
    [mainGuestId, ownerId],
  );

  return {
    data: rows.map((d) => ({
      id: d.id,
      fullName: d.full_name,
      document: d.document,
      ageGroup: d.age_group,
      staysCount: d.stays_count,
      lastCheckIn: d.last_check_in,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      // Se o dependente também tiver cadastro completo de hóspede
      registeredGuest: d.guest_id
        ? { id: d.guest_id, documentType: d.guest_document_type!, blocked: !!d.guest_block_reason }
        : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Consulta por documento (avisos no cadastro da reserva e do hóspede)
// ---------------------------------------------------------------------------

interface LookupRow extends BlockColumnsRow {
  dependent_id: string;
  dependent_name: string;
  dependent_updated_at: Date;
  main_guest_id: string;
  main_guest_name: string;
  main_guest_document_type: DocumentType;
  main_guest_document_number: string;
}

/**
 * De quem este documento já foi dependente. Os responsáveis bloqueados vêm primeiro.
 * `excludeMainGuestId`: ignora um responsável (ex.: o da própria reserva sendo editada).
 */
export async function findByDocument(ownerId: string, document: string, excludeMainGuestId?: string | null) {
  const key = dependentDocKey(document);
  if (!key) return [];
  const { rows } = await query<LookupRow>(
    `SELECT d.id AS dependent_id, d.full_name AS dependent_name, d.updated_at AS dependent_updated_at,
            g.id AS main_guest_id, g.full_name AS main_guest_name,
            g.document_type AS main_guest_document_type, g.document_number AS main_guest_document_number,
            ${BLOCK_COLUMNS}
       FROM guest_dependents d
       JOIN guests g ON g.id = d.main_guest_id
       LEFT JOIN guest_blocks gb ON gb.guest_id = g.id
      WHERE d.document_key = $1
        AND g.owner_id = $3
        AND ($2::uuid IS NULL OR d.main_guest_id <> $2::uuid)
      ORDER BY (gb.guest_id IS NULL), d.updated_at DESC`,
    [key, excludeMainGuestId ?? null, ownerId],
  );
  return rows.map((r) => ({
    dependentId: r.dependent_id,
    dependentName: r.dependent_name,
    updatedAt: r.dependent_updated_at,
    mainGuest: {
      id: r.main_guest_id,
      fullName: r.main_guest_name,
      documentType: r.main_guest_document_type,
      documentNumber: r.main_guest_document_number,
      blocked: toBlocked(r),
    },
  }));
}
