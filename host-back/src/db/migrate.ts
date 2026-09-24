/**
 * Executor simples de migrations.
 * Lê os arquivos .sql de src/db/migrations em ordem alfabética
 * e aplica apenas os que ainda não foram registrados em schema_migrations.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Em produção (dist/) os .sql são copiados para dist/db/migrations pelo Dockerfile
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`→ Aplicando migration ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    console.log('✔ Migrations em dia');
  } finally {
    client.release();
  }
}

// Executado diretamente via "npm run migrate"
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => pool.end())
    .catch((err) => {
      console.error('❌ Falha nas migrations:', err);
      process.exit(1);
    });
}
