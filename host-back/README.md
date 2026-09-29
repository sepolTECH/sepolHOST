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
│  │  └─ migrations/             # 001_users, 002_password_resets, 003_guests, 004_reservations, 005_guests_extra_fields, 006_guests_drop_reservation_number, 007_reservations_platform_costs_attachments, 008_reservation_extensions
│  ├─ middlewares/               # ensureAuth, ensureRole, errorHandler
│  ├─ modules/auth/              # rotas + regras de login
│  ├─ modules/guests/            # cadastro de hóspedes (CRUD sem exclusão)
│  ├─ modules/reservations/      # reservas: responsável, acompanhantes, datas e valores
│  ├─ utils/                     # AppError, jwt, mailer (SMTP), documents (CPF/CNPJ)
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
| GET    | `/api/guests`      | Lista hóspedes — `?search=&personType=PF\|PJ&page=1&pageSize=20` (requer login) |
| GET    | `/api/guests/:id`  | Detalhe do hóspede (requer login)                   |
| POST   | `/api/guests`      | Cadastra hóspede (requer login)                     |
| PUT    | `/api/guests/:id`  | Atualiza hóspede (requer login)                     |
| GET    | `/api/guests/check-document` | Verifica se o documento já está cadastrado — `?documentType=CPF\|PASSAPORTE\|DNI\|CNPJ&documentNumber=` |
| GET    | `/api/guests/:id/document-photo` | Baixa a foto do documento (requer login) |
| PUT    | `/api/guests/:id/document-photo` | Envia/troca a foto — corpo = arquivo (JPG, PNG, WEBP ou PDF, até 5 MB) |
| DELETE | `/api/guests/:id/document-photo` | Remove a foto do documento |
| GET    | `/api/reservations`     | Lista reservas + somatórios — `?search=&status=VAZIO\|HOSPEDADO\|CONCLUIDO&page=&pageSize=` |
| GET    | `/api/reservations/:id` | Detalhe da reserva com acompanhantes              |
| POST   | `/api/reservations`     | Cria reserva (valores em centavos; comissão em % ou R$) |
| PUT    | `/api/reservations/:id` | Atualiza reserva (substitui a lista de acompanhantes) |

O token JWT fica num **cookie httpOnly** (`sepol_token`) — o JavaScript do front não tem acesso a ele, o que protege contra roubo por XSS. Duração: 8h, ou 30 dias com "Manter conectado".
O login tem limite de **10 tentativas / 15 min por IP** e o cadastro, **5 por hora por IP**. Senha do cadastro: 8–72 caracteres, com pelo menos uma letra e um número.

## Multi-cliente (dados isolados por usuário)

Cada usuário é um cliente independente. As tabelas raiz (`guests`, `reservations`, `recurring_expenses`,
`month_expenses`, `calendar_feeds`, `finance_closing_settings`) têm `owner_id`, e **toda consulta** dos serviços
filtra pelo usuário logado (`req.user.sub`). Tabelas filhas herdam o dono da tabela pai. Ao criar módulos novos,
sempre receba o `ownerId` no service e filtre por ele — inclusive em buscas por `id`.

- `ALLOW_REGISTRATION=false` fecha o cadastro público; crie clientes com `npm run user:create -- "Nome" email "Senha"`.
- Conta desativada (`is_active = false`) perde o acesso na hora (o token é conferido no banco a cada requisição).
- Em produção a API não sobe com `JWT_SECRET`/`ADMIN_PASSWORD` de exemplo, sem `COOKIE_SECURE=true` ou com localhost no CORS.
- Deploy na VPS: veja `../DEPLOY.md`.

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

## Reservas: anexos

| Método | Rota | Descrição |
|--------|------|-----------|
| POST   | `/api/reservations/:id/attachments?category=CONTRATO\|CHECKIN\|CHECKOUT\|OUTRO&name=arquivo.pdf` | Envia um anexo — corpo = arquivo (JPG, PNG, WEBP ou PDF, até 5 MB) |
| GET    | `/api/reservations/:id/attachments/:attachmentId` | Baixa o anexo (requer login) |
| DELETE | `/api/reservations/:id/attachments/:attachmentId` | Remove o anexo |

Total geral da reserva = (valor + extensões) − comissão − comissão das extensões − custos e taxas (`costs`).

**Extensões de hospedagem** (`extensions`, enviadas junto com a reserva): cada uma começa no check-out anterior.
- `PLATAFORMA`: valor = noites × diária média da reserva (valor ÷ noites originais), com a mesma comissão.
- `DIRETO`: valor informado em `amountCents`, **sem comissão**; `paymentMethod` opcional.
- A reserva guarda `check_out` (original) e `final_check_out` (com as extensões).

## Fotos de documento

Fotos de documento dos hóspedes e anexos das reservas ficam em disco, na pasta `UPLOADS_DIR` (padrão `uploads/`, na raiz do back); o banco guarda só o caminho.
No Docker, essa pasta é o volume `uploads` (`/app/uploads`). **Inclua o volume no backup da VPS junto com o banco.**


## Finanças

| Método | Rota | Descrição |
|--------|------|-----------|
| GET    | `/api/finance?year=&month=` | **Relatório financeiro**: hospedagens proporcionais às noites do mês (bruto − comissões − custos). Sem despesas, taxas ou impostos |
| GET    | `/api/finance/closing?year=&month=` | **Fechamento do mês** (ponta do lápis, regime de caixa): hospedagens inteiras com check-out final no mês anterior − despesas do mês − taxa de administração − carnê-leão |
| PUT    | `/api/finance/closing/settings` | `{ year, month, adminFee: { enabled, percent, base: GROSS\|NET }, tax: { enabled, incomeBase: GROSS\|PAYOUT, deductionMode: AUTO\|LEGAL\|SIMPLIFIED, dependents, socialSecurityCents, alimonyCents } }` — vale a partir do mês salvo até mudar |
| POST/PUT/DELETE | `/api/finance/expenses[/:id]` | Despesas do mês (condomínio, IPTU, contas...) |

- O recebimento cai no mês seguinte ao check-out final (`PAYOUT_DELAY_MONTHS` em `closing.service.ts`).
- Tabela do IR, dedução por dependente, desconto simplificado e redução da Lei 15.270/2025 ficam em `src/modules/finance/tax.ts`.
- Despesas dedutíveis do aluguel no carnê-leão: categorias `CONDOMINIO`, `IPTU`, `ADMINISTRACAO` + a taxa de administração calculada.

## Calendário (links iCal das plataformas)

Somente leitura: a API baixa os calendários `.ics` exportados pelas plataformas (Airbnb, Booking, VRBO…) e junta tudo numa visão única. Nada é enviado para as plataformas.

| Método | Rota | Descrição |
| ------ | ---- | --------- |
| GET    | `/api/calendar/events?from=&to=&refresh=1` | Marcações de todos os links ativos no período (`AAAA-MM-DD`, `to` exclusivo). Mostra só o que vem dos links. Cada marcação traz a reserva do cadastro vinculada (manual, ou automática por código da reserva / mesma plataforma e datas). `refresh=1` ignora o cache de 10 min |
| GET    | `/api/calendar/feeds` | Links cadastrados + situação da última sincronização |
| GET    | `/api/calendar/link-candidates?start=&end=&search=` | Reservas sugeridas para vincular a uma marcação |
| PUT/DELETE | `/api/calendar/links` | `{ feedId, eventKey, reservationId }` — vincula / desvincula (desvincular também impede o vínculo automático) |
| POST/PUT/DELETE | `/api/calendar/feeds[/:id]` | `{ name, platform, url, color, propertyName?, active }` (`webcal://` é aceito e convertido para `https://`) |

- O download é feito pelo servidor (as plataformas não liberam CORS para o navegador), com limite de 15 s e 5 MB e bloqueio de endereços internos.
- As plataformas normalmente **não enviam o nome do hóspede** no iCal (o Airbnb manda só "Reserved", o link da reserva e os 4 últimos dígitos do telefone; o Booking manda "CLOSED - Not available"). Os dados do hóspede vêm da reserva do cadastro vinculada à marcação (tabela `calendar_event_links`, chave = UID do evento no iCal).
- Quando uma plataforma importa o calendário da outra, o mesmo período aparece em vários links: a API mostra só uma marcação e lista as demais em `alsoIn`.
