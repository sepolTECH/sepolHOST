import type { NextFunction, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { AppError } from '../utils/AppError.js';
import { verifyToken, type TokenPayload } from '../utils/jwt.js';

export const AUTH_COOKIE = 'sepol_token';

/**
 * Usuário autenticado.
 * - `sub`: quem está logado (auditoria: "vistoriado por", "avaliado por"…).
 * - `ownerId`: de quem são os dados. Para cliente/admin é ele mesmo; para associado é o cliente
 *   que o cadastrou. Todo filtro de dados deve usar `ownerId`, nunca `sub`, nas rotas do associado.
 */
export interface AuthUser extends TokenPayload {
  ownerId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

async function authenticate(req: Request): Promise<AuthUser> {
  const header = req.headers.authorization;
  const token =
    req.cookies?.[AUTH_COOKIE] ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);

  if (!token) throw new AppError('Não autenticado', 401);

  let payload: TokenPayload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new AppError('Sessão inválida ou expirada', 401);
  }

  // Confere no banco: conta desativada/excluída perde o acesso na hora (não espera o token expirar).
  // Também usa o papel atual do banco, não o que estava gravado no token.
  // Associado também perde o acesso se o cliente (dono) for desativado.
  const { rows } = await query<{ role: TokenPayload['role']; owner_id: string | null }>(
    `SELECT u.role, u.owner_id
       FROM users u
       LEFT JOIN users o ON o.id = u.owner_id
      WHERE u.id = $1 AND u.is_active = TRUE AND (u.owner_id IS NULL OR o.is_active = TRUE)`,
    [payload.sub],
  );
  if (!rows[0]) throw new AppError('Sessão inválida ou expirada', 401);

  return { ...payload, role: rows[0].role, ownerId: rows[0].owner_id ?? payload.sub };
}

/** Exige um JWT válido de qualquer papel (usado em /auth/me e na área do associado). */
export async function ensureAnyAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = await authenticate(req);
  next();
}

/**
 * Exige um JWT válido de cliente/admin. Associados são barrados aqui: eles só usam /api/associate.
 * (Todas as rotas do sistema já usam este middleware.)
 */
export async function ensureAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await authenticate(req);
  if (user.role === 'associate') throw new AppError('Acesso negado', 403);
  req.user = user;
  next();
}

/** Exige um JWT válido de associado. */
export async function ensureAssociate(req: Request, _res: Response, next: NextFunction) {
  const user = await authenticate(req);
  if (user.role !== 'associate') throw new AppError('Acesso negado', 403);
  req.user = user;
  next();
}

export function ensureRole(...roles: TokenPayload['role'][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError('Acesso negado', 403);
    }
    next();
  };
}
