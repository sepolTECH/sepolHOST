import { pool, query } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import { PLATFORMS } from '../reservations/reservations.schema.js';
import type { PresetInput, SaveFeesInput } from './settings.schema.js';

export interface PlatformFee {
  platform: (typeof PLATFORMS)[number];
  /** Percentual (0–100) ou null quando não há taxa pré-cadastrada. */
  commissionRate: number | null;
}

/** Sempre devolve todas as plataformas, na ordem padrão, com null nas que ainda não têm taxa. */
export async function listFees(ownerId: string): Promise<PlatformFee[]> {
  const { rows } = await query<{ platform: PlatformFee['platform']; commission_rate: number }>(
    'SELECT platform, commission_rate FROM platform_fees WHERE owner_id = $1',
    [ownerId],
  );
  const byPlatform = new Map(rows.map((r) => [r.platform, Number(r.commission_rate)]));
  return PLATFORMS.map((platform) => ({ platform, commissionRate: byPlatform.get(platform) ?? null }));
}

export async function saveFees(ownerId: string, input: SaveFeesInput): Promise<PlatformFee[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const fee of input.fees) {
      if (fee.commissionRate === null) {
        await client.query('DELETE FROM platform_fees WHERE owner_id = $1 AND platform = $2', [ownerId, fee.platform]);
      } else {
        await client.query(
          `INSERT INTO platform_fees (owner_id, platform, commission_rate)
           VALUES ($1, $2, $3)
           ON CONFLICT (owner_id, platform)
           DO UPDATE SET commission_rate = EXCLUDED.commission_rate, updated_at = NOW()`,
          [ownerId, fee.platform, Math.round(fee.commissionRate * 100) / 100],
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return listFees(ownerId);
}

// ---------------------------------------------------------------------------
// Valores padrão: adicionais a receber e custos/taxas com valor sugerido
// ---------------------------------------------------------------------------

interface PresetRow {
  id: string;
  kind: PresetInput['kind'];
  name: string;
  amount_cents: number;
}

const toPreset = (r: PresetRow) => ({ id: r.id, kind: r.kind, name: r.name, amountCents: Number(r.amount_cents) });

const PRESET_COLUMNS = 'id, kind, name, amount_cents::float8 AS amount_cents';

function handlePresetError(err: unknown): never {
  if ((err as { code?: string }).code === '23505') throw new AppError('Já existe um item com esse nome', 409);
  throw err;
}

export async function listPresets(ownerId: string) {
  const { rows } = await query<PresetRow>(
    `SELECT ${PRESET_COLUMNS} FROM reservation_presets WHERE owner_id = $1 ORDER BY kind, LOWER(name)`,
    [ownerId],
  );
  return rows.map(toPreset);
}

export async function createPreset(ownerId: string, userId: string, input: PresetInput) {
  try {
    const { rows } = await query<PresetRow>(
      `INSERT INTO reservation_presets (owner_id, kind, name, amount_cents, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING ${PRESET_COLUMNS}`,
      [ownerId, input.kind, input.name, input.amountCents, userId],
    );
    return toPreset(rows[0]);
  } catch (err) {
    handlePresetError(err);
  }
}

export async function updatePreset(ownerId: string, userId: string, id: string, input: PresetInput) {
  try {
    const { rows } = await query<PresetRow>(
      `UPDATE reservation_presets
          SET kind = $3, name = $4, amount_cents = $5, updated_by = $6, updated_at = NOW()
        WHERE id = $1 AND owner_id = $2
        RETURNING ${PRESET_COLUMNS}`,
      [id, ownerId, input.kind, input.name, input.amountCents, userId],
    );
    if (!rows[0]) throw new AppError('Item não encontrado', 404);
    return toPreset(rows[0]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    handlePresetError(err);
  }
}

export async function removePreset(ownerId: string, id: string) {
  const { rowCount } = await query('DELETE FROM reservation_presets WHERE id = $1 AND owner_id = $2', [id, ownerId]);
  if (!rowCount) throw new AppError('Item não encontrado', 404);
}
