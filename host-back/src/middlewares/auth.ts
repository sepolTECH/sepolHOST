import type { NextFunction, Request, Response } from 'express';
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
export function ensureAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token =
    req.cookies?.[AUTH_COOKIE] ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);

  if (!token) throw new AppError('Não autenticado', 401);

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    throw new AppError('Sessão inválida ou expirada', 401);
  }
}

export function ensureRole(...roles: TokenPayload['role'][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError('Acesso negado', 403);
    }
    next();
  };
}
