import pg from 'pg';
import { env } from '../config/env.js';

// Colunas DATE voltam como texto "AAAA-MM-DD" (sem conversão para fuso horário)
pg.types.setTypeParser(1082, (v) => v);
// BIGINT (valores em centavos) e NUMERIC (percentuais) como número
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err);
});

export function query<T extends pg.QueryResultRow = any>(text: string, params?: unknown[]) {
  return pool.query<T>(text, params);
}
