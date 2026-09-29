/**
 * Cria um cliente (usuário) pela linha de comando — útil quando o cadastro público
 * está desativado (ALLOW_REGISTRATION=false).
 *
 *   npm run user:create -- "Nome do Cliente" cliente@email.com "SenhaForte123"
 *   docker compose -f docker-compose.prod.yml exec api node dist/db/createUser.js "Nome" email "Senha"
 *
 * Cada usuário é um cliente independente: só enxerga os próprios dados.
 */
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

async function main() {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password) {
    console.error('Uso: createUser "Nome" email@dominio.com "Senha"');
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido');
  if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('A senha deve ter de 8 a 72 caracteres, com pelo menos uma letra e um número');
  }

  const hash = await bcrypt.hash(password, 12);
  const { rowCount } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, LOWER($2), $3, 'user')
     ON CONFLICT (LOWER(email)) DO NOTHING`,
    [name.trim(), email.trim(), hash],
  );
  console.log(rowCount ? `✔ Cliente criado: ${email}` : `ℹ Já existe um usuário com o e-mail ${email} (nada foi alterado)`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('❌', err instanceof Error ? err.message : err);
    process.exit(1);
  });
