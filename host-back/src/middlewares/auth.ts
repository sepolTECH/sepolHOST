import type { NextFunction, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { AppError } from '../utils/AppError.js';
import { verifyToken, type TokenPayload } from '../utils/jwt.js';

export const AUTH_COOKIE = 'sepol_token';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/** Exige um JWT válido (cookie httpOnly ou header Authorization: Bearer). */
export async function ensureAuth(req: Request, _res: Response, next: NextFunction) {
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
  const { rows } = await query<{ role: TokenPayload['role'] }>(
    'SELECT role FROM users WHERE id = $1 AND is_active = TRUE',
    [payload.sub],
  );
  if (!rows[0]) throw new AppError('Sessão inválida ou expirada', 401);

  req.user = { ...payload, role: rows[0].role };
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
