import { query } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import * as inventoryService from '../inventory/inventory.service.js';
import * as reviewsService from '../reviews/reviews.service.js';
import type { AssociateReviewInput } from '../reviews/reviews.schema.js';

/**
 * Área do associado: vistoria (inventário) e avaliação das reservas que o cliente liberou.
 *
 * - `ownerId` = cliente dono dos dados (vem do banco, via middleware) — usado em todo filtro.
 * - `associateId` = quem está logado — usado na auditoria ("vistoriado por") e na checagem de liberação.
 * - O associado NÃO recebe valores em dinheiro nem dados do hóspede além do nome.
 */

const sameProperty = (a: string, b: string) => `LOWER(BTRIM(${a})) = LOWER(BTRIM(${b}))`;

/** Garante que a reserva é do cliente E foi liberada para este associado. */
export async function assertAccess(ownerId: string, associateId: string, reservationId: string) {
  const { rows } = await query(
    `SELECT 1
       FROM associate_reservation_access a
       JOIN reservations r ON r.id = a.reservation_id
      WHERE a.associate_id = $1 AND a.reservation_id = $2 AND r.owner_id = $3`,
    [associateId, reservationId, ownerId],
  );
  if (!rows[0]) throw new AppError('Reserva não encontrada', 404);
}

export async function listReservations(ownerId: string, associateId: string) {
  const { rows } = await query<{
    id: string;
    reservation_number: string;
    property_name: string;
    guest_name: string;
    check_in: string;
    final_check_out: string;
    status: 'VAZIO' | 'HOSPEDADO' | 'CONCLUIDO';
    inventory_status: 'PENDENTE' | 'VISTORIADO';
    reviewed: boolean;
    items_count: number;
    checked_count: number;
  }>(
    `SELECT r.id, r.reservation_number, r.property_name, g.full_name AS guest_name,
            r.check_in, r.final_check_out, r.status, r.inventory_status,
            (rv.id IS NOT NULL) AS reviewed,
            CASE WHEN r.inventory_loaded
                 THEN (SELECT COUNT(*) FROM reservation_inventory_items x WHERE x.reservation_id = r.id)
                 ELSE (SELECT COUNT(*) FROM inventory_items i
                        WHERE i.owner_id = r.owner_id AND ${sameProperty('i.property_name', 'r.property_name')})
            END::int AS items_count,
            CASE WHEN r.inventory_loaded
                 THEN (SELECT COUNT(*) FROM reservation_inventory_items x WHERE x.reservation_id = r.id AND x.checked)
                 ELSE 0
            END::int AS checked_count
       FROM associate_reservation_access a
       JOIN reservations r ON r.id = a.reservation_id
       JOIN guests g ON g.id = r.main_guest_id
       LEFT JOIN reservation_reviews rv ON rv.reservation_id = r.id
      WHERE a.associate_id = $1 AND r.owner_id = $2
      ORDER BY (r.inventory_status = 'VISTORIADO' AND rv.id IS NOT NULL), r.final_check_out DESC, r.created_at DESC`,
    [associateId, ownerId],
  );

  return {
    data: rows.map((r) => ({
      id: r.id,
      reservationNumber: r.reservation_number,
      propertyName: r.property_name,
      guestName: r.guest_name,
      checkIn: r.check_in,
      finalCheckOut: r.final_check_out,
      status: r.status,
      inventoryStatus: r.inventory_status,
      reviewed: r.reviewed,
      itemsCount: r.items_count,
      checkedCount: r.checked_count,
    })),
  };
}

type Inventory = Awaited<ReturnType<typeof inventoryService.getReservationInventory>>;

/** Versão da vistoria para o associado: sem valores em dinheiro. */
function toAssociateInventory(inv: Inventory) {
  const { reservation, items, summary } = inv;
  return {
    reservation: {
      id: reservation.id,
      reservationNumber: reservation.reservationNumber,
      propertyName: reservation.propertyName,
      guestName: reservation.guestName,
      checkIn: reservation.checkIn,
      finalCheckOut: reservation.finalCheckOut,
      inventoryStatus: reservation.inventoryStatus,
      inspectedAt: reservation.inspectedAt,
    },
    items: items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, checked: i.checked })),
    summary: { itemsCount: summary.itemsCount, checkedCount: summary.checkedCount },
  };
}

export async function getInventory(ownerId: string, associateId: string, reservationId: string) {
  await assertAccess(ownerId, associateId, reservationId);
  return toAssociateInventory(await inventoryService.getReservationInventory(ownerId, reservationId));
}

export async function checkItem(
  ownerId: string,
  associateId: string,
  reservationId: string,
  itemId: string,
  checked: boolean,
) {
  await assertAccess(ownerId, associateId, reservationId);
  return toAssociateInventory(await inventoryService.setItemChecked(ownerId, reservationId, itemId, checked, associateId));
}

export async function checkAll(ownerId: string, associateId: string, reservationId: string, checked: boolean) {
  await assertAccess(ownerId, associateId, reservationId);
  return toAssociateInventory(await inventoryService.setAllChecked(ownerId, reservationId, checked, associateId));
}

export async function inspect(ownerId: string, associateId: string, reservationId: string) {
  await assertAccess(ownerId, associateId, reservationId);
  return toAssociateInventory(await inventoryService.inspect(ownerId, reservationId, associateId));
}

// ---------------------------------------------------------------------------
// Avaliação
// ---------------------------------------------------------------------------

export async function getReview(ownerId: string, associateId: string, reservationId: string) {
  await assertAccess(ownerId, associateId, reservationId);
  const { rows } = await query<{
    reservation_number: string;
    property_name: string;
    guest_name: string;
    check_in: string;
    final_check_out: string;
    cleanliness_rating: number | null;
    communication_rating: number | null;
    rules_rating: number | null;
    notes: string | null;
  }>(
    `SELECT r.reservation_number, r.property_name, g.full_name AS guest_name, r.check_in, r.final_check_out,
            rv.cleanliness_rating, rv.communication_rating, rv.rules_rating, rv.notes
       FROM reservations r
       JOIN guests g ON g.id = r.main_guest_id
       LEFT JOIN reservation_reviews rv ON rv.reservation_id = r.id
      WHERE r.id = $1 AND r.owner_id = $2`,
    [reservationId, ownerId],
  );
  const r = rows[0];
  if (!r) throw new AppError('Reserva não encontrada', 404);
  return {
    reservation: {
      id: reservationId,
      reservationNumber: r.reservation_number,
      propertyName: r.property_name,
      guestName: r.guest_name,
      checkIn: r.check_in,
      finalCheckOut: r.final_check_out,
    },
    review:
      r.cleanliness_rating && r.communication_rating && r.rules_rating
        ? {
            cleanlinessRating: r.cleanliness_rating,
            communicationRating: r.communication_rating,
            rulesRating: r.rules_rating,
            notes: r.notes,
          }
        : null,
  };
}

export async function saveReview(
  ownerId: string,
  associateId: string,
  reservationId: string,
  input: AssociateReviewInput,
) {
  await assertAccess(ownerId, associateId, reservationId);
  // blockGuest fixo em false: associado nunca bloqueia hóspede
  await reviewsService.save(reservationId, { ...input, blockGuest: false, blockReason: null }, ownerId, associateId);
  return getReview(ownerId, associateId, reservationId);
}
