import { Router, type CookieOptions } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { AUTH_COOKIE, ensureAuth } from '../../middlewares/auth.js';
import { durationToMs } from '../../utils/jwt.js';
import * as authService from './auth.service.js';

export const authRoutes = Router();

const loginSchema = z.object({
  email: z.string().trim().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
  remember: z.boolean().optional().default(false),
});

// Regras de senha (cadastro e redefinição) — espelhadas no front
const passwordSchema = z
  .string()
  .min(8, 'A senha deve ter pelo menos 8 caracteres')
  .max(72, 'A senha deve ter no máximo 72 caracteres')
  .regex(/[A-Za-z]/, 'A senha deve conter pelo menos uma letra')
  .regex(/\d/, 'A senha deve conter pelo menos um número');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome').max(120, 'Nome muito longo'),
  email: z.string().trim().email('E-mail inválido').max(255),
  password: passwordSchema,
});

const forgotSchema = z.object({
  email: z.string().trim().email('E-mail inválido').max(255),
});

const resetSchema = z.object({
  token: z.string().min(20, 'Link inválido ou expirado. Solicite um novo.').max(200),
  password: passwordSchema,
});

// Máx. 5 pedidos de redefinição a cada 15 minutos por IP
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Muitas solicitações. Tente novamente em alguns minutos.' },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

// Máx. 5 cadastros por hora por IP
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Muitos cadastros a partir deste IP. Tente novamente mais tarde.' },
});

// Máx. 10 tentativas de login a cada 15 minutos por IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
});

function cookieOptions(remember: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: durationToMs(remember ? env.JWT_EXPIRES_IN_REMEMBER : env.JWT_EXPIRES_IN),
  };
}

authRoutes.post('/login', loginLimiter, async (req, res) => {
  const { email, password, remember } = loginSchema.parse(req.body);
  const { token, user } = await authService.login(email, password, remember);
  res.cookie(AUTH_COOKIE, token, cookieOptions(remember));
  res.json({ user });
});

// Informa ao front se o cadastro de novos clientes está aberto
authRoutes.get('/config', (_req, res) => {
  res.json({ registrationOpen: env.ALLOW_REGISTRATION });
});

authRoutes.post('/register', registerLimiter, async (req, res) => {
  if (!env.ALLOW_REGISTRATION) throw new AppError('O cadastro de novos usuários está desativado', 403);
  const { name, email, password } = registerSchema.parse(req.body);
  const { token, user } = await authService.register(name, email, password);
  res.cookie(AUTH_COOKIE, token, cookieOptions(false));
  res.status(201).json({ user });
});

authRoutes.post('/forgot-password', forgotLimiter, async (req, res) => {
  const { email } = forgotSchema.parse(req.body);
  // Não espera o envio: a resposta leva o mesmo tempo com ou sem conta cadastrada
  authService
    .requestPasswordReset(email)
    .catch((err) => console.error('Falha ao enviar e-mail de redefinição:', err));
  res.json({ message: 'Se houver uma conta com este e-mail, enviaremos um link para redefinir a senha.' });
});

authRoutes.post('/reset-password', resetLimiter, async (req, res) => {
  const { token, password } = resetSchema.parse(req.body);
  await authService.resetPassword(token, password);
  res.json({ message: 'Senha redefinida com sucesso.' });
});

authRoutes.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  res.status(204).end();
});

authRoutes.get('/me', ensureAuth, async (req, res) => {
  const user = await authService.getById(req.user!.sub);
  res.json({ user });
});
