# Sepol Host — API (host-back)

API em **Node.js + Express + TypeScript**, banco **PostgreSQL 16**, empacotada com **Docker**.

## Estrutura

```
host-back/
├─ src/
│  ├─ config/env.ts              # validação das variáveis de ambiente (zod)
│  ├─ db/
│  │  ├─ pool.ts                 # conexão com o PostgreSQL
│  │  ├─ migrate.ts              # executor de migrations (.sql)
│  │  ├─ seed.ts                 # cria o admin inicial
│  │  └─ migrations/             # 001_create_users, 002_create_password_resets
│  ├─ middlewares/               # ensureAuth, ensureRole, errorHandler
│  ├─ modules/auth/              # rotas + regras de login
│  ├─ utils/                     # AppError, jwt, mailer (SMTP)
│  ├─ app.ts                     # express (helmet, cors, cookies, rotas)
│  └─ server.ts                  # sobe a API (roda migrations antes)
├─ Dockerfile
├─ docker-compose.yml            # db (postgres) + api
└─ .env.example
```

## Rotas

| Método | Rota               | Descrição                                           |
| ------ | ------------------ | --------------------------------------------------- |
| GET    | `/api/health`      | Status da API e do banco                            |
| POST   | `/api/auth/register` | `{ name, email, password }` → cria usuário (role `user`) e já grava o cookie |
| POST   | `/api/auth/forgot-password` | `{ email }` → envia link de redefinição (resposta sempre igual) |
| POST   | `/api/auth/reset-password`  | `{ token, password }` → troca a senha |
| POST   | `/api/auth/login`  | `{ email, password, remember }` → grava cookie JWT  |
| GET    | `/api/auth/me`     | Usuário logado (requer cookie)                      |
| POST   | `/api/auth/logout` | Remove o cookie                                     |

O token JWT fica num **cookie httpOnly** (`sepol_token`) — o JavaScript do front não tem acesso a ele, o que protege contra roubo por XSS. Duração: 8h, ou 30 dias com "Manter conectado".
O login tem limite de **10 tentativas / 15 min por IP** e o cadastro, **5 por hora por IP**. Senha do cadastro: 8–72 caracteres, com pelo menos uma letra e um número.

## Rodando localmente

### Opção A — tudo no Docker

```bash
cp .env.example .env      # ajuste senhas e JWT_SECRET
docker compose up -d --build
docker compose logs -f api
```

A API sobe em `http://localhost:3333`, já aplicando as migrations e criando o admin do `.env`.

### Opção B — só o banco no Docker, API com hot-reload

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run dev               # aplica migrations e sobe em http://localhost:3333
npm run seed              # cria o admin (só na primeira vez)
```

Depois, no front (`../host-front`): `npm run dev` → `http://localhost:5173`.
O Vite repassa `/api` para a porta 3333, então não há problema de CORS em desenvolvimento.

**Login padrão:** `admin@sepol.com.br` / `Admin@123` (troque no `.env` antes de subir em produção).

## Nova migration

Crie `src/db/migrations/002_nome.sql`. Ela é aplicada automaticamente na próxima vez que a API subir (ou com `npm run migrate`).

## Protegendo novas rotas

```ts
import { ensureAuth, ensureRole } from '../../middlewares/auth.js';

router.get('/clientes', ensureAuth, handler);                     // qualquer usuário logado
router.delete('/clientes/:id', ensureAuth, ensureRole('admin'), handler); // só admin
// req.user.sub = id do usuário, req.user.role = papel
```

## Deploy na VPS (resumo)

1. Instale Docker e o plugin compose na VPS.
2. Envie a pasta `host-back` e crie o `.env` de produção:
   - `NODE_ENV=production`
   - senhas fortes em `POSTGRES_PASSWORD` e `ADMIN_PASSWORD`
   - `JWT_SECRET` aleatório: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - `CORS_ORIGIN=https://seudominio.com.br`
   - `COOKIE_SECURE=true` (exige HTTPS)
3. `docker compose up -d --build`
4. Faça o build do front (`npm run build` em `host-front`) e sirva a pasta `dist` com Nginx, repassando `/api` para `127.0.0.1:3333`:

```nginx
server {
  server_name seudominio.com.br;
  root /var/www/sepol-host/dist;

  location / {
    try_files $uri /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3333;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

5. HTTPS com Certbot: `sudo certbot --nginx -d seudominio.com.br`.

Front e API no mesmo domínio = cookie funcionando sem configuração extra e sem CORS.
As portas do banco e da API ficam presas em `127.0.0.1`, então só o Nginx é exposto à internet.

**Backup do banco:**
```bash
docker exec sepol-db pg_dump -U sepol sepol_host > backup_$(date +%F).sql
```

## Esqueci minha senha

1. O front chama `POST /api/auth/forgot-password`. Se o e-mail existir, é gerado um token aleatório (só o hash SHA-256 fica no banco, tabela `password_resets`) válido por `PASSWORD_RESET_EXPIRES_MIN` minutos (padrão 30).
2. O usuário recebe o link `APP_URL/redefinir-senha?token=...`, define a nova senha e o front chama `POST /api/auth/reset-password`. O token só funciona uma vez.

**Sem SMTP configurado** (`SMTP_HOST` vazio), o e-mail não é enviado: o link aparece no log da API (`docker compose logs -f api`). Para enviar de verdade, preencha `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` e `SMTP_FROM` no `.env` (Gmail/Google Workspace com senha de app, Brevo, Amazon SES, Resend etc.).
