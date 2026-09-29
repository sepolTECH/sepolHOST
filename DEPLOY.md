# Sepol Host — Deploy na VPS (passo a passo)

Cada cliente cria a própria conta (ou você cria para ele) e **só enxerga os próprios dados**: hóspedes, reservas,
finanças, calendário, lista negra, avaliações, fotos e anexos. O isolamento é feito no back-end (todas as consultas
filtram pelo usuário logado) e reforçado no banco (uma reserva não pode apontar para hóspede de outro cliente).

## O que sobe

| Serviço | O que é | Exposto na internet? |
| ------- | ------- | -------------------- |
| `web`   | Caddy: serve o site, gera o HTTPS automático (Let's Encrypt) e repassa `/api` para a API | Sim (portas 80 e 443) |
| `api`   | Node.js/Express — roda as migrations e cria o admin na subida | Não |
| `db`    | PostgreSQL 16 | Não |

Os dados ficam em volumes do Docker (`pgdata` = banco, `uploads` = fotos e anexos, `caddy_data` = certificados).
Eles **não** ficam no GitHub — por isso o backup (passo 9) é obrigatório.

---

## Antes de começar — o que você precisa

- Uma VPS com **Ubuntu 22.04/24.04 ou Debian 12**, com acesso SSH e pelo menos 1 GB de RAM (2 GB é mais confortável).
- Um **domínio** (ou subdomínio, ex.: `host.seudominio.com.br`) cujo DNS você consegue editar.
- O projeto no **GitHub**, já com as últimas alterações enviadas (`git push`).
- Uma conta em um serviço de **SMTP** (Brevo, Resend, Amazon SES, etc.) para o "Esqueci minha senha".

---

## Passo 1 — Apontar o domínio para a VPS

No painel de DNS do domínio, crie um registro:

| Tipo | Nome | Valor |
| ---- | ---- | ----- |
| A    | `host` (ou o subdomínio que quiser) | IP público da VPS |

Confira se já propagou (no seu computador): `nslookup host.seudominio.com.br` — deve devolver o IP da VPS.
**Não avance antes disso:** o HTTPS só é emitido quando o domínio já aponta para a VPS.

## Passo 2 — Preparar a VPS

Conecte por SSH (`ssh root@IP-DA-VPS`) e rode:

```bash
# Atualiza o sistema
apt update && apt upgrade -y

# Instala Docker + Docker Compose
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version

# Git
apt install -y git

# Firewall: libera só SSH, HTTP e HTTPS (nunca abra 3333 nem 5432)
apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
ufw status
```

> Se você usa um usuário comum em vez de `root`, adicione-o ao grupo do Docker: `usermod -aG docker SEU-USUARIO`
> (e entre de novo no SSH). Nos comandos abaixo, use `sudo` se necessário.

## Passo 3 — Dar acesso da VPS ao GitHub

**Se o repositório for público**, pule para o passo 4.

**Se for privado**, escolha uma das opções:

**Opção A — Deploy key (recomendada, só leitura, só esse repositório)**

```bash
# Na VPS: gera uma chave só para esse fim
ssh-keygen -t ed25519 -C "vps-sepol-host" -f ~/.ssh/sepol_deploy -N ""
cat ~/.ssh/sepol_deploy.pub
```

1. No GitHub: repositório → **Settings → Deploy keys → Add deploy key**.
2. Cole a chave pública impressa acima, dê um nome (ex.: `vps`) e **não** marque "Allow write access".
3. De volta à VPS, diga ao SSH para usar essa chave:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/sepol_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com     # responda "yes"; deve dizer "Hi ...! You've successfully authenticated"
```

**Opção B — Token de acesso (HTTPS)**

No GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens** → crie um token só para
esse repositório com permissão **Contents: Read-only**. Na hora do `git clone` (passo 4), use seu usuário e o token
como senha.

## Passo 4 — Baixar o projeto

```bash
git clone git@github.com:SEU-USUARIO/SEU-REPOSITORIO.git /opt/sepol-host
# (Opção B/HTTPS:  git clone https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git /opt/sepol-host)
cd /opt/sepol-host
ls -a        # deve mostrar docker-compose.prod.yml, .env.production.example, host-back, host-front, deploy...
```

## Passo 5 — Configurar o `.env` (só existe na VPS)

```bash
cd /opt/sepol-host
cp .env.production.example .env
nano .env
```

Preencha **todos** os campos:

| Variável | O que colocar |
| -------- | ------------- |
| `DOMAIN` | O domínio do passo 1, **sem** `https://` (ex.: `host.seudominio.com.br`) |
| `POSTGRES_PASSWORD` | Uma senha longa e aleatória (`openssl rand -hex 24`) |
| `JWT_SECRET` | Gere com `openssl rand -hex 48` |
| `ALLOW_REGISTRATION` | `true` = qualquer pessoa cria conta no site; `false` = só você cria clientes (passo 8) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seu login de administrador (senha com 8+ caracteres, letras e números) |
| `SMTP_*` | Dados do provedor de e-mail (veja abaixo) |

**SMTP** — exemplo (os valores exatos aparecem no painel do provedor):

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false            # false para a porta 587; true para a 465
SMTP_USER=seu-usuario-smtp
SMTP_PASS=sua-chave-smtp
SMTP_FROM=Sepol Host <no-reply@seudominio.com.br>
```

No DNS do domínio do remetente, adicione também os registros **SPF, DKIM e DMARC** que o provedor indicar; sem eles
os e-mails de redefinição de senha tendem a cair no spam. Sem `SMTP_HOST`, o e-mail **não é enviado** (o link só
aparece no log da API).

Proteja o arquivo: `chmod 600 .env`. **Nunca** envie o `.env` para o GitHub (o `.gitignore` já o ignora).

## Passo 6 — Subir tudo

```bash
cd /opt/sepol-host
docker compose -f docker-compose.prod.yml up -d --build
```

A primeira vez demora alguns minutos (baixa imagens e compila o site e a API). Acompanhe:

```bash
docker compose -f docker-compose.prod.yml ps                 # os 3 serviços devem estar "running"/"healthy"
docker compose -f docker-compose.prod.yml logs -f api        # espere: "Migrations em dia" e "API rodando"
docker compose -f docker-compose.prod.yml logs -f web        # deve mostrar o certificado HTTPS sendo emitido
```

(Ctrl+C sai dos logs sem parar nada.)

## Passo 7 — Testar

1. Abra `https://SEU-DOMINIO` — deve carregar a tela de login com o cadeado do HTTPS.
2. Entre com `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. Depois do primeiro login, edite o `.env` e apague o valor de `ADMIN_PASSWORD` (a senha só serve para criar o
   admin na primeira subida) e rode `docker compose -f docker-compose.prod.yml up -d` para aplicar.
4. Teste o "Esqueci minha senha" com um e-mail real e confira se chegou (olhe o spam também).
5. **Teste o isolamento:** crie duas contas de teste e confirme que uma não vê os dados da outra.

Verificação rápida da API: `curl https://SEU-DOMINIO/api/health` → `{"status":"ok","database":"up"}`.

## Passo 8 — Cadastrar clientes

- **Cadastro aberto** (`ALLOW_REGISTRATION=true`): o cliente acessa o site e cria a própria conta.
- **Você cria os clientes** (`ALLOW_REGISTRATION=false`): rode para cada cliente

```bash
cd /opt/sepol-host
docker compose -f docker-compose.prod.yml exec api node dist/db/createUser.js "Nome do Cliente" cliente@email.com "SenhaForte123"
```

Cada conta é totalmente independente: o mesmo CPF de hóspede ou o mesmo número de reserva pode existir em clientes
diferentes sem conflito. Para **desativar** um cliente (perde o acesso imediatamente), troque o e-mail no comando:

```bash
docker compose -f docker-compose.prod.yml exec db sh -c "psql -U \$POSTGRES_USER \$POSTGRES_DB -c \"UPDATE users SET is_active = false WHERE email = 'cliente@email.com'\""
```

## Passo 9 — Backup (faça no primeiro dia)

```bash
cd /opt/sepol-host
chmod +x deploy/backup.sh           # o Git no Windows costuma perder essa permissão
./deploy/backup.sh /opt/backups     # banco + fotos/anexos; guarda 14 dias
ls -lh /opt/backups
```

Agendar todo dia às 03:00:

```bash
( crontab -l 2>/dev/null; echo "0 3 * * * cd /opt/sepol-host && ./deploy/backup.sh /opt/backups >> /var/log/sepol-backup.log 2>&1" ) | crontab -
```

**Copie os backups para fora da VPS** (outro servidor, Google Drive, S3...). Backup só na mesma máquina não protege
contra perda do servidor.

**Restaurar o banco** (em um banco vazio):

```bash
cd /opt/sepol-host
gunzip -c /opt/backups/db_AAAA-MM-DD_HHMM.sql.gz | docker compose -f docker-compose.prod.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

**Restaurar as fotos/anexos:**

```bash
docker run --rm -v sepol-host_uploads:/data -v /opt/backups:/backup alpine tar xzf /backup/uploads_AAAA-MM-DD_HHMM.tar.gz -C /data
```

## Passo 10 — Atualizar o sistema depois

No seu computador: `git add -A && git commit -m "..." && git push`. Na VPS:

```bash
cd /opt/sepol-host
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs --tail=50 api
```

As migrations do banco rodam sozinhas na subida, e os dados (volumes) e o `.env` são preservados. **Faça um backup
antes de atualizações que mexam no banco.**

Para voltar a uma versão anterior: `git log --oneline` → `git checkout CODIGO-DO-COMMIT` → `up -d --build`
(migrations já aplicadas não são desfeitas).

---

## Levando os dados que você já tem (banco local → VPS)

Se já existem dados no seu Postgres local, faça **antes** de criar outros clientes:

1. No computador, exporte o banco: `docker exec sepol-db pg_dump -U sepol sepol_host > dados.sql` (ajuste usuário e nome do banco se forem outros).
2. Suba a VPS normalmente (passos 1–6). Depois pare a API (`docker compose -f docker-compose.prod.yml stop api`), limpe o banco novo
   (`docker compose -f docker-compose.prod.yml exec db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'`),
   importe o `dados.sql` (mesmo comando da restauração do passo 9) e suba a API de novo (`up -d`). As migrations pendentes rodam sozinhas.
3. A migration `016_multi_tenant_owner` atribui todos os dados existentes ao **administrador mais antigo** — o
   usuário que já existia nesse banco. Confirme que você consegue entrar com ele.
4. Copie as fotos/anexos da pasta de uploads do seu computador para o volume `uploads` (mesmo comando de restauração das fotos, com um `.tar.gz` dela).

---

## Problemas comuns

| Sintoma | Causa provável e solução |
| ------- | ------------------------ |
| Site não abre / erro de certificado | O DNS ainda não aponta para a VPS, ou as portas 80/443 estão bloqueadas (firewall da VPS ou do provedor). Veja `logs web`. |
| `api` reinicia sozinha; log mostra "Configuração insegura para produção" | O `.env` ainda tem valor de exemplo (`JWT_SECRET`, `ADMIN_PASSWORD`). Corrija e rode `up -d`. |
| `api` mostra "Variáveis de ambiente inválidas" | Falta uma variável obrigatória ou ela está no formato errado; o log diz qual. |
| Erro 502 ao abrir o site | A API ainda está subindo ou caiu. Veja `logs api`. |
| Login funciona mas volta para a tela de login | Acessando por `http://` em vez de `https://` (o cookie de sessão só trafega em HTTPS). |
| "Esqueci minha senha" não envia e-mail | `SMTP_*` vazio ou incorreto; veja `logs api` (o erro de envio aparece lá). |
| `permission denied` no `backup.sh` | `chmod +x deploy/backup.sh` |
| `git pull` reclama de alterações locais | Não edite arquivos do projeto na VPS; se editou, `git stash` e depois `git pull`. |

Comandos úteis (sempre dentro de `/opt/sepol-host`):

- `docker compose -f docker-compose.prod.yml ps` — status dos serviços
- `docker compose -f docker-compose.prod.yml logs --tail=100 api` — últimos logs da API
- `docker compose -f docker-compose.prod.yml restart api` — reinicia a API
- `docker compose -f docker-compose.prod.yml down` — para tudo **sem** apagar os dados (nunca use `down -v`: apaga os volumes)

## Segurança — resumo

- Só as portas 22 (SSH), 80 e 443 ficam abertas; a API (3333) e o banco (5432) nunca são publicados.
- Login limitado a 10 tentativas / 15 min por IP; cadastro a 5 / hora por IP.
- Fotos de documento e anexos só são entregues ao dono do registro.
- Mantenha o servidor atualizado (`apt update && apt upgrade`), o `.env` fora do Git e os backups fora da VPS.
- Considere desativar o login SSH por senha (usar só chave) e criar um usuário comum em vez de usar `root`.
