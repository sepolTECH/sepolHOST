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

  // Permite que novos clientes criem conta em /api/auth/register.
  // Use false se preferir criar os clientes manualmente (npm run user:create).
  ALLOW_REGISTRATION: z
    .enum(['true', 'false'])
    .default('true')
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

  // Pasta onde ficam os arquivos enviados (fotos de documento). Relativa à raiz do projeto.
  UPLOADS_DIR: z.string().default('uploads'),

  // Usuário administrador criado pelo seed
  ADMIN_NAME: z.string().default('Administrador'),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
});

// Variáveis vazias (ex.: "ADMIN_EMAIL=" vindo do docker-compose) contam como não definidas
const rawEnv = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
const parsed = schema.safeParse(rawEnv);

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:');
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

// Trava de segurança: em produção não sobe com valores de exemplo
if (env.NODE_ENV === 'production') {
  const problems: string[] = [];
  if (/troque|change-?me|exemplo/i.test(env.JWT_SECRET)) problems.push('JWT_SECRET ainda é o valor de exemplo');
  if (env.ADMIN_PASSWORD && /^admin@123$/i.test(env.ADMIN_PASSWORD)) problems.push('ADMIN_PASSWORD ainda é a senha de exemplo (Admin@123)');
  if (!env.COOKIE_SECURE) problems.push('COOKIE_SECURE precisa ser true em produção (use HTTPS)');
  if (/localhost|127\.0\.0\.1/.test(env.CORS_ORIGIN)) problems.push('CORS_ORIGIN aponta para localhost');
  if (/localhost|127\.0\.0\.1/.test(env.APP_URL)) problems.push('APP_URL aponta para localhost');
  if (problems.length) {
    console.error('❌ Configuração insegura para produção:');
    for (const p of problems) console.error(`   - ${p}`);
    process.exit(1);
  }
}
