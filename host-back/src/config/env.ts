import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3333),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  JWT_EXPIRES_IN_REMEMBER: z.string().default('30d'),

  // Origens permitidas no CORS, separadas por vírgula
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Se true, o cookie só trafega em HTTPS (use true em produção com SSL)
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // URL pública do front — usada no link de redefinição de senha
  APP_URL: z.string().url().default('http://localhost:5173'),
  // Validade do link de redefinição de senha, em minutos
  PASSWORD_RESET_EXPIRES_MIN: z.coerce.number().int().positive().default(30),

  // SMTP para envio de e-mails. Sem SMTP_HOST, os e-mails são exibidos no console da API.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Sepol Host <no-reply@sepol.com.br>'),

  // Usuário administrador criado pelo seed
  ADMIN_NAME: z.string().default('Administrador'),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:');
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
