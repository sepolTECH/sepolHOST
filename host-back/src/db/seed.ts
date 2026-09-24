/**
 * Cria o usuário administrador definido no .env (somente se ainda não existir)
 * via ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME.
 */
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { pool } from './pool.js';

async function seed() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.log('ℹ ADMIN_EMAIL/ADMIN_PASSWORD não definidos — seed ignorado.');
    return;
  }

  const hash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, LOWER($2), $3, 'admin')
     ON CONFLICT (LOWER(email)) DO NOTHING`,
    [env.ADMIN_NAME, env.ADMIN_EMAIL, hash],
  );
  console.log(`✔ Administrador pronto: ${env.ADMIN_EMAIL} (se já existia, a senha não foi alterada)`);
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error('❌ Falha no seed:', err);
    process.exit(1);
  });
