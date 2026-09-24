import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import { signToken } from '../../utils/jwt.js';
import { sendMail } from '../../utils/mailer.js';

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'user';
  is_active: boolean;
}

export type PublicUser = Pick<UserRow, 'id' | 'name' | 'email' | 'role'>;

const toPublic = (u: UserRow): PublicUser => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// Hash "falso" usado quando o e-mail não existe, para o tempo de resposta
// ser parecido e não revelar quais e-mails estão cadastrados.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

export async function login(email: string, password: string, remember: boolean) {
  const { rows } = await query<UserRow>('SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
  const user = rows[0];

  const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !valid) throw new AppError('E-mail ou senha incorretos', 401);
  if (!user.is_active) throw new AppError('Usuário desativado', 403);

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const token = signToken({ sub: user.id, role: user.role }, remember);
  return { token, user: toPublic(user) };
}

export async function register(name: string, email: string, password: string) {
  const { rows: existing } = await query<{ id: string }>(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email],
  );
  if (existing[0]) throw new AppError('Este e-mail já está cadastrado', 409);

  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await query<UserRow>(
      `INSERT INTO users (name, email, password_hash, role, last_login_at)
       VALUES ($1, LOWER($2), $3, 'user', NOW())
       RETURNING *`,
      [name, email, hash],
    );
    const user = rows[0];
    const token = signToken({ sub: user.id, role: user.role });
    return { token, user: toPublic(user) };
  } catch (err) {
    // Corrida entre duas requisições com o mesmo e-mail (violação do índice único)
    if ((err as { code?: string }).code === '23505') throw new AppError('Este e-mail já está cadastrado', 409);
    throw err;
  }
}

export async function getById(id: string) {
  const { rows } = await query<UserRow>('SELECT * FROM users WHERE id = $1 AND is_active = TRUE', [id]);
  if (!rows[0]) throw new AppError('Usuário não encontrado', 401);
  return toPublic(rows[0]);
}

// ---------------------------------------------------------------------------
// Esqueci minha senha
// ---------------------------------------------------------------------------

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Gera um link de redefinição e envia por e-mail.
 * Nunca revela se o e-mail existe: quem chama sempre responde a mesma mensagem.
 */
export async function requestPasswordReset(email: string) {
  const { rows } = await query<UserRow>(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE LIMIT 1',
    [email],
  );
  const user = rows[0];
  if (!user) return;

  const token = randomBytes(32).toString('base64url');

  // Invalida links anteriores ainda não usados e cria o novo
  await query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [user.id]);
  await query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + make_interval(mins => $3))`,
    [user.id, hashToken(token), env.PASSWORD_RESET_EXPIRES_MIN],
  );

  const link = `${env.APP_URL.replace(/\/$/, '')}/redefinir-senha?token=${token}`;
  const minutes = env.PASSWORD_RESET_EXPIRES_MIN;
  const firstName = user.name.split(' ')[0];

  await sendMail({
    to: user.email,
    subject: 'Redefinição de senha — Sepol Host',
    text: [
      `Olá, ${firstName}.`,
      '',
      'Recebemos um pedido para redefinir a senha da sua conta.',
      `Acesse o link abaixo (válido por ${minutes} minutos):`,
      link,
      '',
      'Se não foi você, ignore este e-mail — sua senha continua a mesma.',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#111;max-width:480px">
        <p>Olá, ${escapeHtml(firstName)}.</p>
        <p>Recebemos um pedido para redefinir a senha da sua conta.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#111;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">
            Redefinir senha
          </a>
        </p>
        <p style="color:#666">O link é válido por ${minutes} minutos. Se não foi você, ignore este e-mail — sua senha continua a mesma.</p>
      </div>`,
  });
}

/** Troca a senha usando um token válido (não usado e não expirado). */
export async function resetPassword(token: string, password: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string; user_id: string }>(
      `SELECT pr.id, pr.user_id
         FROM password_resets pr
         JOIN users u ON u.id = pr.user_id AND u.is_active = TRUE
        WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > NOW()
        FOR UPDATE OF pr`,
      [hashToken(token)],
    );
    const reset = rows[0];
    if (!reset) throw new AppError('Link inválido ou expirado. Solicite um novo.', 400);

    const hash = await bcrypt.hash(password, 12);
    await client.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
      hash,
      reset.user_id,
    ]);
    await client.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [reset.id]);
    // Qualquer outro link pendente desse usuário deixa de valer
    await client.query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [reset.user_id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function escapeHtml(value: string) {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, (c) => map[c]);
}
