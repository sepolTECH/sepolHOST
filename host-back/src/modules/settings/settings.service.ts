import { pool, query } from '../../db/pool.js';
import { PLATFORMS } from '../reservations/reservations.schema.js';
import type { SaveFeesInput } from './settings.schema.js';

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
