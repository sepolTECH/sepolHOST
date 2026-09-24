import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface TokenPayload {
  sub: string;
  role: 'admin' | 'user';
}

export function signToken(payload: TokenPayload, remember = false) {
  const expiresIn = (remember ? env.JWT_EXPIRES_IN_REMEMBER : env.JWT_EXPIRES_IN) as SignOptions['expiresIn'];
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}

/** Converte "8h", "30d", "15m" em milissegundos (para o maxAge do cookie). */
export function durationToMs(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match) return 8 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return n * unit;
}
